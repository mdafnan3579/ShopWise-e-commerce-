// STEP 7 — The complete customer support agent.
// Run: npm run step7  (or: npm start)      needs the ShopWise backend on localhost:5000; "exit" to quit
//
// What's new compared with step 6:
//   - A full "training manual" system prompt (lib/prompt.js).
//   - An ACTION tool, cancel_order, guarded by an approval gate: your code asks the customer
//     "Cancel order …? (yes/no)" before anything changes, whatever the AI decided.
//   - A HANDOFF tool, create_support_ticket: refunds, returns, damage and angry customers go to humans.
//     Tickets are saved in tickets.json next to this file; open it to read them.
//   - Try: "I want to return my headphones", "Cancel my unpaid order", "This is ridiculous, I want a refund!"

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { runAgentTurn } from './lib/agent.js';
import { supportSystemPrompt } from './lib/prompt.js';
import { ShopWiseClient } from './lib/shopwise.js';
import { cancelOrderTool, orderTools, policyTool, supportTicketTool } from './lib/tools.js';

const client = new Anthropic();
const MODEL = process.env.MODEL || 'claude-opus-5-5';
const TICKETS_FILE = fileURLToPath(new URL('./tickets.json', import.meta.url));
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const shopwise = new ShopWiseClient({
  email: process.env.SHOPWISE_EMAIL,
  password: process.env.SHOPWISE_PASSWORD,
});
const customer = await shopwise.login();

/** The approval gate. In a website this would be a "Confirm" button instead of typing yes. */
async function confirm(question) {
  const answer = await rl.question(`\n  ⚠ ${question} Type "yes" to confirm: `).catch(() => 'no');
  return answer.trim().toLowerCase() === 'yes';
}

const tools = [
  policyTool,
  ...orderTools(shopwise),
  cancelOrderTool(shopwise, confirm),
  supportTicketTool({ file: TICKETS_FILE, customer }),
];
const system = supportSystemPrompt(customer);
const messages = [];

console.log(`ShopWise support. Logged in as ${customer.name} (${customer.email}). Type "exit" to quit.\n`);

while (true) {
  // If the input closes (Ctrl+C / Ctrl+D), treat it like typing "exit".
  const userText = (await rl.question('You: ').catch(() => 'exit')).trim();
  if (userText === 'exit') break;
  if (!userText) continue;

  const historyLength = messages.length;
  messages.push({ role: 'user', content: userText });
  try {
    const answer = await runAgentTurn({
      client,
      model: MODEL,
      system,
      tools,
      messages,
      log: (line) => console.log(`  ${line}`),
    });
    console.log(`\nSky: ${answer}\n`);
  } catch (err) {
    // Network/API problems (no credit, Claude overloaded…). Roll the conversation back to before
    // this turn so it stays valid, then let the customer try again.
    messages.length = historyLength;
    console.log(`\n(Support is unavailable right now: ${err.message})\n`);
  }
}

rl.close();
