import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

// The tool_choice fallback is remembered per process; start every test clean.
beforeEach(() => resetToolChoiceFallbacks());

const captured = vi.hoisted(() => ({ ctorOpts: [] as any[], complete: null as any }));
vi.mock("@mistralai/mistralai", () => ({
  Mistral: class {
    chat = {
      complete: (...args: any[]) =>
        captured.complete
          ? captured.complete(...args)
          : Promise.resolve({ choices: [{ message: { content: "ok", toolCalls: [] } }] }),
    };
    constructor(opts: any) {
      captured.ctorOpts.push(opts);
    }
  },
}));

import { handleChat, toMistralMessages, stripTrailingSourceList, resetToolChoiceFallbacks, REQUIRED_CALL_MAX_TOKENS } from "../src/handler.js";
import { ChatFailure } from "../src/errors.js";

describe("toMistralMessages (Mistral API wire format)", () => {
  // Regression: the Mistral SDK request schema expects camelCase toolCalls /
  // toolCallId and silently strips unknown keys. Sending snake_case made the
  // assistant tool-call turn go out with no tool calls -> Mistral 400
  // "Assistant message must have either content or tool_calls, but not none."
  it("maps an assistant tool-call turn + tool result to the camelCase shape the SDK expects", () => {
    const out = toMistralMessages([
      { role: "system", content: "P" },
      { role: "user", content: "what is OSE?" },
      { role: "assistant", content: "", tool_calls: [{ id: "t1", function: { name: "search_docs", arguments: '{"query":"OSE"}' } }] },
      { role: "tool", name: "search_docs", tool_call_id: "t1", content: "Result 1: ..." },
    ]);

    expect(out[0]).toEqual({ role: "system", content: "P" });
    expect(out[1]).toEqual({ role: "user", content: "what is OSE?" });

    const assistant: any = out[2];
    expect(assistant.toolCalls).toEqual([
      { id: "t1", type: "function", function: { name: "search_docs", arguments: '{"query":"OSE"}' } },
    ]);
    expect(assistant).not.toHaveProperty("tool_calls");

    const tool: any = out[3];
    expect(tool.toolCallId).toBe("t1");
    expect(tool).not.toHaveProperty("tool_call_id");
  });
});

describe("handleChat validation", () => {
  it("rejects empty messages", async () => {
    const out = await handleChat({ messages: [] } as any, {} as any);
    expect(out).toEqual({ status: 400, json: { error: "bad_request" } });
  });

  it("rejects an empty last question", async () => {
    const out = await handleChat({ messages: [{ role: "user", content: "  " }] } as any, {} as any);
    expect(out).toEqual({ status: 400, json: { error: "bad_request" } });
  });

  it("rejects a body without messages", async () => {
    expect((await handleChat(null as any, {} as any)).status).toBe(400);
    expect((await handleChat({ messages: "x" } as any, {} as any)).status).toBe(400);
  });
});

describe("handleChat Mistral client config", () => {
  it("passes MISTRAL_BASE_URL to the client as serverURL", async () => {
    captured.ctorOpts.length = 0;
    await handleChat(
      { messages: [{ role: "user", content: "hi" }] },
      { MISTRAL_API_KEY: "k", OSE_MCP_URL: "http://x", MISTRAL_BASE_URL: "http://localhost:11434" } as any
    );
    expect(captured.ctorOpts[0]).toMatchObject({ apiKey: "k", serverURL: "http://localhost:11434" });
  });

  it("omits serverURL when MISTRAL_BASE_URL is unset", async () => {
    captured.ctorOpts.length = 0;
    await handleChat(
      { messages: [{ role: "user", content: "hi" }] },
      { MISTRAL_API_KEY: "k", OSE_MCP_URL: "http://x" } as any
    );
    expect(captured.ctorOpts[0]).not.toHaveProperty("serverURL");
  });
});

