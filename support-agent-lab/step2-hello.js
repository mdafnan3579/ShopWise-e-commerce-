// STEP 2 — Your very first message to Claude.
// Run: npm run step2
//
// What you learn: a request is just a model name + a list of messages.
// The reply comes back as a list of "content blocks" (text, tool calls, ...).

import 'dotenv/config'; // loads ANTHROPIC_API_KEY and MODEL from the .env file
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // automatically reads ANTHROPIC_API_KEY

const response = await client.messages.create({
  model: process.env.MODEL ?? 'claude-opus-5-5',
  max_tokens: 16000, // upper limit on how long the reply can be
  output_config: { effort: 'low' }, // simple chat → think less, answer faster and cheaper
  messages: [{ role: 'user', content: 'Hi! In 3 bullet points, what can a customer support agent help with?' }],
});

// The reply may contain several blocks; we only want the text one.
const text = response.content.find((block) => block.type === 'text');
console.log(text?.text);

// Try uncommenting this to see the full raw response (useful for learning!):
// console.dir(response, { depth: null });

// How many tokens (≈ word pieces) you paid for:
console.log('\nTokens used:', response.usage.input_tokens, 'in,', response.usage.output_tokens, 'out');
