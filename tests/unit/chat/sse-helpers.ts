// A fake fetch Response whose event-stream body the test writes piece by piece.
export function controlledStream() {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  const enc = new TextEncoder();
  const response = {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/event-stream; charset=utf-8' }),
    body,
    json: async () => {
      throw new Error('not JSON');
    },
  } as unknown as Response;
  return {
    response,
    write: (text: string) => ctrl.enqueue(enc.encode(text)),
    end: () => ctrl.close(),
    fail: (e: unknown) => ctrl.error(e),
  };
}

export const frame = (event: string, data: unknown): string => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
