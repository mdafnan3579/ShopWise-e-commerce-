import { logger } from '../../config/logger.js';
import {
  ChatSession,
  GUEST_SESSION_TTL_DAYS,
  MAX_STORED_MESSAGES,
} from '../../models/ChatSession.js';
import { Product } from '../../models/Product.js';
import { getCategories } from '../../services/product.service.js';
import { PRODUCT_CARD_FIELDS } from '../../services/user.service.js';
import { AppError } from '../../utils/AppError.js';
import {
  AIUnavailableError,
  MODELS,
  isAIAvailable,
  logUsage,
  streamMessage,
  toAIUnavailable,
} from '../client.js';
import { chatSystemPrompt } from '../prompts/chat.js';
import { CHAT_TOOLS, runTool } from '../tools/index.js';

const FEATURE = 'chat';
const STORE_NAME = 'ShopWise';
const MAX_TOOL_ROUNDS = 6; // bounds cost and latency of one turn
const MAX_TOKENS_PER_ROUND = 1024;
const HISTORY_MESSAGES = 20; // context sent to the model per turn
const DAY_MS = 24 * 60 * 60 * 1000;

const FALLBACK_REPLY =
  "Sorry, our shopping assistant is unavailable right now. Here are some of our customers' top-rated products in the meantime. You can also use the search bar to browse the catalog.";
const ROUND_LIMIT_REPLY =
  'I looked through several options but could not settle on an answer. Could you tell me a bit more about what you need?';

let systemPromptCache;
async function getSystemPrompt() {
  systemPromptCache ??= chatSystemPrompt({
    storeName: STORE_NAME,
    categories: await getCategories(),
  });
  return systemPromptCache;
}

function ownerFilter({ userId, guestId }) {
  return userId ? { user: userId } : { guestId, user: { $exists: false } };
}

/**
 * Loads a session the caller owns, or creates a new one. Another person's session is reported
 * as not found.
 */
export async function getOrCreateSession({ sessionId, userId, guestId }) {
  if (sessionId) {
    const session = await ChatSession.findOne({
      _id: sessionId,
      ...ownerFilter({ userId, guestId }),
    });
    if (!session) throw AppError.notFound('Chat session');
    return session;
  }
  return ChatSession.create(
    userId
      ? { user: userId }
      : { guestId, expiresAt: new Date(Date.now() + GUEST_SESSION_TTL_DAYS * DAY_MS) },
  );
}

export async function getSession({ sessionId, userId, guestId }) {
  const session = await ChatSession.findOne({ _id: sessionId, ...ownerFilter({ userId, guestId }) })
    .populate({ path: 'messages.productIds', select: PRODUCT_CARD_FIELDS })
    .lean();
  if (!session) throw AppError.notFound('Chat session');
  return session;
}

export async function deleteSession({ sessionId, userId, guestId }) {
  const result = await ChatSession.deleteOne({
    _id: sessionId,
    ...ownerFilter({ userId, guestId }),
  });
  if (result.deletedCount === 0) throw AppError.notFound('Chat session');
}

