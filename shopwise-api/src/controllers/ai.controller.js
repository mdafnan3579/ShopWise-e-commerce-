import { randomUUID } from 'node:crypto';
import * as chatService from '../ai/services/chat.service.js';
import { generateProductCopy } from '../ai/services/descriptionGenerator.service.js';
import { naturalLanguageSearch } from '../ai/services/nlSearch.service.js';
import { getRecommendations } from '../ai/services/recommendations.service.js';
import { getReviewSummary } from '../ai/services/reviewSummary.service.js';
import { env } from '../config/env.js';
import { GUEST_SESSION_TTL_DAYS } from '../models/ChatSession.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { openEventStream } from '../utils/sse.js';

const GUEST_COOKIE = 'sw_guest';
const CHAT_TIMEOUT_MS = 90_000; // hard ceiling for one streamed turn, including tool rounds

/** Anonymous, httpOnly id that ties guest chat sessions to one browser. */
function resolveIdentity(req, res) {
  if (req.user) return { userId: req.user.id };

  let guestId = req.cookies?.[GUEST_COOKIE];
  if (!guestId || !/^[0-9a-f-]{36}$/.test(guestId)) {
    guestId = randomUUID();
    res.cookie(GUEST_COOKIE, guestId, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: env.COOKIE_SAMESITE,
      path: '/api/v1/ai',
      maxAge: GUEST_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    });
  }
  return { guestId };
}

/**
 * POST /ai/chat: streams one assistant turn as Server-Sent Events.
 * Session ownership is checked BEFORE the stream opens, so those failures are normal JSON
 * errors. After that, problems are reported as `error` events inside the stream.
 */
export async function chat(req, res) {
  const { message, sessionId } = req.validated.body;
  const identity = resolveIdentity(req, res);
  const session = await chatService.getOrCreateSession({ sessionId, ...identity });

  // Stop paying for tokens nobody will read: abort the model call if the client disconnects.
  const disconnect = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) disconnect.abort();
  });
  const signal = AbortSignal.any([disconnect.signal, AbortSignal.timeout(CHAT_TIMEOUT_MS)]);

  const stream = openEventStream(res);
  stream.send('session', { sessionId: String(session._id) });
  try {
    await chatService.runChatTurn({
      session,
      message,
      userId: identity.userId,
      signal,
      send: stream.send,
      log: req.log,
    });
  } finally {
    stream.close();
  }
}

export async function getChatSession(req, res) {
  const session = await chatService.getSession({
    sessionId: req.validated.params.id,
    ...resolveIdentity(req, res),
  });
  sendSuccess(res, { data: session });
}

export async function deleteChatSession(req, res) {
  await chatService.deleteSession({
    sessionId: req.validated.params.id,
    ...resolveIdentity(req, res),
  });
  sendSuccess(res, { message: 'Conversation deleted' });
}

export async function search(req, res) {
  const { query, page, limit } = req.validated.body;
  const { products, meta, ...interpretation } = await naturalLanguageSearch(query, {
    page,
    limit,
    userId: req.user?.id,
  });
  sendSuccess(res, { data: { products, ...interpretation }, meta });
}

export async function reviewSummary(req, res) {
  sendSuccess(res, { data: await getReviewSummary(req.validated.params.id) });
}

export async function generateDescription(req, res) {
  const copy = await generateProductCopy(req.validated.body, { userId: req.user.id });
  sendSuccess(res, { data: copy, message: 'Draft generated. Review it before saving.' });
}

export async function recommendations(req, res) {
  sendSuccess(res, { data: await getRecommendations(req.user?.id) });
}
