// STEP 5 — The agent loop: keep going until Claude is done.
// Run: npm run step5      (type "exit" to quit)
//
// What you learn:
//   - Step 4 handled exactly one tool call by hand. Real questions may need several
//     ("What's your shipping cost and can I cancel?" → two policy lookups).
//   - So we LOOP: ask Claude → if it wants tools, run them all and send the results → ask again →
//     stop when stop_reason is "end_turn". That loop is what makes it an "agent".
//   - A round limit stops a confused agent from looping (and spending) forever.

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import readline from 'node:readline/promises';
import { POLICIES, POLICY_TOPICS } from './lib/policies.js';

const client = new Anthropic();
const MODEL = process.env.MODEL || 'claude-opus-5-5';
const MAX_ROUNDS = 6;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const SYSTEM_PROMPT = `You are the customer support agent for ShopWise, an online store.
Answer questions about store rules only from what the get_store_policy tool returns. Never invent policies.
If a question needs several policies, look up each one. Keep answers short and friendly.`;

const tools = [
  {
    name: 'get_store_policy',
    description:
      'Look up an official ShopWise support policy. Use it before answering any question about shipping, ' +
      'returns, refunds, payments, cancellations, order statuses or how to contact support.',
    input_schema: {
      type: 'object',
      properties: { topic: { type: 'string', enum: POLICY_TOPICS } },
      required: ['topic'],
      additionalProperties: false,
    },
    strict: true,
  },
];

// Tool name → the function that runs it. Adding a tool later = one entry here + one in `tools`.
const handlers = {
  get_store_policy: ({ topic }) => POLICIES[topic] ?? `No policy found for "${topic}".`,
};

/** Runs one customer turn: loops until Claude has a final answer. Returns the answer text. */
async function runTurn(messages) {
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium' }, // multi-step tool work: a bit more thinking than plain chat
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    // Always keep Claude's reply in the history, exactly as received.
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason !== 'tool_use') {
      // "end_turn" = finished. ("max_tokens" / "refusal" also end the turn; step 7 handles them nicely.)
      return response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');
    }

    // Claude may ask for several tools at once. Run them all, then send ALL results in ONE message.
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      console.log(`  [tool] ${block.name}(${JSON.stringify(block.input)})`);
      const handler = handlers[block.name];
      const result = handler ? handler(block.input) : `Unknown tool: ${block.name}`;
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: result,
        is_error: !handler,
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }
  return 'Sorry, I could not finish that. Could you rephrase your question?';
}

const messages = [];
console.log('ShopWise support (policy tool). Type "exit" to quit.\n');

while (true) {
  // If the input closes (Ctrl+C / Ctrl+D), treat it like typing "exit".
  const userText = (await rl.question('You: ').catch(() => 'exit')).trim();
  if (userText === 'exit') break;
  if (!userText) continue;

  messages.push({ role: 'user', content: userText });
  console.log(`\nAgent: ${await runTurn(messages)}\n`);
}

rl.close();
