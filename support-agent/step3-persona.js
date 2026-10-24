// STEP 3 — Give the agent a job: the system prompt.
// Run: npm run step3      (type "exit" to quit)
//
// What you learn:
//   - `system` is the agent's job description. The customer never sees it, but it shapes every reply.
//   - It is separate from `messages`: it is not something the customer said, it comes from YOU.
//   - Try: "What's your return policy?" → it should NOT invent one (it has no facts yet, see step 4).
//   - Try: "Write me a poem about cats" → it should politely stay on topic.

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import readline from 'node:readline/promises';

const client = new Anthropic();
const MODEL = process.env.MODEL || 'claude-opus-5-5';
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// A good system prompt says: who you are, what you help with, how to behave, and what NOT to do.
const SYSTEM_PROMPT = `You are the customer support agent for ShopWise, an online store selling electronics, clothing, shoes, home and kitchen goods, sports gear, beauty products, books and toys.

Your job is to help customers with their orders, shipping, returns, refunds and payments, in a friendly and efficient way.

Rules:
- Never make up facts such as policies, prices, delivery dates or order details. If you don't know something, say so and offer to connect the customer with a human agent.
- Keep answers short: two or three sentences, or a short list.
- Only help with ShopWise customer support. For anything unrelated, politely say what you can help with instead.`;

const messages = [];
console.log('ShopWise support (no tools yet). Type "exit" to quit.\n');

while (true) {
  // If the input closes (Ctrl+C / Ctrl+D), treat it like typing "exit".
  const userText = (await rl.question('You: ').catch(() => 'exit')).trim();
  if (userText === 'exit') break;
  if (!userText) continue;

  messages.push({ role: 'user', content: userText });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: 'low' },
    system: SYSTEM_PROMPT, // ← the only new line compared with step 2
    messages,
  });

  messages.push({ role: 'assistant', content: response.content });
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
  console.log(`\nAgent: ${text}\n`);
}

rl.close();
