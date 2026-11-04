import { describe, expect, it, vi } from 'vitest';
import { ChatError, sendChat } from '../../../src/scripts/chat/client';
import type { ChatMessage } from '../../../src/scripts/chat/types';

const messages: ChatMessage[] = [{ role: 'user', content: 'hi' }];
const okFetch = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('sendChat', () => {
  it('posts messages and the opt-in', async () => {
    const f = okFetch({ answer: 'a', citations: [] });
    await sendChat('https://f.example/chat', messages, true, f);
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://f.example/chat');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ messages, analyticsOptIn: true });
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('throws not_configured for an empty endpoint', async () => {
    await expect(sendChat('', messages, false, okFetch({}))).rejects.toMatchObject({ code: 'not_configured' });
  });

  it('throws bad_status on 500', async () => {
    await expect(sendChat('x', messages, false, okFetch({}, 500))).rejects.toMatchObject({ code: 'bad_status' });
  });

  it.each([
    [429, { error: 'busy' }, 'busy'],
    [503, { error: 'unavailable' }, 'unavailable'],
    [504, { error: 'timeout' }, 'timeout'],
    [400, { error: 'bad_request' }, 'bad_status'],
    [500, { error: 'error' }, 'bad_status'],
  ])('maps a %i with %o to %s', async (status, body, code) => {
    await expect(sendChat('x', messages, false, okFetch(body, status))).rejects.toMatchObject({ code });
  });

  it.each([
    [429, 'busy'],
    [502, 'unavailable'],
    [503, 'unavailable'],
    [504, 'timeout'],
  ])('maps a bare %i without a JSON body to %s', async (status, code) => {
    const f = vi.fn(async () => new Response('gateway', { status })) as unknown as typeof fetch;
    await expect(sendChat('x', messages, false, f)).rejects.toMatchObject({ code });
  });

  it('prefers the code in the body over the status', async () => {
    await expect(sendChat('x', messages, false, okFetch({ error: 'timeout' }, 500))).rejects.toMatchObject({ code: 'timeout' });
  });

  it("throws empty_answer when answer is ''", async () => {
    const err = await sendChat('x', messages, false, okFetch({ answer: '', citations: [] })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatError);
    expect((err as ChatError).code).toBe('empty_answer');
  });

  it('throws network when fetch rejects', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('down');
    }) as unknown as typeof fetch;
    await expect(sendChat('x', messages, false, f)).rejects.toMatchObject({ code: 'network' });
  });

  it('drops citations without an http(s) url', async () => {
    const f = okFetch({
      answer: 'a',
      citations: [{ n: 1, url: 'javascript:x' }, { n: 2, url: 'https://ok.example/', title: 'T' }, { n: 3 }],
    });
    const r = await sendChat('x', messages, false, f);
    expect(r.citations).toEqual([{ n: 2, url: 'https://ok.example/', title: 'T' }]);
  });
});

describe('SseParser', () => {
  it('parses events split mid-line and across pieces', async () => {
    const { SseParser } = await import('../../../src/scripts/chat/client');
    const p = new SseParser();
    const raw = 'event: status\ndata: {"kind":"writing"}\n\n: keep-alive\n\nevent: delta\r\ndata: {"text":"a b"}\r\n\r\n';
    const events = [];
    for (const piece of [raw.slice(0, 9), raw.slice(9, 30), raw.slice(30, 61), raw.slice(61, 80), raw.slice(80)]) {
      events.push(...p.push(piece));
    }
    expect(events).toEqual([
      { event: 'status', data: '{"kind":"writing"}' },
      { event: 'delta', data: '{"text":"a b"}' },
    ]);
  });

  it('joins several data lines and defaults the event name', async () => {
    const { SseParser } = await import('../../../src/scripts/chat/client');
    expect(new SseParser().push('data: a\ndata: b\n\n')).toEqual([{ event: 'message', data: 'a\nb' }]);
  });
});

