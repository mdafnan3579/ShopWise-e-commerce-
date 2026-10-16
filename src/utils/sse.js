const HEARTBEAT_MS = 15_000;

/**
 * Turns a response into a Server-Sent Events stream.
 * Each event is `event: <name>\ndata: <json>\n\n`. A comment heartbeat keeps proxies and load
 * balancers from closing an idle connection while the model is thinking or tools are running.
 *
 * @param {import('express').Response} res
 */
export function openEventStream(res) {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (nginx, Render)
  });
  res.flushHeaders();

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': keep-alive\n\n');
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return {
    send(event, data) {
      if (res.writableEnded || res.destroyed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      clearInterval(heartbeat);
      if (!res.writableEnded) res.end();
    },
  };
}