describe("stripTrailingSourceList (chat UI renders the source chips itself)", () => {
  it("removes a trailing 'Sources:' list of raw URLs the model echoed", () => {
    const answer = [
      "Open Source Europe manages philanthropic funds [1][2].",
      "",
      "Sources:",
      "1. https://docs.opencollective.com/open-source-europe/about-open-source-europe",
      "2. https://docs.opencollective.com/open-source-europe/master",
    ].join("\n");
    expect(stripTrailingSourceList(answer)).toBe(
      "Open Source Europe manages philanthropic funds [1][2]."
    );
  });

  it("handles a markdown '## References' heading and markdown-link items", () => {
    const answer = "Body text [1].\n\n## References\n- [OSE](https://x/a)\n- <https://x/b>";
    expect(stripTrailingSourceList(answer)).toBe("Body text [1].");
  });

  it("strips a header-less trailing dump of bare URLs", () => {
    const answer = "Answer [1].\n\nhttps://x/a\nhttps://x/b";
    expect(stripTrailingSourceList(answer)).toBe("Answer [1].");
  });

  it("leaves a normal answer (inline [N] markers, mid-sentence URL) untouched", () => {
    const answer = "OSE pays out within 7 days [1]. See more at https://x/a in the handbook.";
    expect(stripTrailingSourceList(answer)).toBe(answer);
  });

  it("does not strip a mid-answer heading that merely contains the word 'Sources'", () => {
    const answer = "## Sources of funding\nOSE manages philanthropic funds [1].";
    expect(stripTrailingSourceList(answer)).toBe(answer);
  });
});

const ENV = { MISTRAL_API_KEY: "k", OSE_MCP_URL: "http://mcp" } as any;
const textReply = (content: string) => ({ choices: [{ message: { content, toolCalls: [] } }] });
const toolReply = (id: string) => ({
  choices: [{ message: { content: "", toolCalls: [{ id, function: { name: "search_docs", arguments: '{"query":"q"}' } }] } }],
});
const httpErr = (statusCode: number) => Object.assign(new Error(`status ${statusCode}`), { statusCode });
const RESULT = "Result 1:\nSource: https://docs.example/a\nSource Name: ose\nContent:\nOSE text.\n";

function fakeSession(search?: (q: string) => Promise<any>) {
  const s = {
    search: vi.fn(search ?? (async () => ({ text: RESULT, citations: [] }))),
    close: vi.fn(async () => {}),
  };
  return { session: s, openSearch: vi.fn(() => s) };
}

