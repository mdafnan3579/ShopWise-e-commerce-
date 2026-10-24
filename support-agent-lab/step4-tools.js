// STEP 4 — Your first TOOL. This is what turns a chatbot into an AGENT.
// Run: npm run step4      (try: "Where is my order SW-1001?")
//
// What you learn:
//  1. You DESCRIBE a tool to Claude (name + description + input schema).
//  2. Claude can't run code. It ASKS you to run the tool (stop_reason = "tool_use").
//  3. YOUR code runs the function and sends the result back.
//  4. Repeat until Claude gives a final answer. That repeat is "the agent loop".

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import readline from 'node:readline/promises';

const client = new Anthropic();
const MODEL = process.env.MODEL ?? 'claude-opus-5-5';

// ---------------------------------------------------------------------------
// Fake database. In the real ShopWise app this would be MongoDB.
// ---------------------------------------------------------------------------
const ORDERS = {
  'SW-1001': { status: 'shipped', items: ['Aurora Wireless Headphones'], tracking: 'UPS 1Z999AA10123456784' },
  'SW-1002': { status: 'pending', items: ['Cork Yoga Mat', 'Steel Water Bottle'], tracking: null },
  'SW-1003': { status: 'delivered', items: ['Cast Iron Dutch Oven'], tracking: 'USPS 9400111899223' },
};

// ---------------------------------------------------------------------------
// 1. DESCRIBE the tool. Claude reads the description to decide WHEN to use it,
//    and the input_schema (JSON Schema) to know WHAT to send.
// ---------------------------------------------------------------------------
const tools = [
  {
    name: 'get_order_status',
    description:
      'Look up the status, items and tracking number of a ShopWise order. ' +
      'Use this whenever the customer asks about an order, delivery or tracking.',
    input_schema: {
      type: 'object',
      properties: {
        orderNumber: { type: 'string', description: 'The order number, e.g. SW-1001' },
      },
      required: ['orderNumber'],
    },
  },
];

// ---------------------------------------------------------------------------
// 2. The REAL code that runs when Claude asks for a tool.
//    Always return a string (JSON is fine). Claude reads it like a document.
// ---------------------------------------------------------------------------
function runTool(name, input) {
  if (name === 'get_order_status') {
    const order = ORDERS[input.orderNumber.toUpperCase()];
    return order ? JSON.stringify(order) : `No order found with number ${input.orderNumber}.`;
  }
  return `Unknown tool: ${name}`;
}

const SYSTEM = `You are the customer support agent for ShopWise, an online store.
Be friendly and brief. Use your tools to look up real data; never guess order details.
If the customer hasn't given an order number, ask for it.`;

// ---------------------------------------------------------------------------
// 3. THE AGENT LOOP — keeps going until Claude stops asking for tools.
// ---------------------------------------------------------------------------
async function agentTurn(messages) {
  while (true) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'low' },
      system: SYSTEM,
      tools, // ← tell Claude which tools exist
      messages,
    });

    // Always save Claude's reply (including its tool requests) to the history
    messages.push({ role: 'assistant', content: response.content });

    // Not asking for a tool? Then this is the final answer.
    if (response.stop_reason !== 'tool_use') {
      return response.content.find((b) => b.type === 'text')?.text ?? '(no reply)';
    }

    // Claude asked for one or more tools. Run each one…
    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      console.log(`   🔧 Claude called ${block.name}(${JSON.stringify(block.input)})`);
      const result = runTool(block.name, block.input);
      console.log(`   📦 Result: ${result}`);
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
    }

    // …and send ALL results back together in ONE user message. Then loop again.
    messages.push({ role: 'user', content: toolResults });
  }
}

// ---------------------------------------------------------------------------
// Chat in the terminal (same as step 3)
// ---------------------------------------------------------------------------
const messages = [];
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log('ShopWise support agent (type "exit" to quit). Try: "Where is my order SW-1001?"\n');

while (true) {
  const input = await rl.question('You: ');
  if (input.trim() === 'exit') break;
  messages.push({ role: 'user', content: input });
  console.log('Agent:', await agentTurn(messages), '\n');
}
rl.close();

// EXPERIMENTS:
//  - Ask "Where's my order?" without a number → it should ask you for one.
//  - Ask "Compare orders SW-1001 and SW-1002" → watch it call the tool TWICE.
//  - Ask about SW-9999 → it should say it can't find it, not make something up.