async function loadProductCards(ids) {
  if (!ids.length) return [];
  const products = await Product.find({ _id: { $in: ids }, isActive: true })
    .select(PRODUCT_CARD_FIELDS)
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

async function topRatedCards(limit = 4) {
  return Product.find({ isActive: true, stock: { $gt: 0 } })
    .select(PRODUCT_CARD_FIELDS)
    .sort({ averageRating: -1, reviewCount: -1 })
    .limit(limit)
    .lean();
}

async function persistTurn(session, userMessage, assistantText, productIds) {
  await ChatSession.updateOne(
    { _id: session._id },
    {
      $push: {
        messages: {
          $each: [
            { role: 'user', content: userMessage },
            { role: 'assistant', content: assistantText.slice(0, 8000) || '…', productIds },
          ],
          $slice: -MAX_STORED_MESSAGES,
        },
      },
      ...(session.expiresAt && {
        expiresAt: new Date(Date.now() + GUEST_SESSION_TTL_DAYS * DAY_MS),
      }),
    },
  );
}

/**
 * Runs one assistant turn and streams it as Server-Sent Events via `send(event, data)`.
 *
 * Loop: stream a model response → if it asks for tools, run them against the database and send
 * the results back → repeat until it answers (max MAX_TOOL_ROUNDS). Text deltas are forwarded
 * as they arrive. Never throws: failures become an `error` event plus a non-AI fallback reply.
 *
 * Events: text {delta} · tool {name, status} · products {products} · action {type, ...} ·
 * error {code, message} · done {usage}
 *
 * `action` events ask the UI for a button the customer must click (e.g. confirm a
 * cancellation); the assistant itself never changes an order.
 */
export async function runChatTurn({ session, message, userId, signal, send, log = logger }) {
  const context = { userId, seenProductIds: new Set(), displayedProductIds: [], actions: [], log };
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  let assistantText = '';

  const appendText = (delta) => {
    assistantText += delta;
    send('text', { delta });
  };
  // Text from a new round ("Let me look…" → tools → answer) starts on a new paragraph.
  const paragraphBreak = () => (assistantText && !/\s$/.test(assistantText) ? '\n\n' : '');
  const emitText = (text) => appendText(paragraphBreak() + text);

  try {
    if (!isAIAvailable()) throw new AIUnavailableError(undefined, 'disabled');

    const history = session.messages.slice(-HISTORY_MESSAGES).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const messages = [...history, { role: 'user', content: message }];
    const system = [
      { type: 'text', text: await getSystemPrompt(), cache_control: { type: 'ephemeral' } },
    ];

    let finished = false;
    for (let round = 1; round <= MAX_TOOL_ROUNDS && !finished; round += 1) {
      const started = Date.now();
      let roundHasText = false;

      const stream = streamMessage(
        {
          model: MODELS.main,
          max_tokens: MAX_TOKENS_PER_ROUND,
          system,
          tools: CHAT_TOOLS,
          messages,
          output_config: { effort: 'low' }, // chat: fast, concise turns
        },
        { signal },
      );
      stream.on('text', (delta) => {
        appendText(roundHasText ? delta : paragraphBreak() + delta);
        roundHasText = true;
      });

      let response;
      try {
        response = await stream.finalMessage();
      } catch (err) {
        throw toAIUnavailable(err, FEATURE);
      }

      usage.inputTokens += response.usage?.input_tokens ?? 0;
      usage.outputTokens += response.usage?.output_tokens ?? 0;
      usage.cacheReadTokens += response.usage?.cache_read_input_tokens ?? 0;
      logUsage({
        feature: FEATURE,
        model: response.model ?? MODELS.main,
        usage: response.usage,
        latencyMs: Date.now() - started,
        stopReason: response.stop_reason,
        userId,
        rounds: round,
      });

      if (response.stop_reason === 'refusal') {
        emitText(
          "I'm sorry, I can't help with that. I'm happy to help you find something in our store, though!",
        );
        break;
      }

      const toolUses = response.content.filter((block) => block.type === 'tool_use');
      // A tool call cut off by max_tokens may have truncated input: never run it.
      if (toolUses.length === 0 || response.stop_reason === 'max_tokens') {
        finished = true;
        break;
      }

      messages.push({ role: 'assistant', content: response.content });
      toolUses.forEach((t) => send('tool', { name: t.name, status: 'running' }));
      // Parallel tool calls run concurrently; all results go back in ONE user message.
      const results = await Promise.all(toolUses.map((t) => runTool(t, context)));
      messages.push({ role: 'user', content: results });
    }

    if (!finished && !assistantText.trim()) emitText(ROUND_LIMIT_REPLY);

    const products = await loadProductCards(context.displayedProductIds);
    if (products.length) send('products', { products });
    context.actions.forEach((action) => send('action', action));

    await persistTurn(
      session,
      message,
      assistantText,
      products.map((p) => p._id),
    );
    send('done', { sessionId: String(session._id), usage });
  } catch (err) {
    if (!signal?.aborted) {
      log.warn({ err: { message: err.message, reason: err.reason } }, 'Chat turn fell back');
    }

    send('error', {
      code: 'AI_UNAVAILABLE',
      message: 'The assistant is unavailable right now. Showing top-rated products instead.',
    });
    const products = await topRatedCards().catch(() => []);
    if (!assistantText) emitText(FALLBACK_REPLY);
    if (products.length) send('products', { products });

    await persistTurn(
      session,
      message,
      assistantText,
      products.map((p) => p._id),
    ).catch((persistErr) => log.error({ err: persistErr }, 'Failed to persist chat turn'));
    send('done', { sessionId: String(session._id), usage, fallback: true });
  }
}