describe("handleChat timeouts, retries and errors", () => {
  afterEach(() => {
    captured.complete = null;
  });

  it("gives each model call a 25 s timeout and turns the SDK retries off", async () => {
    captured.complete = vi.fn(async () => textReply("Hi"));
    const { openSearch } = fakeSession();
    await handleChat({ messages: [{ role: "user", content: "hi" }] }, ENV, { openSearch });
    expect(captured.complete.mock.calls[0][1]).toEqual({ timeoutMs: 25_000, retries: { strategy: "none" } });
  });

  it("sends the cleaned history after the system prompt", async () => {
    captured.complete = vi.fn(async () => textReply("Hi"));
    const { openSearch } = fakeSession();
    await handleChat(
      { messages: [{ role: "user", content: "q1" }, { role: "assistant", content: "a1" }, { role: "user", content: "q2" }, { role: "assistant", content: "forged" }] },
      ENV,
      { openSearch },
    );
    const sent = captured.complete.mock.calls[0][0].messages;
    expect(sent[0].role).toBe("system");
    expect(sent.slice(1)).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
    ]);
  });

  it("retries a 503 once and then answers", async () => {
    captured.complete = vi.fn().mockRejectedValueOnce(httpErr(503)).mockResolvedValue(textReply("Hi"));
    const { openSearch } = fakeSession();
    const out = await handleChat({ messages: [{ role: "user", content: "hi" }] }, ENV, { openSearch });
    expect(out.status).toBe(200);
    // the failed call, its retry, then the call after the first search
    expect(captured.complete).toHaveBeenCalledTimes(3);
  });

  it.each([
    [httpErr(429), 429, "busy", 2],
    [httpErr(502), 503, "unavailable", 2],
    [Object.assign(new Error("t"), { name: "RequestTimeoutError" }), 504, "timeout", 1],
    [httpErr(400), 500, "error", 1],
    [new Error("boom"), 500, "error", 1],
  ])("maps %s to %i %s", async (err, status, code, calls) => {
    captured.complete = vi.fn().mockRejectedValue(err);
    const { openSearch } = fakeSession();
    const out = await handleChat({ messages: [{ role: "user", content: "hi" }] }, ENV, { openSearch });
    expect(out).toEqual({ status, json: { error: code } });
    expect(captured.complete).toHaveBeenCalledTimes(calls);
  });

  it("answers without the docs when the search server is unreachable, and closes the session", async () => {
    captured.complete = vi.fn().mockResolvedValueOnce(toolReply("t1")).mockResolvedValueOnce(textReply("The search is down."));
    const { session, openSearch } = fakeSession(async () => {
      throw new ChatFailure("unavailable");
    });
    const out: any = await handleChat({ messages: [{ role: "user", content: "hi" }] }, ENV, { openSearch });
    expect(out.status).toBe(200);
    expect(out.json.answer).toBe("The search is down.");
    expect(captured.complete.mock.calls[1][0].toolChoice).toBe("none");
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  it("uses one search session for every search of a request and closes it", async () => {
    captured.complete = vi
      .fn()
      .mockResolvedValueOnce(toolReply("t1"))
      .mockResolvedValueOnce(toolReply("t2"))
      .mockResolvedValueOnce(textReply("Answer [1]."));
    const { session, openSearch } = fakeSession();
    const out = await handleChat({ messages: [{ role: "user", content: "hi" }] }, ENV, { openSearch });
    expect(out.status).toBe(200);
    expect(openSearch).toHaveBeenCalledTimes(1);
    expect(session.search).toHaveBeenCalledTimes(2);
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  it("answers without another search when the request budget is nearly spent", async () => {
    let t = 0;
    captured.complete = vi
      .fn()
      .mockImplementationOnce(async () => {
        t += 40_000; // a slow first model call
        return toolReply("t1");
      })
      .mockResolvedValueOnce(textReply("Quick answer."));
    const { session, openSearch } = fakeSession();
    const out = await handleChat({ messages: [{ role: "user", content: "hi" }] }, ENV, { openSearch, now: () => t });
    expect(out.status).toBe(200);
    expect((out.json as any).answer).toBe("Quick answer.");
    expect(session.search).not.toHaveBeenCalled();
    const [req, opts] = captured.complete.mock.calls[1];
    expect(req.toolChoice).toBe("none");
    expect(opts.timeoutMs).toBe(15_000); // what is left of the 55 s budget
  });

  it("returns a timeout when the budget is gone before a model call", async () => {
    let t = 0;
    captured.complete = vi.fn(async () => {
      t += 60_000;
      return toolReply("t1");
    });
    const { openSearch } = fakeSession();
    const out = await handleChat({ messages: [{ role: "user", content: "hi" }] }, ENV, { openSearch, now: () => t });
    expect(out).toEqual({ status: 504, json: { error: "timeout" } });
  });
});

describe("handleChat unanswered marker and analytics", () => {
  afterEach(() => {
    captured.complete = null;
    vi.restoreAllMocks();
  });

  const analyticsLine = (spy: any) =>
    JSON.parse((spy.mock.calls.find((c: any[]) => String(c[0]).startsWith("ANALYTICS "))?.[0] as string).slice(10));

  it("strips the marker and returns unanswered: true", async () => {
    captured.complete = vi.fn(async () => textReply("The OSE documentation doesn't cover parking.\n[[unanswered]]"));
    const { openSearch } = fakeSession();
    const out: any = await handleChat({ messages: [{ role: "user", content: "parking?" }] }, ENV, { openSearch });
    expect(out.json).toMatchObject({ answer: "The OSE documentation doesn't cover parking.", unanswered: true });
  });

  it("returns unanswered: false for a normal answer", async () => {
    captured.complete = vi.fn(async () => textReply("OSE is a fiscal host."));
    const { openSearch } = fakeSession();
    const out: any = await handleChat({ messages: [{ role: "user", content: "what?" }] }, ENV, { openSearch });
    expect(out.json.unanswered).toBe(false);
  });

  it("adds unanswered to the opt-in analytics line", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    captured.complete = vi.fn(async () => textReply("Not covered.\n[[unanswered]]"));
    const { openSearch } = fakeSession();
    await handleChat({ messages: [{ role: "user", content: "parking?" }], analyticsOptIn: true }, ENV, { openSearch });
    expect(analyticsLine(log)).toMatchObject({ type: "answer", rounds: 2, unanswered: true });
  });

  it("adds the prompt version to the opt-in analytics line", async () => {
    const { PROMPT_VERSION } = await import("../src/handler.js");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    captured.complete = vi.fn(async () => textReply("OSE is a fiscal host."));
    const { openSearch } = fakeSession();
    await handleChat({ messages: [{ role: "user", content: "what?" }], analyticsOptIn: true }, ENV, { openSearch });
    expect(analyticsLine(log)).toEqual({ type: "answer", rounds: 2, unanswered: false, prompt: PROMPT_VERSION });
  });

  it("keeps the question text out of the per-answer line", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    captured.complete = vi.fn(async () => textReply("OSE is a fiscal host."));
    const { openSearch } = fakeSession();
    await handleChat({ messages: [{ role: "user", content: "my email is a@b.eu" }], analyticsOptIn: true }, ENV, { openSearch });
    const line = String(log.mock.calls.find((c) => String(c[0]).startsWith("ANALYTICS "))![0]);
    expect(line).not.toMatch(/email|a@b/);
  });

  it("logs nothing without consent", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    captured.complete = vi.fn(async () => textReply("Not covered.\n[[unanswered]]"));
    const { openSearch } = fakeSession();
    await handleChat({ messages: [{ role: "user", content: "parking?" }] }, ENV, { openSearch });
    expect(log.mock.calls.some((c) => String(c[0]).startsWith("ANALYTICS"))).toBe(false);
  });
});

