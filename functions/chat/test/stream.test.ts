import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ complete: null as any, stream: null as any }));
vi.mock("@mistralai/mistralai", () => ({
  Mistral: class {
    chat = {
      complete: (...args: any[]) => mock.complete(...args),
      stream: (...args: any[]) => mock.stream(...args),
    };
  },
}));

import { handleChat, handleChatStream, resetToolChoiceFallbacks } from "../src/handler.js";
import { KEEP_ALIVE, createDeltaFilter, createSseWriter, sseFrame, wantsEventStream } from "../src/stream.js";
import { ChatFailure } from "../src/errors.js";

const ENV = { MISTRAL_API_KEY: "k", OSE_MCP_URL: "http://mcp" } as any;
const RESULT = "Result 1:\nSource: https://docs.example/a\nSource Name: ose\nContent:\nOSE text.\n";
const textReply = (content: string) => ({ choices: [{ message: { content, toolCalls: [] } }] });
const toolReply = (id: string, query = "q") => ({
  choices: [{ message: { content: "", toolCalls: [{ id, function: { name: "search_docs", arguments: JSON.stringify({ query }) } }] } }],
});

/** A fake SDK event stream that yields the text pieces, then optional tool calls. */
function chunks(pieces: string[], toolCalls?: any[]) {
  return (async function* () {
    for (const p of pieces) yield { data: { choices: [{ delta: { content: p } }] } };
    if (toolCalls) yield { data: { choices: [{ delta: { toolCalls } }] } };
  })();
}

function fakeSession(search?: (q: string) => Promise<any>) {
  const s = {
    search: vi.fn(search ?? (async () => ({ text: RESULT, citations: [] }))),
    close: vi.fn(async () => {}),
  };
  return { session: s, openSearch: vi.fn(() => s) };
}

interface Frame { event: string; data: any }

/** Parses the written SSE text into frames; comments are returned as { event: "comment" }. */
function parse(raw: string): Frame[] {
  return raw
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      if (block.startsWith(":")) return { event: "comment", data: block.slice(1).trim() };
      const event = /^event: (.*)$/m.exec(block)![1];
      const data = JSON.parse(/^data: (.*)$/m.exec(block)![1]);
      return { event, data };
    });
}

async function runStream(body: any, deps: any = {}, env = ENV): Promise<Frame[]> {
  let raw = "";
  await handleChatStream(body, env, (c) => (raw += c), deps);
  return parse(raw);
}

const Q = { messages: [{ role: "user", content: "What is OSE?" }] };

