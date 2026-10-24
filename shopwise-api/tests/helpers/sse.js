/** Collects a Server-Sent Events response into `[{ event, data }]`. */
export function sse(req) {
  return req.buffer(true).parse((res, callback) => {
    let raw = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => (raw += chunk));
    res.on('end', () => {
      const events = raw
        .split('\n\n')
        .filter((block) => block.startsWith('event:'))
        .map((block) => {
          const [eventLine, dataLine] = block.split('\n');
          return { event: eventLine.slice(7), data: JSON.parse(dataLine.slice(6)) };
        });
      callback(null, events);
    });
  });
}

/** The full streamed reply text of a chat turn. */
export const textOf = (events) =>
  events
    .filter((e) => e.event === 'text')
    .map((e) => e.data.delta)
    .join('');