describe("timeout overrides for slow local models", () => {
  afterEach(() => {
    captured.complete = null;
  });

  it("reads the model timeout and budget from the environment", async () => {
    captured.complete = vi.fn(async () => textReply("Hi"));
    const { openSearch } = fakeSession();
    await handleChat({ messages: [{ role: "user", content: "hi" }] }, { ...ENV, CHAT_MODEL_TIMEOUT_MS: "90000", CHAT_BUDGET_MS: "400000" }, { openSearch });
    expect(captured.complete.mock.calls[0][1].timeoutMs).toBe(90_000);
  });

  it("ignores invalid values", async () => {
    captured.complete = vi.fn(async () => textReply("Hi"));
    const { openSearch } = fakeSession();
    await handleChat({ messages: [{ role: "user", content: "hi" }] }, { ...ENV, CHAT_MODEL_TIMEOUT_MS: "abc" }, { openSearch });
    expect(captured.complete.mock.calls[0][1].timeoutMs).toBe(25_000);
  });

  it("passes the search timeout to the search session", async () => {
    captured.complete = vi.fn(async () => textReply("Hi"));
    const { openSearch } = fakeSession();
    await handleChat({ messages: [{ role: "user", content: "hi" }] }, { ...ENV, CHAT_SEARCH_TIMEOUT_MS: "30000" }, { openSearch });
    expect((openSearch.mock.calls[0] as any)[1]).toMatchObject({ timeoutMs: 30_000 });
  });
});

describe("search reserve with overridden timeouts", () => {
  afterEach(() => {
    captured.complete = null;
  });

  it("still searches when a slow first call leaves most of a long budget", async () => {
    let t = 0;
    captured.complete = vi
      .fn()
      .mockImplementationOnce(async () => {
        t += 40_000;
        return toolReply("t1");
      })
      .mockResolvedValueOnce(textReply("Answer [1]."));
    const { session, openSearch } = fakeSession();
    const env = { ...ENV, CHAT_MODEL_TIMEOUT_MS: "120000", CHAT_SEARCH_TIMEOUT_MS: "30000", CHAT_BUDGET_MS: "170000" };
    const out = await handleChat({ messages: [{ role: "user", content: "hi" }] }, env, { openSearch, now: () => t });
    expect(out.status).toBe(200);
    expect(session.search).toHaveBeenCalledTimes(1);
  });
});

