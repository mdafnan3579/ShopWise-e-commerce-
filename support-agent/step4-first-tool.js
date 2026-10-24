// STEP 4 — Your first tool: Claude asks, YOUR code answers.
// Run: npm run step4
//
// What you learn:
//   - A "tool" is a function in your code. You describe it to Claude (name, description, inputs).
//   - Claude never runs your code. When it needs the tool it replies with a `tool_use` block that says
//     "please run get_store_policy with { topic: 'returns' }", and stops (stop_reason: "tool_use").
//   - You run the function, send the result back as a `tool_result`, and Claude writes the final answer.
//   - This file does that ONE round by hand, printing every stage, so you can see the mechanics.

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { POLICIES, POLICY_TOPICS } from './lib/policies.js';

const client = new Anthropic();
const MODEL = process.env.MODEL || 'claude-opus-5-5';

const SYSTEM_PROMPT = `You are the customer support agent for ShopWise, an online store.
Answer questions about store rules only from what the get_store_policy tool returns. Never invent policies.
Keep answers short and friendly.`;

// ① Describe the tool. Claude only sees this description, never your code, so make it clear.
const policyTool = {
  name: 'get_store_policy',
  description:
    'Look up an official ShopWise support policy. Use it before answering any question about shipping, ' +
    'returns, refunds, payments, cancellations, order statuses or how to contact support.',
  input_schema: {
    type: 'object',
    properties: {
      topic: { type: 'string', enum: POLICY_TOPICS, description: 'Which policy to look up.' },
    },
    required: ['topic'],
    additionalProperties: false,
  },
  strict: true, // guarantees Claude's input matches the schema exactly
};

// ② The real function behind the tool. Plain JavaScript, nothing AI about it.
function getStorePolicy({ topic }) {
  return POLICIES[topic] ?? `No policy found for "${topic}".`;
}

const question = 'Hi, I bought shoes last week and they are too small. Can I send them back?';
const messages = [{ role: 'user', content: question }];
console.log('Customer:', question, '\n');

// ③ First request: Claude sees the question AND the tool list.
const first = await client.messages.create({
  model: MODEL,
  max_tokens: 16000,
  output_config: { effort: 'low' },
  system: SYSTEM_PROMPT,
  tools: [policyTool],
  messages,
});

console.log('stop_reason:', first.stop_reason); // expect "tool_use": Claude is waiting for us
const toolUse = first.content.find((block) => block.type === 'tool_use');
if (!toolUse) {
  console.log('Claude answered without the tool:', first.content.find((b) => b.type === 'text')?.text);
  process.exit(0);
}
console.log('Claude asks to run:', toolUse.name, toolUse.input, ` (id ${toolUse.id})\n`);

// ④ WE run the tool.
const result = getStorePolicy(toolUse.input);
console.log('Our code returns:', result, '\n');

// ⑤ Send everything back: Claude's tool request (exactly as received) + our result.
//    `tool_use_id` links the result to the request it answers.
messages.push({ role: 'assistant', content: first.content });
messages.push({
  role: 'user',
  content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: result }],
});

const second = await client.messages.create({
  model: MODEL,
  max_tokens: 16000,
  output_config: { effort: 'low' },
  system: SYSTEM_PROMPT,
  tools: [policyTool],
  messages,
});

console.log('stop_reason:', second.stop_reason); // expect "end_turn": Claude is done
console.log('Agent:', second.content.find((block) => block.type === 'text')?.text);
