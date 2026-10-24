// STEP 1 — Send your very first message to Claude.
// Run: npm run step1
//
// What you learn:
//   - A request to Claude = which model + a list of messages.
//   - The answer comes back as a list of "content blocks". For now we only need the text block.

import 'dotenv/config'; // reads ANTHROPIC_API_KEY and MODEL from the .env file into process.env
import Anthropic from '@anthropic-ai/sdk';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('No API key yet: copy .env.example to .env and paste your key after ANTHROPIC_API_KEY=');
  process.exit(1);
}

// The client finds ANTHROPIC_API_KEY by itself, so we never write the key in code.
const client = new Anthropic();

const response = await client.messages.create({
  model: process.env.MODEL || 'claude-opus-5-5',
  max_tokens: 16000, // the longest reply we allow (a safety limit, not a target)
  output_config: { effort: 'low' }, // a simple question: think less, answer faster and cheaper
  messages: [
    {
      role: 'user',
      content: 'In 3 short bullet points: what does a customer support agent for an online shop do?',
    },
  ],
});

// Print each text block in the reply.
for (const block of response.content) {
  if (block.type === 'text') console.log(block.text);
}

// Tokens are the small word pieces you pay for: "input" is what you sent, "output" is the reply.
console.log('\nTokens used:', response.usage.input_tokens, 'in,', response.usage.output_tokens, 'out');

// Curious what the whole response looks like? Uncomment the next line and run again:
// console.dir(response, { depth: null });