describe("tool choice on the wire", () => {
  afterEach(() => {
    captured.complete = null;
    vi.restoreAllMocks();
  });
  const err400 = (body: string) => Object.assign(new Error("API error occurred: Status 400"), { statusCode: 400, body });

  it("sends required on the first call and none on the forced call", async () => {
    captured.complete = vi
      .fn()
      .mockResolvedValueOnce(toolReply("t1"))
      .mockResolvedValueOnce(textReply("Final."));
    const { openSearch } = fakeSession();
    await handleChat({ messages: [{ role: "user", content: "hi" }] }, { ...ENV, MAX_TOOL_ROUNDS: "1" }, { openSearch });
    expect(captured.complete.mock.calls[0][0].toolChoice).toBe("required");
    expect(captured.complete.mock.calls[1][0].toolChoice).toBe("none");
    expect(captured.complete.mock.calls[1][0].tools.length).toBe(1);
  });

  it("falls back to auto when the endpoint rejects required", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    captured.complete = vi
      .fn()
      .mockRejectedValueOnce(err400('{"detail":"Invalid tool_choice value: required"}'))
      .mockResolvedValueOnce(toolReply("t1"))
      .mockResolvedValueOnce(textReply("Answer [1]."));
    const { openSearch } = fakeSession();
    const out = await handleChat({ messages: [{ role: "user", content: "hi" }] }, ENV, { openSearch });
    expect(out.status).toBe(200);
    expect(captured.complete.mock.calls[1][0].toolChoice).toBe("auto");
    expect(warn).toHaveBeenCalledWith("tool_choice_fallback", "required");
  });

  it("drops the tools when the endpoint rejects none", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    captured.complete = vi
      .fn()
      .mockResolvedValueOnce(toolReply("t1"))
      .mockRejectedValueOnce(err400("toolChoice none is not supported"))
      .mockResolvedValueOnce(textReply("Final."));
    const { openSearch } = fakeSession();
    const out: any = await handleChat({ messages: [{ role: "user", content: "hi" }] }, { ...ENV, MAX_TOOL_ROUNDS: "1" }, { openSearch });
    expect(out.json.answer).toBe("Final.");
    const retry = captured.complete.mock.calls[2][0];
    expect(retry).not.toHaveProperty("tools");
    expect(retry).not.toHaveProperty("toolChoice");
  });

  it("falls back when the endpoint rejects required with a 422", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const err422 = Object.assign(new Error("API error occurred: Status 422"), {
      statusCode: 422,
      body: '{"detail":[{"loc":["body","tool_choice"],"msg":"Input should be auto, none or any"}]}',
    });
    captured.complete = vi
      .fn()
      .mockRejectedValueOnce(err422)
      .mockResolvedValueOnce(toolReply("t1"))
      .mockResolvedValueOnce(textReply("Answer [1]."));
    const { openSearch } = fakeSession();
    const out = await handleChat({ messages: [{ role: "user", content: "hi" }] }, ENV, { openSearch });
    expect(out.status).toBe(200);
    expect(captured.complete.mock.calls[1][0].toolChoice).toBe("auto");
    expect(warn).toHaveBeenCalledWith("tool_choice_fallback", "required");
  });

  it("does not fall back on a 5xx that names tool_choice", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const err500 = Object.assign(new Error("API error occurred: Status 500"), { statusCode: 500, body: "tool_choice crashed" });
    captured.complete = vi.fn().mockRejectedValue(err500);
    const { openSearch } = fakeSession();
    await handleChat({ messages: [{ role: "user", content: "hi" }] }, ENV, { openSearch });
    expect(captured.complete.mock.calls.every((c: any[]) => c[0].toolChoice === "required")).toBe(true);
  });

  // Regression: on small talk the Scaleway model ignores "required", writes a
  // reply and does not stop before the 25 s model timeout.
  it("caps the length of the required call only", async () => {
    captured.complete = vi
      .fn()
      .mockResolvedValueOnce(toolReply("t1"))
      .mockResolvedValueOnce(textReply("Final."));
    const { openSearch } = fakeSession();
    await handleChat({ messages: [{ role: "user", content: "hi" }] }, { ...ENV, MAX_TOOL_ROUNDS: "1" }, { openSearch });
    expect(captured.complete.mock.calls[0][0].maxTokens).toBe(REQUIRED_CALL_MAX_TOKENS);
    expect(captured.complete.mock.calls[1][0]).not.toHaveProperty("maxTokens");
  });

  it("keeps the cap when required falls back to auto", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    captured.complete = vi
      .fn()
      .mockRejectedValueOnce(err400('{"detail":"Invalid tool_choice value: required"}'))
      .mockResolvedValueOnce(toolReply("t1"))
      .mockResolvedValueOnce(textReply("Answer [1]."));
    const { openSearch } = fakeSession();
    await handleChat({ messages: [{ role: "user", content: "hi" }] }, ENV, { openSearch });
    expect(captured.complete.mock.calls[1][0].toolChoice).toBe("auto");
    expect(captured.complete.mock.calls[1][0].maxTokens).toBe(REQUIRED_CALL_MAX_TOKENS);
  });

  it("searches for the question when the capped call returns text", async () => {
    captured.complete = vi
      .fn()
      .mockResolvedValueOnce({ choices: [{ finishReason: "length", message: { content: "Yes, it is! OSE", toolCalls: null } }] })
      .mockResolvedValueOnce(textReply("Final."));
    const { session, openSearch } = fakeSession();
    const out: any = await handleChat({ messages: [{ role: "user", content: "that is so cool" }] }, { ...ENV, MAX_TOOL_ROUNDS: "1" }, { openSearch });
    expect(out.json.answer).toBe("Final.");
    expect(session.search).toHaveBeenCalledWith("that is so cool");
  });

  it("drops a tool call the cap cut short", async () => {
    captured.complete = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{
          finishReason: "length",
          message: {
            content: "",
            toolCalls: [
              { id: "t1", function: { name: "search_docs", arguments: '{"query":"OSE fees"}' } },
              { id: "t2", function: { name: "search_docs", arguments: '{"' } },
            ],
          },
        }],
      })
      .mockResolvedValueOnce(textReply("Final."));
    const { session, openSearch } = fakeSession();
    await handleChat({ messages: [{ role: "user", content: "fees?" }] }, { ...ENV, MAX_TOOL_ROUNDS: "1" }, { openSearch });
    expect(session.search).toHaveBeenCalledTimes(1);
    expect(session.search).toHaveBeenCalledWith("OSE fees");
    const sent = captured.complete.mock.calls[1][0].messages.find((m: any) => m.role === "assistant");
    expect(sent.toolCalls.map((t: any) => t.id)).toEqual(["t1"]);
  });

  it("searches for the question when the cap cut the only tool call", async () => {
    captured.complete = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [{ finishReason: "length", message: { content: "", toolCalls: [{ id: "t1", function: { name: "search_docs", arguments: '{"que' } }] } }],
      })
      .mockResolvedValueOnce(textReply("Final."));
    const { session, openSearch } = fakeSession();
    const out: any = await handleChat({ messages: [{ role: "user", content: "fees?" }] }, { ...ENV, MAX_TOOL_ROUNDS: "1" }, { openSearch });
    expect(out.status).toBe(200);
    expect(session.search).toHaveBeenCalledWith("fees?");
  });

  it("does not fall back on a 400 about something else", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    captured.complete = vi.fn().mockRejectedValue(err400("messages too long"));
    const { openSearch } = fakeSession();
    const out = await handleChat({ messages: [{ role: "user", content: "hi" }] }, ENV, { openSearch });
    expect(out.status).toBe(500);
    expect(captured.complete).toHaveBeenCalledTimes(1);
  });
});

