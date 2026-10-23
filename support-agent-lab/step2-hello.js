// STEP 2 — Your very first message to Gemini.
// Run: npm run step2
//
// What you learn: a request is just a model name + your message ("contents").
// The reply comes back as a response object; response.text is the answer.

import 'dotenv/config'; // loads GEMINI_API_KEY and MODEL from the .env file
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.generateContent({
  model: process.env.MODEL ?? 'gemini-3.8-flash',
  contents: 'Hi! In 3 bullet points, what can a customer support agent help with?',
});

console.log(response.text);

// Try uncommenting this to see the full raw response (useful for learning!):
// console.dir(response, { depth: null });

// How many tokens (≈ word pieces) were used:
const usage = response.usageMetadata;
console.log('\nTokens used:', usage?.promptTokenCount, 'in,', usage?.candidatesTokenCount, 'out');
