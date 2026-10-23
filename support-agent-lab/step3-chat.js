// STEP 3 — A chat with a job description (system instruction) and a memory (history).
// Run: npm run step3      (type "exit" to quit)
//
// What you learn:
//  1. The SYSTEM INSTRUCTION tells Gemini who it is and what rules to follow.
//  2. Gemini does NOT remember previous calls. You keep the conversation in an
//     array and send the whole thing every time.
//     Each entry looks like { role: 'user' | 'model', parts: [{ text: '...' }] }.

import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';
import readline from 'node:readline/promises';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.MODEL ?? 'gemini-3.8-flash';

const SYSTEM = `You are the customer support agent for ShopWise, an online store.
Be friendly and brief (2-4 sentences).

Store policies:
- Free shipping on orders over $75, otherwise $5.99. Delivery takes 3-5 business days.
- Returns accepted within 30 days of delivery, unused items only.

If you don't know something, say so honestly. Never invent order details.`;

const history = []; // ← the conversation history ("memory")
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log('ShopWise support (type "exit" to quit)\n');

while (true) {
  const input = await rl.question('You: ');
  if (input.trim() === 'exit') break;

  // 1. Add the customer's message to the history
  history.push({ role: 'user', parts: [{ text: input }] });

  // 2. Send the WHOLE history to Gemini
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: history,
    config: { systemInstruction: SYSTEM },
  });

  // 3. Add Gemini's reply to the history (role "model"), so the next turn remembers it
  history.push(response.candidates[0].content);

  console.log('Agent:', response.text, '\n');
}

rl.close();

// EXPERIMENT: comment out step 3 (the model push) and ask a follow-up
// question like "and how long does that take?" — notice it loses context.
