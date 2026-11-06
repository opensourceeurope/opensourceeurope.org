import type { ChatMessage, ChatReply, Citation } from './types';

export type ChatErrorCode =
  | 'not_configured'
  | 'bad_status'
  | 'empty_answer'
  | 'network'
  | 'busy'
  | 'unavailable'
  | 'timeout'
  | 'aborted';

// The function answers an error with { error: "<code>" } and a matching status.
// A gateway in front of it may answer with only the status, so both are read.
const CODE_FROM_BODY: Record<string, ChatErrorCode> = { busy: 'busy', unavailable: 'unavailable', timeout: 'timeout' };

async function errorCodeOf(res: Response): Promise<ChatErrorCode> {
  let fromBody: string | undefined;
  try {
    const d = (await res.json()) as { error?: unknown };
    if (d && typeof d.error === 'string') fromBody = d.error;
  } catch {
    // not JSON
  }
  if (fromBody && CODE_FROM_BODY[fromBody]) return CODE_FROM_BODY[fromBody];
  if (res.status === 429) return 'busy';
  if (res.status === 502 || res.status === 503) return 'unavailable';
  if (res.status === 504) return 'timeout';
  return 'bad_status';
}

export class ChatError extends Error {
  code: ChatErrorCode;
  constructor(code: ChatErrorCode) {
    super(code);
    this.name = 'ChatError';
    this.code = code;
  }
}

function cleanCitations(raw: unknown): Citation[] {
  if (!Array.isArray(raw)) return [];
  const out: Citation[] = [];
  for (const item of raw as unknown[]) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    if (typeof c.url !== 'string' || !/^https?:\/\//i.test(c.url)) continue;
    const cite: Citation = { url: c.url };
    if (typeof c.n === 'number') cite.n = c.n;
    if (typeof c.title === 'string') cite.title = c.title;
    if (typeof c.source_name === 'string') cite.source_name = c.source_name;
    out.push(cite);
  }
  return out;
}

// Reads a JSON reply: { answer, citations }.
async function readJsonReply(res: Response): Promise<ChatReply> {
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new ChatError('empty_answer');
  }
  return replyFrom(data);
}

function replyFrom(data: unknown): ChatReply {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const answer = typeof d.answer === 'string' ? d.answer : '';
  if (!answer) throw new ChatError('empty_answer');
  return { answer, citations: cleanCitations(d.citations), followups: cleanFollowups(d.followups) };
}

// The function already limits them; the browser checks again.
function cleanFollowups(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q): q is string => typeof q === 'string')
    .map((q) => q.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 3);
}

export interface SseEvent {
  event: string;
  data: string;
}

/**
 * A small Server-Sent Events parser. push() takes decoded text in any pieces,
 * also split mid-line, and returns the events completed by it. Comment lines
 * (": keep-alive") and fields other than event and data are ignored.
 */
export class SseParser {
  private buffer = '';
  private event = '';
  private data: string[] = [];

  push(text: string): SseEvent[] {
    this.buffer += text;
    const out: SseEvent[] = [];
    let nl: number;
    while ((nl = this.buffer.search(/\r\n|\r|\n/)) !== -1) {
      // A lone \r at the end may be the first half of \r\n: wait for more.
      if (this.buffer[nl] === '\r' && nl === this.buffer.length - 1) break;
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + (this.buffer.startsWith('\r\n', nl) ? 2 : 1));
      if (line === '') {
        if (this.data.length) out.push({ event: this.event || 'message', data: this.data.join('\n') });
        this.event = '';
        this.data = [];
        continue;
      }
      if (line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'event') this.event = value;
      else if (field === 'data') this.data.push(value);
    }
    return out;
  }
}

export type ChatStatus = { kind: 'searching'; query: string } | { kind: 'writing' };

export interface StreamHandlers {
  /** Called once when the reply turns out to be an event stream. */
  onStream?: () => void;
  onStatus?: (status: ChatStatus) => void;
  onDelta?: (text: string) => void;
  signal?: AbortSignal;
  /** The value of the hidden honeypot field. Sent only when something filled it. */
  website?: string;
}

const isAbort = (e: unknown): boolean => !!e && typeof e === 'object' && (e as { name?: unknown }).name === 'AbortError';

/**
 * Asks the chat function for a streamed answer. Status and text pieces go to
 * the handlers as they arrive; the promise resolves with the final reply from
 * the done event. A response that is not an event stream is read as JSON.
 * An abort through handlers.signal rejects with ChatError('aborted').
 */
