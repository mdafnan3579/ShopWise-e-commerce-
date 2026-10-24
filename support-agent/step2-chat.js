// STEP 2 — A chat that remembers the conversation.
// Run: npm run step2      (type "exit" to quit)
//
// What you learn:
//   - Claude has NO memory between requests. Every request must contain the whole conversation.
//   - So we keep a `messages` array and add to it every turn: user, assistant, user, assistant...
//   - Try it: say "My name is Sam", then ask "What's my name?". Then try deleting the line marked ★
//     below and ask again: Claude forgets, because it never saw its own earlier answer.

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import readline from 'node:readline/promises';

const client = new Anthropic();
const MODEL = process.env.MODEL || 'claude-opus-5-5';
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

// The memory of the conversation. It starts empty and grows every turn.
const messages = [];

console.log('Chat with Claude. Type "exit" to quit.\n');

while (true) {
  // If the input closes (Ctrl+C / Ctrl+D), treat it like typing "exit".
  const userText = (await rl.question('You: ').catch(() => 'exit')).trim();
  if (userText === 'exit') break;
  if (!userText) continue;

  // 1. Add what the user said.
  messages.push({ role: 'user', content: userText });

  // 2. Send the WHOLE conversation, not just the last message.
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: 'low' },
    messages,
  });

  // 3. Add Claude's reply to the memory too, exactly as it came back. ★
  messages.push({ role: 'assistant', content: response.content });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
  console.log(`\nClaude: ${text}\n`);

  // Watch this number grow: every turn re-sends the full history, so long chats cost more.
  console.log(`(input tokens this turn: ${response.usage.input_tokens})\n`);
}

rl.close();