describe("error logging", () => {
  afterEach(() => {
    captured.complete = null;
    vi.restoreAllMocks();
  });

  it("logs the status and name, never the message or body", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    captured.complete = vi.fn().mockRejectedValue(Object.assign(new Error("secret question text"), { statusCode: 400, body: "secret body" }));
    const { openSearch } = fakeSession();
    await handleChat({ messages: [{ role: "user", content: "hi" }] }, ENV, { openSearch });
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).not.toMatch(/secret/);
    expect(error).toHaveBeenCalledWith("chat_error", "error", 400, "Error");
  });
});

describe("limitsFromEnv", () => {
  it("uses the spec defaults", async () => {
    const { limitsFromEnv } = await import("../src/handler.js");
    expect(limitsFromEnv({} as any)).toEqual({ budgetMs: 55_000, modelTimeoutMs: 25_000, searchTimeoutMs: 10_000, maxRounds: 4, searchFirst: true });
  });

  it("clamps the overrides", async () => {
    const { limitsFromEnv } = await import("../src/handler.js");
    const l = limitsFromEnv({ CHAT_BUDGET_MS: "999999", CHAT_MODEL_TIMEOUT_MS: "999999", CHAT_SEARCH_TIMEOUT_MS: "999999", MAX_TOOL_ROUNDS: "50" } as any);
    expect(l).toMatchObject({ budgetMs: 240_000, modelTimeoutMs: 120_000, searchTimeoutMs: 220_000, maxRounds: 6 });
    expect(limitsFromEnv({ MAX_TOOL_ROUNDS: "0.5" } as any).maxRounds).toBe(1);
    expect(limitsFromEnv({ CHAT_BUDGET_MS: "60000", CHAT_SEARCH_TIMEOUT_MS: "50000" } as any).searchTimeoutMs).toBe(40_000);
  });

  it("turns the first search off with CHAT_SEARCH_FIRST=false", async () => {
    const { limitsFromEnv } = await import("../src/handler.js");
    expect(limitsFromEnv({ CHAT_SEARCH_FIRST: "false" } as any).searchFirst).toBe(false);
    expect(limitsFromEnv({ CHAT_SEARCH_FIRST: "true" } as any).searchFirst).toBe(true);
  });

  it("sends auto on the first call when the first search is off", async () => {
    captured.complete = vi.fn(async () => textReply("Hi"));
    const { session, openSearch } = fakeSession();
    await handleChat({ messages: [{ role: "user", content: "hi" }] }, { ...ENV, CHAT_SEARCH_FIRST: "false" }, { openSearch });
    expect(captured.complete.mock.calls[0][0].toolChoice).toBe("auto");
    expect(session.search).not.toHaveBeenCalled();
    captured.complete = null;
  });
});