describe('streamChat', () => {
  it('asks for an event stream and reports status, deltas and the done reply', async () => {
    const { streamChat } = await import('../../../src/scripts/chat/client');
    const { controlledStream, frame } = await import('./sse-helpers');
    const s = controlledStream();
    const f = vi.fn(async () => s.response) as unknown as typeof fetch;
    const seen: string[] = [];
    const p = streamChat('x', messages, false, { onStatus: (st) => seen.push(`status:${st.kind}`), onDelta: (t) => seen.push(`delta:${t}`) }, f);
    s.write(frame('status', { kind: 'searching', query: 'fees' }));
    s.write(frame('status', { kind: 'writing' }) + frame('delta', { text: 'Hel' }).slice(0, 12));
    s.write(frame('delta', { text: 'Hel' }).slice(12) + frame('delta', { text: 'lo' }));
    s.write(frame('done', { answer: 'Hello [1]', citations: [{ n: 1, url: 'https://a.example/' }], unanswered: false }));
    const reply = await p;
    expect(seen).toEqual(['status:searching', 'status:writing', 'delta:Hel', 'delta:lo']);
    expect(reply).toMatchObject({ answer: 'Hello [1]', citations: [{ n: 1, url: 'https://a.example/' }] });
    const init = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).accept).toBe('text/event-stream');
  });

  it('falls back to JSON when the response is not an event stream', async () => {
    const { streamChat } = await import('../../../src/scripts/chat/client');
    const f = okFetch({ answer: 'plain', citations: [] });
    const onDelta = vi.fn();
    expect(await streamChat('x', messages, false, { onDelta }, f)).toMatchObject({ answer: 'plain' });
    expect(onDelta).not.toHaveBeenCalled();
  });

  it('throws the code of an error event', async () => {
    const { streamChat } = await import('../../../src/scripts/chat/client');
    const { controlledStream, frame } = await import('./sse-helpers');
    const s = controlledStream();
    const p = streamChat('x', messages, false, {}, vi.fn(async () => s.response) as unknown as typeof fetch);
    s.write(frame('error', { error: 'timeout' }));
    await expect(p).rejects.toMatchObject({ code: 'timeout' });
  });

  it('throws network when the stream ends without done', async () => {
    const { streamChat } = await import('../../../src/scripts/chat/client');
    const { controlledStream, frame } = await import('./sse-helpers');
    const s = controlledStream();
    const p = streamChat('x', messages, false, {}, vi.fn(async () => s.response) as unknown as typeof fetch);
    s.write(frame('delta', { text: 'half' }));
    s.end();
    await expect(p).rejects.toMatchObject({ code: 'network' });
  });

  it('throws aborted when the signal aborts while the body is read', async () => {
    const { streamChat } = await import('../../../src/scripts/chat/client');
    const { controlledStream, frame } = await import('./sse-helpers');
    const s = controlledStream();
    const ac = new AbortController();
    ac.signal.addEventListener('abort', () => s.fail(new DOMException('aborted', 'AbortError')));
    const deltas: string[] = [];
    const p = streamChat('x', messages, false, { signal: ac.signal, onDelta: (t) => deltas.push(t) }, vi.fn(async () => s.response) as unknown as typeof fetch);
    s.write(frame('delta', { text: 'half' }));
    await new Promise((r) => setTimeout(r, 0));
    ac.abort();
    await expect(p).rejects.toMatchObject({ code: 'aborted' });
    expect(deltas).toEqual(['half']);
  });

  it('reads a done event without a trailing blank line at the end of the stream', async () => {
    const { streamChat } = await import('../../../src/scripts/chat/client');
    const { controlledStream } = await import('./sse-helpers');
    const s = controlledStream();
    const p = streamChat('x', messages, false, {}, vi.fn(async () => s.response) as unknown as typeof fetch);
    s.write('event: done\ndata: {"answer":"Last","citations":[]}');
    s.end();
    expect(await p).toMatchObject({ answer: 'Last' });
  });

  it('calls onStream for an event stream only', async () => {
    const { streamChat } = await import('../../../src/scripts/chat/client');
    const onStream = vi.fn();
    await streamChat('x', messages, false, { onStream }, okFetch({ answer: 'a', citations: [] }));
    expect(onStream).not.toHaveBeenCalled();
  });

  it('throws aborted when the signal aborts the fetch', async () => {
    const { streamChat } = await import('../../../src/scripts/chat/client');
    const ac = new AbortController();
    const f = vi.fn(
      (_u: string, init: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
        ),
    ) as unknown as typeof fetch;
    const p = streamChat('x', messages, false, { signal: ac.signal }, f);
    ac.abort();
    await expect(p).rejects.toMatchObject({ code: 'aborted' });
  });
});

describe('follow-ups in the reply', () => {
  it('keeps at most 3 non-empty strings, and none when missing', async () => {
    const f = okFetch({ answer: 'a', citations: [], followups: ['One?', '', 3, 'Two?', 'Three?', 'Four?'] });
    expect((await sendChat('x', messages, false, f)).followups).toEqual(['One?', 'Two?', 'Three?']);
    expect((await sendChat('x', messages, false, okFetch({ answer: 'a', citations: [] }))).followups).toEqual([]);
  });
});
