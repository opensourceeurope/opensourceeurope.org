// Server-Sent Events transport for the chat. See README.md, "Streaming".
//
//   event: status   data: {"kind":"searching","query":"..."} or {"kind":"writing"}
//   event: delta    data: {"text":"..."}      raw answer text, markers held back
//   event: done     data: the JSON response   the browser replaces the text with it
//   event: error    data: {"error":"<code>"}  the same codes as the JSON errors
//   : keep-alive                              a comment after 10 s of silence

export type SseEventName = "status" | "delta" | "done" | "error";

export const KEEP_ALIVE = ": keep-alive\n\n";
export const KEEP_ALIVE_MS = 10_000;

/** One SSE frame. JSON.stringify escapes newlines, so the data is one line. */
export function sseFrame(event: SseEventName, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** True when the request asks for an event stream. */
export function wantsEventStream(accept: string | string[] | undefined): boolean {
  const value = Array.isArray(accept) ? accept.join(",") : (accept ?? "");
  return /(^|,)\s*text\/event-stream\s*(;|,|$)/i.test(value);
}

export interface SseWriter {
  send(event: SseEventName, data: unknown): void;
  /** Stops the keep-alive timer. The caller ends the response. */
  close(): void;
}

/**
 * Writes SSE frames through `write` and sends a keep-alive comment whenever
 * nothing else was sent for keepAliveMs, so proxies keep the connection open.
 */
export function createSseWriter(write: (chunk: string) => void, keepAliveMs = KEEP_ALIVE_MS): SseWriter {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  const arm = () => {
    if (timer) clearTimeout(timer);
    if (closed) return;
    timer = setTimeout(() => {
      write(KEEP_ALIVE);
      arm();
    }, keepAliveMs);
  };
  arm();
  return {
    send(event, data) {
      if (closed) return;
      write(sseFrame(event, data));
      arm();
    },
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}

// The start of a marker: two opening brackets, maybe with space between them
// ("[[" or "[ ["), as UNANSWERED_RE and FOLLOWUPS_RE in sources.ts accept.
const MARKER_OPEN = /\[\s*\[/;
// A trailing "[" with only space after it may still become a marker opening.
const OPEN_AT_END = /\[\s*$/;
// A complete [[name]] marker at the start of the held text.
const MARKER_AT_START = /^\[\s*\[\s*([a-z-]*)\s*\]\s*\]/i;
// Held text that may still grow into a marker.
const MARKER_PREFIX = /^\[\s*\[\s*[a-z-]*\s*(?:\]\s*)?$/i;
const MAX_MARKER_CHARS = 32;

/**
 * Filters the streamed answer text so no "[[" (or "[ [") ever reaches the
 * browser. Text from "[[" on is held back until it is known: an [[unanswered]] marker is
 * dropped and streaming goes on; [[followups]] or any other "[[" stops the
 * deltas for the rest of the call (the done event carries the final text). A
 * trailing "[" is held until the next piece shows whether a "[[" starts there.
 */
export function createDeltaFilter() {
  let held = "";
  let stopped = false;
  const drain = (): string => {
    let out = "";
    while (held && !stopped) {
      const open = MARKER_OPEN.exec(held);
      const i = open ? open.index : -1;
      if (i === -1) {
        const tail = OPEN_AT_END.exec(held);
        const keep = tail ? tail.index : held.length;
        out += held.slice(0, keep);
        held = held.slice(keep);
        break;
      }
      out += held.slice(0, i);
      held = held.slice(i);
      const m = MARKER_AT_START.exec(held);
      if (m && m[1].toLowerCase() === "unanswered") {
        held = held.slice(m[0].length);
        continue;
      }
      if (!m && MARKER_PREFIX.test(held) && held.length < MAX_MARKER_CHARS) break;
      stopped = true;
      held = "";
    }
    return out;
  };
  return {
    /** Adds text and returns the part that is safe to send now (may be ""). */
    push(text: string): string {
      if (stopped) return "";
      held += text;
      return drain();
    },
    /** Forgets everything: the next text starts a new answer. */
    reset(): void {
      held = "";
      stopped = false;
    },
  };
}
