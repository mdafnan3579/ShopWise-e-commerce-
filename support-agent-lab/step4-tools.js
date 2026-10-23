// STEP 4 — Your first TOOL (Gemini calls it "function calling").
// This is what turns a chatbot into an AGENT.
// Run: npm run step4      (try: "Where is my order SW-1001?")
//
// What you learn:
//  1. You DESCRIBE a function to Gemini (name + description + parameters).
//  2. Gemini can't run code. It ASKS you to run the function (response.functionCalls).
//  3. YOUR code runs the function and sends the result back.
//  4. Repeat until Gemini gives a final text answer. That repeat is "the agent loop".

import 'dotenv/config';
import { GoogleGenAI, Type } from '@google/genai';
import readline from 'node:readline/promises';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.MODEL ?? 'gemini-3.8-flash';

// ---------------------------------------------------------------------------
// Fake database. In the real ShopWise app this would be MongoDB.
// ---------------------------------------------------------------------------
const ORDERS = {
  'SW-1001': { status: 'shipped', items: ['Aurora Wireless Headphones'], tracking: 'UPS 1Z999AA10123456784' },
  'SW-1002': { status: 'pending', items: ['Cork Yoga Mat', 'Steel Water Bottle'], tracking: null },
  'SW-1003': { status: 'delivered', items: ['Cast Iron Dutch Oven'], tracking: 'USPS 9400111899223' },
};

// ---------------------------------------------------------------------------
// 1. DESCRIBE the function. Gemini reads the description to decide WHEN to use it,
//    and the parameters schema to know WHAT to send.
// ---------------------------------------------------------------------------
const functionDeclarations = [
  {
    name: 'get_order_status',
    description:
      'Look up the status, items and tracking number of a ShopWise order. ' +
      'Use this whenever the customer asks about an order, delivery or tracking.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        orderNumber: { type: Type.STRING, description: 'The order number, e.g. SW-1001' },
      },
      required: ['orderNumber'],
    },
  },
];

// ---------------------------------------------------------------------------
// 2. The REAL code that runs when Gemini asks for a function.
//    Return a plain object. Gemini reads it like a document.
// ---------------------------------------------------------------------------
function runTool(name, args) {
  if (name === 'get_order_status') {
    const order = ORDERS[String(args.orderNumber).toUpperCase()];
    return order ?? { error: `No order found with number ${args.orderNumber}.` };
  }
  return { error: `Unknown tool: ${name}` };
}

const SYSTEM = `You are the customer support agent for ShopWise, an online store.
Be friendly and brief. Use your tools to look up real data; never guess order details.
If the customer hasn't given an order number, ask for it.`;

// ---------------------------------------------------------------------------
// 3. THE AGENT LOOP — keeps going until Gemini stops asking for functions.
// ---------------------------------------------------------------------------
async function agentTurn(history) {
  while (true) {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: history,
      config: {
        systemInstruction: SYSTEM,
        tools: [{ functionDeclarations }], // ← tell Gemini which functions exist
      },
    });

    // Always save Gemini's reply (including its function requests) to the history
    history.push(response.candidates[0].content);

    // No function calls? Then this is the final answer.
    const calls = response.functionCalls ?? [];
    if (calls.length === 0) return response.text ?? '(no reply)';

    // Gemini asked for one or more functions. Run each one…
    const parts = calls.map((call) => {
      console.log(`   🔧 Gemini called ${call.name}(${JSON.stringify(call.args)})`);
      const result = runTool(call.name, call.args);
      console.log(`   📦 Result: ${JSON.stringify(result)}`);
      return { functionResponse: { id: call.id, name: call.name, response: { result } } };
    });

    // …and send ALL results back together in ONE message. Then loop again.
    history.push({ role: 'user', parts });
  }
}

// ---------------------------------------------------------------------------
// Chat in the terminal (same as step 3)
// ---------------------------------------------------------------------------
const history = [];
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log('ShopWise support agent (type "exit" to quit). Try: "Where is my order SW-1001?"\n');

while (true) {
  const input = await rl.question('You: ');
  if (input.trim() === 'exit') break;
  history.push({ role: 'user', parts: [{ text: input }] });
  console.log('Agent:', await agentTurn(history), '\n');
}
rl.close();

// EXPERIMENTS:
//  - Ask "Where's my order?" without a number → it should ask you for one.
//  - Ask "Compare orders SW-1001 and SW-1002" → watch it call the function TWICE.
//  - Ask about SW-9999 → it should say it can't find it, not make something up.
