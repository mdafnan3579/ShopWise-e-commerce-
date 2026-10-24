// The agent loop from step 5, moved here so steps 6 and 7 can reuse it, plus three upgrades:
//   1. Every way a reply can end is handled (finished, cut off, refused, needs tools).
//   2. A refusal fallback: if Claude declines a request, Anthropic's servers retry it on a fallback model.
//   3. Tool errors are sent back to Claude as errors (is_error: true) instead of crashing the program.

// Server-side refusal fallback (beta): only these models support `fallbacks: "default"`.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-opus-5', 'claude-fable-5-1']);

/** One request to Claude, with the refusal fallback switched on when the model supports it. */
export function askClaude(client, params) {
  if (FALLBACK_MODELS.has(params.model)) {
    return client.beta.messages.create({ ...params, betas: [FALLBACK_BETA], fallbacks: 'default' });
  }
  return client.messages.create(params);
}

/** All text blocks of a reply joined together (thinking and tool blocks are skipped). */
export function replyText(response) {
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

/**
 * Runs one customer turn: asks Claude, runs any tools it requests, and repeats until it answers.
 * `messages` is the conversation; this function appends to it, so the caller keeps the memory.
 *
 * @param {object} options
 * @param {import('@anthropic-ai/sdk').default} options.client
 * @param {string} options.model
 * @param {string} options.system  The system prompt.
 * @param {Array<{ definition: object, run: (input: object) => Promise<string> | string }>} options.tools
 * @param {Array<object>} options.messages
 * @param {number} [options.maxRounds]  Safety limit on Claude ↔ tools round trips per turn.
 * @param {(line: string) => void} [options.log]  Where to print tool activity.
 * @returns {Promise<string>} The agent's answer for the customer.
 */
export async function runAgentTurn({ client, model, system, tools, messages, maxRounds = 8, log = () => {} }) {
  const toolsByName = new Map(tools.map((tool) => [tool.definition.name, tool]));

  for (let round = 1; round <= maxRounds; round++) {
    const response = await askClaude(client, {
      model,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      system,
      tools: tools.map((tool) => tool.definition),
      messages,
    });

    // Keep the reply exactly as received (it may include thinking blocks the API needs back).
    messages.push({ role: 'assistant', content: response.content });

    switch (response.stop_reason) {
      case 'tool_use':
        messages.push({ role: 'user', content: await runTools(response.content, toolsByName, log) });
        continue; // go round again with the results

      case 'pause_turn': // the server paused a long turn; sending the history back resumes it
        continue;

      case 'max_tokens':
        return `${replyText(response)}\n\n(My reply was cut off. Ask me to continue.)`;

      case 'refusal':
        return "Sorry, I can't help with that request. I can help with orders, shipping, returns, refunds and payments.";

      default: // "end_turn": Claude is done
        return replyText(response) || 'Is there anything else I can help you with?';
    }
  }
  return "Sorry, I couldn't finish that. Could you tell me a bit more about what you need?";
}

/** Runs every tool Claude asked for and returns ALL results for ONE user message. */
async function runTools(content, toolsByName, log) {
  const results = [];
  for (const block of content) {
    if (block.type !== 'tool_use') continue;
    const tool = toolsByName.get(block.name);
    log(`[tool] ${block.name}(${JSON.stringify(block.input)})`);

    let output;
    let isError = false;
    try {
      if (!tool) throw new Error(`Unknown tool: ${block.name}`);
      output = await tool.run(block.input);
    } catch (err) {
      // Claude reads the error and can recover: retry, ask the customer, or explain the problem.
      output = `Error: ${err.message}`;
      isError = true;
    }
    log(`       → ${isError ? 'ERROR ' : ''}${output.length > 160 ? `${output.slice(0, 160)}…` : output}`);
    results.push({ type: 'tool_result', tool_use_id: block.id, content: output, is_error: isError });
  }
  return results;
}