describe("citations without markers", () => {
  afterEach(() => {
    captured.complete = null;
  });

  it("returns none when only the automatic search ran and the answer has no markers", async () => {
    captured.complete = vi.fn().mockResolvedValueOnce(textReply("No search.")).mockResolvedValueOnce(textReply("I can only help with OSE."));
    const { openSearch } = fakeSession();
    const out: any = await handleChat({ messages: [{ role: "user", content: "pizza?" }] }, ENV, { openSearch });
    expect(out.json.citations).toEqual([]);
  });

  it("returns none when the forced first search was the only one, even if the model chose it", async () => {
    captured.complete = vi.fn().mockResolvedValueOnce(toolReply("t1")).mockResolvedValueOnce(textReply("I can only help with OSE."));
    const { openSearch } = fakeSession();
    const out: any = await handleChat({ messages: [{ role: "user", content: "pizza?" }] }, ENV, { openSearch });
    expect(out.json.citations).toEqual([]);
  });

  it("keeps them without markers when the model searched again after the first round", async () => {
    captured.complete = vi
      .fn()
      .mockResolvedValueOnce(toolReply("t1"))
      .mockResolvedValueOnce(toolReply("t2"))
      .mockResolvedValueOnce(textReply("OSE is a fiscal host."));
    const { openSearch } = fakeSession();
    const out: any = await handleChat({ messages: [{ role: "user", content: "what?" }] }, ENV, { openSearch });
    expect(out.json.citations.length).toBe(1);
  });

  it("keeps them without markers when the first search is off and the model searched", async () => {
    captured.complete = vi.fn().mockResolvedValueOnce(toolReply("t1")).mockResolvedValueOnce(textReply("OSE is a fiscal host."));
    const { openSearch } = fakeSession();
    const out: any = await handleChat({ messages: [{ role: "user", content: "what?" }] }, { ...ENV, CHAT_SEARCH_FIRST: "false" }, { openSearch });
    expect(out.json.citations.length).toBe(1);
  });

  it("returns none when the docs did not answer", async () => {
    captured.complete = vi.fn().mockResolvedValueOnce(toolReply("t1")).mockResolvedValueOnce(textReply("Not covered [1].\n[[unanswered]]"));
    const { openSearch } = fakeSession();
    const out: any = await handleChat({ messages: [{ role: "user", content: "what?" }] }, ENV, { openSearch });
    expect(out.json).toMatchObject({ citations: [], unanswered: true });
  });
});