beforeEach(() => {
  resetToolChoiceFallbacks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  mock.complete = null;
  mock.stream = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("SSE framing", () => {
  it("writes an event line, one JSON data line and a blank line", () => {
    expect(sseFrame("delta", { text: "a\nb" })).toBe('event: delta\ndata: {"text":"a\\nb"}\n\n');
  });

  it("recognises an Accept header that asks for a stream", () => {
    expect(wantsEventStream("text/event-stream")).toBe(true);
    expect(wantsEventStream("application/json, text/event-stream;q=0.9")).toBe(true);
    expect(wantsEventStream("application/json")).toBe(false);
    expect(wantsEventStream(undefined)).toBe(false);
  });
});

describe("keep-alive", () => {
  it("sends a comment after 10 s without an event, and not while events flow", () => {
    vi.useFakeTimers();
    const out: string[] = [];
    const w = createSseWriter((c) => out.push(c));
    vi.advanceTimersByTime(9_000);
    w.send("status", { kind: "writing" });
    vi.advanceTimersByTime(9_000);
    expect(out).not.toContain(KEEP_ALIVE);
    vi.advanceTimersByTime(1_000);
    expect(out.filter((c) => c === KEEP_ALIVE)).toHaveLength(1);
    vi.advanceTimersByTime(10_000);
    expect(out.filter((c) => c === KEEP_ALIVE)).toHaveLength(2);
    w.close();
    vi.advanceTimersByTime(60_000);
    expect(out.filter((c) => c === KEEP_ALIVE)).toHaveLength(2);
  });

  it("is sent during a slow search", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mock.complete = vi.fn().mockResolvedValueOnce(toolReply("t1"));
    mock.stream = vi.fn(async () => chunks(["Done."]));
    let release!: () => void;
    const { openSearch } = fakeSession(
      () => new Promise((r) => (release = () => r({ text: RESULT, citations: [] }))),
    );
    let raw = "";
    const p = handleChatStream(Q, ENV, (c) => (raw += c), { openSearch });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(raw).toContain(KEEP_ALIVE);
    release();
    await p;
    expect(parse(raw).at(-1)!.event).toBe("done");
  });
});

describe("the delta filter", () => {
  const run = (pieces: string[]) => {
    const f = createDeltaFilter();
    return pieces.map((p) => f.push(p));
  };

  it("never lets [[ through, even split across pieces", () => {
    const out = run(["Answer [1", "]. Not covered.\n[", "[unans", "wered]", "]\n", "tail"]);
    expect(out.join("")).not.toContain("[[");
    expect(out.join("")).toBe("Answer [1]. Not covered.\n\ntail");
    for (const piece of out) expect(piece).not.toContain("[[");
  });

  it("stops at a followups block", () => {
    const out = run(["Answer.\n[[follow", "ups]]\nWhat next?\n", "And then?"]);
    expect(out.join("")).toBe("Answer.\n");
  });

  it("stops at an unknown [[ and holds the rest", () => {
    expect(run(["a [[x", "yz]] b"]).join("")).toBe("a ");
    expect(run(["a [[1]] b"]).join("")).toBe("a ");
  });

  it("treats space between the brackets as a marker too", () => {
    const out = run(["Not covered. [", " ", "[ unanswered ] ]", " more [1] [2] [ ", "[followups] ]\nQ?"]);
    for (const piece of out) expect(piece).not.toMatch(/\[\s*\[/);
    expect(out.join("")).toBe("Not covered.  more [1] [2] ");
  });
});

describe("handleChatStream", () => {
  it("sends a status per search, writing, deltas and done", async () => {
    mock.complete = vi.fn().mockResolvedValueOnce(toolReply("t1", "fiscal hosting"));
    mock.stream = vi
      .fn()
      .mockResolvedValueOnce(chunks([], [{ id: "t2", index: 0, function: { name: "search_docs", arguments: '{"query":"' } }, { index: 0, function: { arguments: 'fees"}' } }]))
      .mockResolvedValueOnce(chunks(["OSE is ", "a fiscal host [1]."]));
    const { session, openSearch } = fakeSession();
    const frames = await runStream(Q, { openSearch });
    expect(frames.map((f) => f.event)).toEqual(["status", "status", "status", "status", "delta", "delta", "done"]);
    expect(frames[0].data).toEqual({ kind: "searching" });
    expect(frames[1].data).toEqual({ kind: "searching", query: "fiscal hosting" });
    expect(frames[2].data).toEqual({ kind: "searching", query: "fees" });
    expect(frames[3].data).toEqual({ kind: "writing" });
    expect(frames[4].data.text + frames[5].data.text).toBe("OSE is a fiscal host [1].");
    expect(session.search.mock.calls.map((c) => c[0])).toEqual(["fiscal hosting", "fees"]);
    expect(frames[6].data).toMatchObject({ answer: "OSE is a fiscal host [1].", unanswered: false, followups: [] });
  });

  it("never sends [[ in a delta and strips the markers from done", async () => {
    mock.complete = vi.fn().mockResolvedValueOnce(toolReply("t1"));
    mock.stream = vi.fn(async () => chunks(["Fiscal hosting is not covered.\n", "[", "[unans", "wered]]"]));
    const { openSearch } = fakeSession();
    const frames = await runStream(Q, { openSearch });
    const deltas = frames.filter((f) => f.event === "delta").map((f) => f.data.text);
    for (const d of deltas) expect(d).not.toContain("[[");
    expect(deltas.join("")).not.toContain("[[");
    expect(frames.at(-1)!.data).toMatchObject({ answer: "Fiscal hosting is not covered.", unanswered: true });
  });

  it("holds the followups block back from the deltas and returns it in done", async () => {
    mock.complete = vi.fn().mockResolvedValueOnce(toolReply("t1"));
    mock.stream = vi.fn(async () => chunks(["Fiscal hosting is covered [1].\n", "[", "[follow", "ups]]\n- How do I join?\n- What are the fees?"]));
    const { openSearch } = fakeSession();
    const frames = await runStream(Q, { openSearch });
    const deltas = frames.filter((f) => f.event === "delta").map((f) => f.data.text);
    expect(deltas.join("")).toBe("Fiscal hosting is covered [1].\n");
    expect(frames.at(-1)!.data).toMatchObject({
      answer: "Fiscal hosting is covered [1].",
      followups: ["How do I join?", "What are the fees?"],
    });
  });

  it("sends in done exactly what the JSON transport returns", async () => {
    const answer = "OSE pays out within 7 days [1].\nSee https://evil.example/x.\n[[followups]]\nHow do I submit an expense?\nWhat is OSE?";
    const searches = async () => ({ text: RESULT, citations: [] });
    mock.complete = vi.fn().mockResolvedValueOnce(toolReply("t1")).mockResolvedValueOnce(textReply(answer));
    const json = await handleChat(Q, ENV, { openSearch: fakeSession(searches).openSearch });
    mock.complete = vi.fn().mockResolvedValueOnce(toolReply("t1"));
    mock.stream = vi.fn(async () => chunks([answer.slice(0, 20), answer.slice(20)]));
    const frames = await runStream(Q, { openSearch: fakeSession(searches).openSearch });
    expect(json.status).toBe(200);
    expect(frames.at(-1)).toEqual({ event: "done", data: json.json });
    expect((json.json as any).followups).toEqual(["How do I submit an expense?"]);
  });

  it("drops text streamed before a tool call: the next status resets it", async () => {
    mock.complete = vi.fn().mockResolvedValueOnce(toolReply("t1"));
    mock.stream = vi
      .fn()
      .mockResolvedValueOnce(chunks(["Let me check."], [{ id: "t2", index: 0, function: { name: "search_docs", arguments: '{"query":"more"}' } }]))
      .mockResolvedValueOnce(chunks(["Final."]));
    const { openSearch } = fakeSession();
    const frames = await runStream(Q, { openSearch });
    const events = frames.map((f) => (f.event === "status" ? f.data.kind : f.event));
    expect(events).toEqual(["searching", "searching", "writing", "delta", "searching", "writing", "delta", "done"]);
    expect(frames.at(-1)!.data.answer).toBe("Final.");
  });

  it("streams the forced final call", async () => {
    mock.complete = vi.fn().mockResolvedValueOnce(toolReply("t1"));
    mock.stream = vi.fn(async () => chunks(["Forced answer."]));
    const { openSearch } = fakeSession();
    const frames = await runStream(Q, { openSearch }, { ...ENV, MAX_TOOL_ROUNDS: "1" });
    expect(mock.stream.mock.calls[0][0].toolChoice).toBe("none");
    expect(frames.map((f) => f.event)).toEqual(["status", "status", "status", "delta", "done"]);
  });

  it("falls back to a normal call when the stream fails before any text, and sends it as one delta", async () => {
    mock.complete = vi.fn().mockResolvedValueOnce(toolReply("t1")).mockResolvedValueOnce(textReply("Whole answer."));
    mock.stream = vi.fn(async () => {
      throw Object.assign(new Error("x"), { statusCode: 500 });
    });
    const { openSearch } = fakeSession();
    const frames = await runStream(Q, { openSearch });
    const deltas = frames.filter((f) => f.event === "delta");
    expect(deltas).toEqual([{ event: "delta", data: { text: "Whole answer." } }]);
    expect(frames.at(-1)!.data.answer).toBe("Whole answer.");
  });

  it("does not retry after text was sent, and ends with an error event", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mock.complete = vi.fn().mockResolvedValueOnce(toolReply("t1"));
    mock.stream = vi.fn(async () =>
      (async function* () {
        yield { data: { choices: [{ delta: { content: "Half" } }] } };
        throw Object.assign(new Error("x"), { statusCode: 503 });
      })(),
    );
    const { openSearch } = fakeSession();
    const frames = await runStream(Q, { openSearch });
    expect(frames.at(-1)).toEqual({ event: "error", data: { error: "unavailable" } });
    expect(mock.complete).toHaveBeenCalledTimes(1);
  });

  it.each([
    [Object.assign(new Error("t"), { statusCode: 429 }), "busy"],
    [Object.assign(new Error("t"), { name: "RequestTimeoutError" }), "timeout"],
  ])("sends the JSON error code as an error event (%s)", async (err, code) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mock.complete = vi.fn().mockRejectedValue(err);
    const { openSearch } = fakeSession();
    const frames = await runStream(Q, { openSearch });
    expect(frames).toEqual([{ event: "status", data: { kind: "searching" } }, { event: "error", data: { error: code } }]);
  });

  it("sends the early status before the first model call ends", async () => {
    let release!: () => void;
    mock.complete = vi.fn(() => new Promise((r) => (release = () => r(textReply("x")))));
    const { openSearch } = fakeSession();
    let raw = "";
    const p = handleChatStream(Q, ENV, (c) => (raw += c), { openSearch });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    expect(parse(raw)).toEqual([{ event: "status", data: { kind: "searching" } }]);
    mock.stream = vi.fn(async () => chunks(["Hi."]));
    release();
    await p;
  });

  it("cuts the query in a status event at 80 characters", async () => {
    const long = "q".repeat(200);
    mock.complete = vi.fn().mockResolvedValueOnce(toolReply("t1", long));
    mock.stream = vi.fn(async () => chunks(["Hi."]));
    const frames = await runStream(Q, { openSearch: fakeSession().openSearch });
    expect(Array.from(frames[1].data.query as string)).toHaveLength(80);
  });

  it("makes no second call when the stream times out", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mock.complete = vi.fn().mockResolvedValueOnce(toolReply("t1"));
    mock.stream = vi.fn(async () => {
      throw Object.assign(new Error("t"), { name: "RequestTimeoutError" });
    });
    const frames = await runStream(Q, { openSearch: fakeSession().openSearch });
    expect(frames.at(-1)).toEqual({ event: "error", data: { error: "timeout" } });
    expect(mock.stream).toHaveBeenCalledTimes(1);
    expect(mock.complete).toHaveBeenCalledTimes(1); // only the round-1 search call
  });

  it("makes at most one more call when the stream gets a 429", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const busy = Object.assign(new Error("429"), { statusCode: 429 });
    mock.complete = vi.fn().mockResolvedValueOnce(toolReply("t1")).mockRejectedValue(busy);
    mock.stream = vi.fn(async () => {
      throw busy;
    });
    const frames = await runStream(Q, { openSearch: fakeSession().openSearch });
    expect(frames.at(-1)).toEqual({ event: "error", data: { error: "busy" } });
    expect(mock.stream).toHaveBeenCalledTimes(1);
    expect(mock.complete).toHaveBeenCalledTimes(2); // the round-1 call and one plain call
  });

  it("does not fall back for an error that is neither transient nor about streaming", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mock.complete = vi.fn().mockResolvedValueOnce(toolReply("t1"));
    mock.stream = vi.fn(async () => {
      throw Object.assign(new Error("bad"), { statusCode: 400, body: "messages too long" });
    });
    const frames = await runStream(Q, { openSearch: fakeSession().openSearch });
    expect(frames.at(-1)).toEqual({ event: "error", data: { error: "error" } });
    expect(mock.complete).toHaveBeenCalledTimes(1);
  });

  it("falls back once for a stream-specific error", async () => {
    mock.complete = vi.fn().mockResolvedValueOnce(toolReply("t1")).mockResolvedValueOnce(textReply("Plain answer."));
    mock.stream = vi.fn(async () => {
      throw Object.assign(new Error("bad stream"), { name: "SDKValidationError" });
    });
    const frames = await runStream(Q, { openSearch: fakeSession().openSearch });
    expect(frames.filter((f) => f.event === "delta")).toEqual([{ event: "delta", data: { text: "Plain answer." } }]);
  });

  // Scaleway's mistral-medium-3.5 streams tool-call pieces with a null id and
  // no function name, which the SDK's chunk schema rejects with a ZodError.
  it("falls back once when a stream chunk fails the SDK's schema", async () => {
    mock.complete = vi.fn().mockResolvedValueOnce(toolReply("t1")).mockResolvedValueOnce(textReply("Plain answer."));
    mock.stream = vi.fn(async () => ({
      async *[Symbol.asyncIterator]() {
        throw Object.assign(new Error("Expected string, received null"), { name: "ZodError" });
      },
    }));
    const frames = await runStream(Q, { openSearch: fakeSession().openSearch });
    expect(frames.at(-1)?.event).toBe("done");
    expect(frames.filter((f) => f.event === "delta")).toEqual([{ event: "delta", data: { text: "Plain answer." } }]);
  });

  it("stops waiting for a slow search when the client leaves", async () => {
    const abort = new AbortController();
    mock.complete = vi.fn(async () => toolReply("t1"));
    const { session, openSearch } = fakeSession(() => {
      setTimeout(() => abort.abort(), 0);
      return new Promise(() => {}); // never settles
    });
    const frames = await runStream(Q, { openSearch, signal: abort.signal });
    expect(frames.map((f) => f.event)).toEqual(["status", "status"]);
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  it("sends bad_request as an error event", async () => {
    const frames = await runStream({ messages: [] }, {});
    expect(frames).toEqual([{ event: "error", data: { error: "bad_request" } }]);
  });

  it("stops the loop when the client aborts, and sends and logs nothing more", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const abort = new AbortController();
    mock.complete = vi.fn(async () => toolReply("t1"));
    mock.stream = vi.fn(async () => chunks(["never"]));
    const { session, openSearch } = fakeSession(async () => {
      abort.abort();
      return { text: RESULT, citations: [] };
    });
    const frames = await runStream({ ...Q, analyticsOptIn: true }, { openSearch, signal: abort.signal });
    expect(frames.map((f) => f.event)).toEqual(["status", "status"]);
    expect(session.search).toHaveBeenCalledTimes(1);
    expect(mock.stream).not.toHaveBeenCalled();
    expect(session.close).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.some((c) => String(c[0]).startsWith("ANALYTICS"))).toBe(false);
  });

  it("passes the client signal to the model calls", async () => {
    const abort = new AbortController();
    mock.complete = vi.fn().mockResolvedValueOnce(toolReply("t1"));
    mock.stream = vi.fn(async () => chunks(["Hi."]));
    const { openSearch } = fakeSession();
    await runStream(Q, { openSearch, signal: abort.signal });
    expect(mock.complete.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(mock.stream.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(mock.stream.mock.calls[0][1].retries).toEqual({ strategy: "none" });
  });

  it("applies the remembered tool_choice fallback to streamed calls", async () => {
    const reject = Object.assign(new Error("400"), { statusCode: 400, body: "unsupported tool_choice: none" });
    mock.complete = vi.fn(async (req: any) => (req.toolChoice === "none" ? Promise.reject(reject) : req.tools ? toolReply("t1") : textReply("Plain.")));
    mock.stream = vi.fn(async (req: any) => {
      if (req.toolChoice === "none") throw reject;
      return chunks(["Plain."]);
    });
    const { openSearch } = fakeSession();
    const env = { ...ENV, MAX_TOOL_ROUNDS: "1" };
    const first = await runStream(Q, { openSearch }, env);
    expect(first.at(-1)!.data.answer).toBe("Plain.");
    mock.stream.mockClear();
    await runStream(Q, { openSearch }, env);
    expect(mock.stream.mock.calls[0][0]).not.toHaveProperty("toolChoice");
  });

  it("still answers when the search is down", async () => {
    mock.complete = vi.fn().mockResolvedValueOnce(toolReply("t1"));
    mock.stream = vi.fn(async () => chunks(["The search is down."]));
    const { openSearch } = fakeSession(async () => {
      throw new ChatFailure("unavailable");
    });
    const frames = await runStream(Q, { openSearch });
    expect(frames.at(-1)!.data.answer).toBe("The search is down.");
  });
});