export async function streamChat(
  endpoint: string,
  messages: ChatMessage[],
  analyticsOptIn: boolean,
  handlers: StreamHandlers = {},
  fetchFn: typeof fetch = fetch,
): Promise<ChatReply> {
  if (!endpoint) throw new ChatError('not_configured');
  let res: Response;
  try {
    res = await fetchFn(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify(
        handlers.website ? { messages, analyticsOptIn, website: handlers.website } : { messages, analyticsOptIn },
      ),
      signal: handlers.signal,
    });
  } catch (e) {
    throw new ChatError(isAbort(e) || handlers.signal?.aborted ? 'aborted' : 'network');
  }
  if (!res.ok) throw new ChatError(await errorCodeOf(res));
  if (!/^text\/event-stream/i.test(res.headers.get('content-type') ?? '') || !res.body) return readJsonReply(res);

  handlers.onStream?.();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  const handle = (ev: SseEvent): ChatReply | undefined => {
    let data: unknown;
    try {
      data = JSON.parse(ev.data);
    } catch {
      return undefined;
    }
    const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    if (ev.event === 'status') {
      // No query: the early status before the first search.
      if (d.kind === 'searching') handlers.onStatus?.({ kind: 'searching', query: typeof d.query === 'string' ? d.query : '' });
      else if (d.kind === 'writing') handlers.onStatus?.({ kind: 'writing' });
    } else if (ev.event === 'delta') {
      if (typeof d.text === 'string' && d.text) handlers.onDelta?.(d.text);
    } else if (ev.event === 'done') {
      return replyFrom(d);
    } else if (ev.event === 'error') {
      const code = typeof d.error === 'string' ? CODE_FROM_BODY[d.error] : undefined;
      throw new ChatError(code ?? 'bad_status');
    }
    return undefined;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      const events = parser.push(done ? decoder.decode() + '\n\n' : decoder.decode(value, { stream: true }));
      for (const ev of events) {
        const reply = handle(ev);
        if (reply) {
          void reader.cancel().catch(() => {});
          return reply;
        }
      }
      if (done) break;
    }
  } catch (e) {
    if (e instanceof ChatError) throw e;
    throw new ChatError(isAbort(e) || handlers.signal?.aborted ? 'aborted' : 'network');
  }
  // The stream ended without done or error.
  throw new ChatError(handlers.signal?.aborted ? 'aborted' : 'network');
}

export async function sendChat(
  endpoint: string,
  messages: ChatMessage[],
  analyticsOptIn: boolean,
  fetchFn: typeof fetch = fetch,
): Promise<ChatReply> {
  if (!endpoint) throw new ChatError('not_configured');
  let res: Response;
  try {
    res = await fetchFn(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages, analyticsOptIn }),
    });
  } catch {
    throw new ChatError('network');
  }
  if (!res.ok) throw new ChatError(await errorCodeOf(res));
  return readJsonReply(res);
}

// A keepalive request may carry at most 64 KiB, counted for all keepalive
// requests the page has open. The summary stays well below that.
export const MAX_SUMMARY_BYTES = 48 * 1024;
const SUMMARY_CAPS = { user: 2000, assistant: 4000 };

/** The turns to send for a summary: each capped, oldest dropped until the body fits. */
export function summaryBody(messages: ChatMessage[]): string | null {
  let turns = messages.map((m) => ({ role: m.role, content: m.content.slice(0, SUMMARY_CAPS[m.role]) }));
  const encode = (t: ChatMessage[]) => JSON.stringify({ summary: true, messages: t, analyticsOptIn: true });
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  let body = encode(turns);
  while (bytes(body) > MAX_SUMMARY_BYTES && turns.length > 1) {
    turns = turns.slice(1);
    body = encode(turns);
  }
  if (!turns.some((t) => t.role === 'user') || bytes(body) > MAX_SUMMARY_BYTES) return null;
  return body;
}

/**
 * Asks the chat function to log a summary of these turns. Used only with
 * analytics consent, when the visitor closes the panel or leaves the page, so
 * the request must outlive the page: fetch with keepalive, or sendBeacon
 * where that fails. The body goes as text/plain, which needs no preflight
 * request. Nothing is read back and no error reaches the visitor.
 */
export function sendSummary(endpoint: string, messages: ChatMessage[], fetchFn: typeof fetch = fetch): void {
  if (!endpoint) return;
  const body = summaryBody(messages);
  if (!body) return;
  const headers = { 'content-type': 'text/plain;charset=UTF-8' };
  try {
    void fetchFn(endpoint, { method: 'POST', headers, body, keepalive: true, credentials: 'omit' }).catch(() => undefined);
  } catch {
    try {
      navigator.sendBeacon?.(endpoint, new Blob([body], { type: headers['content-type'] }));
    } catch {
      // Nothing to do: the summary is lost.
    }
  }
}
