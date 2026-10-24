// STEP 3 — A chat with a job description (system prompt) and a memory (history).
// Run: npm run step3      (type "exit" to quit)
//
// What you learn:
//  1. The SYSTEM prompt tells Claude who it is and what rules to follow.
//  2. Claude does NOT remember previous calls. You keep the conversation in an
//     array and send the whole thing every time.

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import readline from 'node:readline/promises';

const client = new Anthropic();
const MODEL = process.env.MODEL ?? 'claude-opus-5-5';

const SYSTEM = `You are the customer support agent for ShopWise, an online store.
Be friendly and brief (2-4 sentences).

Store policies:
- Free shipping on orders over $75, otherwise $5.99. Delivery takes 3-5 business days.
- Returns accepted within 30 days of delivery, unused items only.

If you don't know something, say so honestly. Never invent order details.`;

const messages = []; // ← the conversation history ("memory")
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log('ShopWise support (type "exit" to quit)\n');

while (true) {
  const input = await rl.question('You: ');
  if (input.trim() === 'exit') break;

  // 1. Add the customer's message to the history
  messages.push({ role: 'user', content: input });

  // 2. Send the WHOLE history to Claude
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: 'low' },
    system: SYSTEM,
    messages,
  });

  // 3. Add Claude's reply to the history, so the next turn remembers it
  messages.push({ role: 'assistant', content: response.content });

  console.log('Agent:', response.content.find((b) => b.type === 'text')?.text, '\n');
}

rl.close();

// EXPERIMENT: comment out step 3 (the assistant push) and ask a follow-up
// question like "and how long does that take?" — notice it loses context.