describe("JSON mode", () => {
  it("returns answer, citations, unanswered and followups, and never streams", async () => {
    mock.stream = vi.fn();
    mock.complete = vi.fn().mockResolvedValueOnce(toolReply("t1")).mockResolvedValueOnce(textReply("OSE is a host."));
    const out = await handleChat(Q, ENV, { openSearch: fakeSession().openSearch });
    expect(Object.keys(out.json).sort()).toEqual(["answer", "citations", "followups", "unanswered"]);
    expect(mock.stream).not.toHaveBeenCalled();
    expect(mock.complete.mock.calls[1][1]).toEqual({ timeoutMs: 25_000, retries: { strategy: "none" } });
  });
  it("returns no followups when the citations are hidden (an off-topic reply)", async () => {
    mock.complete = vi
      .fn()
      .mockResolvedValueOnce(toolReply("t1"))
      .mockResolvedValueOnce(textReply("I can only help with OSE.\n[[followups]]\nWhat is OSE?"));
    const out: any = await handleChat({ messages: [{ role: "user", content: "pizza?" }] }, ENV, { openSearch: fakeSession().openSearch });
    expect(out.json).toMatchObject({ citations: [], followups: [] });
  });

  it("strips a spaced unanswered marker", async () => {
    mock.complete = vi.fn().mockResolvedValueOnce(toolReply("t1")).mockResolvedValueOnce(textReply("Not covered.\n[ [unanswered] ]"));
    const out: any = await handleChat(Q, ENV, { openSearch: fakeSession().openSearch });
    expect(out.json).toMatchObject({ answer: "Not covered.", unanswered: true });
  });

  it("returns no followups when the docs did not answer, and keeps them out of analytics", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    mock.complete = vi
      .fn()
      .mockResolvedValueOnce(toolReply("t1"))
      .mockResolvedValueOnce(textReply("Not covered.\n[[unanswered]]\n[[followups]]\nWhat else?"));
    const out: any = await handleChat({ ...Q, analyticsOptIn: true }, ENV, { openSearch: fakeSession().openSearch });
    expect(out.json).toMatchObject({ answer: "Not covered.", unanswered: true, followups: [] });
    const line = String(log.mock.calls.find((c) => String(c[0]).startsWith("ANALYTICS "))![0]);
    expect(line).not.toMatch(/followups|What else/);
  });
});
