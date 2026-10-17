import { API_URL, refreshSession } from './api.js';

/** Parses one SSE block (`event: x\ndata: {...}`); comment lines (`: keep-alive`) are skipped. */
export function parseSseBlock(block) {
  let event = null;
  let data = '';
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (!event) return null;
  try {
    return { event, data: data ? JSON.parse(data) : null };
  } catch {
    return null;
  }
}

async function openStream({ message, sessionId, signal }) {
  return fetch(`${API_URL}/api/v1/ai/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sessionId }),
    signal,
  });
}

async function readError(res) {
  const body = await res.json().catch(() => null);
  return {
    status: res.status,
    code: body?.error?.code ?? 'HTTP_ERROR',
    message: body?.error?.message ?? 'The assistant is unavailable right now.',
  };
}

/**
 * Streams `POST /ai/chat` (API.md §5). Calls `onEvent(name, data)` per event.
 * A 401 before the stream starts is refreshed and retried once, like any other request.
 */
export async function streamChat({ message, sessionId, onEvent, signal }) {
  let res = await openStream({ message, sessionId, signal });
  if (res.status === 401) {
    const err = await readError(res);
    if (err.code === 'TOKEN_EXPIRED' || err.code === 'INVALID_TOKEN') {
      await refreshSession().catch(() => {});
      res = await openStream({ message, sessionId, signal });
    } else {
      throw err;
    }
  }
  if (!res.ok || !res.headers.get('content-type')?.includes('text/event-stream')) {
    throw await readError(res);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value.replace(/\r\n/g, '\n');
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const parsed = parseSseBlock(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      if (parsed) onEvent(parsed.event, parsed.data);
    }
  }
}