describe("cold MCP connect", () => {
  afterEach(() => {
    captured.complete = null;
  });

  it("gives the first connect up to 25 s, minus the reserve", async () => {
    captured.complete = vi.fn(async () => textReply("Hi"));
    const { openSearch } = fakeSession();
    let t = 0;
    await handleChat({ messages: [{ role: "user", content: "hi" }] }, ENV, { openSearch, now: () => t });
    const connectTimeoutMs = (openSearch.mock.calls[0] as any)[1].connectTimeoutMs;
    expect(connectTimeoutMs()).toBe(25_000); // 55 s left - 30 s reserve
    t = 10_000;
    expect(connectTimeoutMs()).toBe(15_000);
  });
});

describe("remembered tool_choice fallback", () => {
  afterEach(async () => {
    captured.complete = null;
    vi.restoreAllMocks();
    (await import("../src/handler.js")).resetToolChoiceFallbacks();
  });

  it("costs one failed call per process, not one per request", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const reject = Object.assign(new Error("400"), { statusCode: 400, body: "unsupported tool_choice: required" });
    captured.complete = vi.fn(async (req: any) => {
      if (req.toolChoice === "required") throw reject;
      return textReply("Hi");
    });
    const { openSearch } = fakeSession();
    await handleChat({ messages: [{ role: "user", content: "a" }] }, { ...ENV, CHAT_SEARCH_FIRST: "true" }, { openSearch });
    const failedFirst = captured.complete.mock.calls.filter((c: any[]) => c[0].toolChoice === "required").length;
    expect(failedFirst).toBe(1);
    captured.complete.mockClear();
    await handleChat({ messages: [{ role: "user", content: "b" }] }, ENV, { openSearch });
    expect(captured.complete.mock.calls.some((c: any[]) => c[0].toolChoice === "required")).toBe(false);
    expect(captured.complete.mock.calls[0][0].toolChoice).toBe("auto");
  });
});

describe("analytics after a search outage", () => {
  afterEach(() => {
    captured.complete = null;
    vi.restoreAllMocks();
  });

  it("logs unanswered as false, so an outage is not a doc gap", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    captured.complete = vi.fn().mockResolvedValueOnce(toolReply("t1")).mockResolvedValueOnce(textReply("Not covered.\n[[unanswered]]"));
    const { openSearch } = fakeSession(async () => {
      throw new ChatFailure("timeout");
    });
    const out: any = await handleChat({ messages: [{ role: "user", content: "q" }], analyticsOptIn: true }, ENV, { openSearch });
    expect(out.json.unanswered).toBe(true);
    const line = JSON.parse(String(log.mock.calls.find((c) => String(c[0]).startsWith("ANALYTICS "))![0]).slice(10));
    expect(line.unanswered).toBe(false);
  });
});
