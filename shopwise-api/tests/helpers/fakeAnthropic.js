import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';

/**
 * Scripted stand-in for the Anthropic client. Tests enqueue responses (or errors) in call order;
 * an unscripted call throws, so an unexpected AI call fails loudly instead of hitting the network.
 */
function createFakeAnthropic() {
  const script = [];

  function next(params, options) {
    const step = script.shift();
    if (step === undefined)
      throw new Error(`fakeAnthropic: unscripted call (model ${params.model})`);
    if (step instanceof Error) throw step;
    return typeof step === 'function' ? step(params, options) : structuredClone(step);
  }

  /** Mimics MessageStream: emits text deltas via on('text'), resolves finalMessage(). */
  function createStream(produce) {
    const textHandlers = [];
    const stream = {
      on(event, handler) {
        if (event === 'text') textHandlers.push(handler);
        return stream;
      },
      async finalMessage() {
        const message = await produce();
        for (const block of message.content) {
          if (block.type !== 'text') continue;
          for (const chunk of block.text.match(/[\s\S]{1,8}/g) ?? []) {
            textHandlers.forEach((handler) => handler(chunk));
          }
        }
        return message;
      },
    };
    return stream;
  }

  const messages = {
    create: vi.fn(async (params, options) => next(params, options)),
    stream: vi.fn((params, options) => createStream(async () => next(params, options))),
  };

  return {
    messages,
    beta: { messages },
    enqueue(...steps) {
      script.push(...steps);
    },
    pending: () => script.length,
    reset() {
      script.length = 0;
      messages.create.mockClear();
      messages.stream.mockClear();
    },
    /** Params of every call (create + stream), in order. */
    get calls() {
      return [...messages.create.mock.calls, ...messages.stream.mock.calls].map(
        ([params]) => params,
      );
    },
  };
}

export const fakeAnthropic = createFakeAnthropic();

const usage = { input_tokens: 120, output_tokens: 40, cache_read_input_tokens: 0 };

export function textResponse(text, overrides = {}) {
  return {
    id: `msg_${randomUUID()}`,
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage,
    ...overrides,
  };
}

export const jsonResponse = (value, overrides) => textResponse(JSON.stringify(value), overrides);

/** @param {Array<{ name: string, input: object }>} toolCalls */
export function toolUseResponse(toolCalls, { text } = {}) {
  return {
    ...textResponse(''),
    content: [
      ...(text ? [{ type: 'text', text }] : []),
      ...toolCalls.map(({ name, input }) => ({
        type: 'tool_use',
        id: `toolu_${randomUUID().slice(0, 8)}`,
        name,
        input,
      })),
    ],
    stop_reason: 'tool_use',
  };
}
