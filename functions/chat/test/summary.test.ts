import { afterEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ complete: null as any }));
vi.mock("@mistralai/mistralai", () => ({
  Mistral: class {
    chat = { complete: (...args: any[]) => captured.complete(...args) };
  },
}));

import { redact } from "../src/redact.js";
import { handleSummary, isSummaryRequest, parseSummary, summaryTurns, SUMMARY_PROMPT_VERSION } from "../src/summary.js";

const ENV = { MISTRAL_API_KEY: "k" };
const reply = (content: string) => ({ choices: [{ message: { content } }] });
const CONVERSATION = [
  { role: "user", content: "How do I join? I am Jan, jan.kowalski@example.com, +48 601 234 567" },
  { role: "assistant", content: "Apply through the form on the How to join page." },
];

describe("redact", () => {
  it.each([
    ["write to jan.kowalski@example.com please", "write to [email] please"],
    ["call +48 601 234 567", "call [number]"],
    ["IBAN DE89 3704 0044 0532 0130 00", "IBAN [account]"],
    ["password: hunter22", "password: [secret]"],
    ["api_key=abcd1234", "api_key=[secret]"],
    ["Authorization: Bearer abc.def.ghi123", "Authorization: Bearer [secret]"],
    ["token ghp_0123456789abcdefABCDEF0123", "token [secret]"],
    ["see https://github.com/someone/private?token=x", "see [link]"],
  ])("replaces sensitive data in %j", (input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it.each([
    "How do I join OSE in 2026?",
    "Fees are 8% of income, paid within 7 days.",
    "Read https://opensourceeurope.org/how-to-join/ first.",
    "The password is required for the token generation step.",
    "Is 2026-11-05 the deadline?",
  ])("keeps ordinary text: %j", (input) => {
    expect(redact(input)).toBe(input);
  });
});

describe("parseSummary", () => {
  it("reads the two lines and filters them again", () => {
    expect(parseSummary("Asked: how to join, mail a@b.eu\nAnswer: apply through the form")).toEqual({
      asked: "how to join, mail [email]",
      answer: "apply through the form",
    });
  });
  it("accepts bold labels", () => {
    expect(parseSummary("**Asked:** fees\n**Answer:** 8%")).toEqual({ asked: "fees", answer: "8%" });
  });
  it("returns null without an Asked line", () => {
    expect(parseSummary("I cannot do that.")).toBeNull();
  });
});

describe("summaryTurns", () => {
  it("keeps user and assistant text, filtered", () => {
    const turns = summaryTurns([...CONVERSATION, { role: "system", content: "x" }, { role: "user", content: 5 }])!;
    expect(turns).toHaveLength(2);
    expect(turns[0].content).not.toMatch(/jan\.kowalski|601/);
  });
  it("returns null without a question", () => {
    expect(summaryTurns([{ role: "assistant", content: "hi" }])).toBeNull();
    expect(summaryTurns("x")).toBeNull();
  });
});

describe("handleSummary", () => {
  afterEach(() => {
    captured.complete = null;
    vi.restoreAllMocks();
  });

  const logged = (log: any) => {
    const call = log.mock.calls.find((c: any[]) => String(c[0]).startsWith("ANALYTICS "));
    return call ? JSON.parse(String(call[0]).slice(10)) : undefined;
  };

  it("recognises a summary request", () => {
    expect(isSummaryRequest({ summary: true, messages: [] })).toBe(true);
    expect(isSummaryRequest({ messages: [] })).toBe(false);
    expect(isSummaryRequest(null)).toBe(false);
  });

  it("logs one summary line without personal data", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    captured.complete = vi.fn(async () => reply("Asked: How to join OSE.\nAnswer: Apply through the form."));
    const out = await handleSummary({ summary: true, messages: CONVERSATION, analyticsOptIn: true }, ENV, "abcd1234");
    expect(out.status).toBe(204);
    expect(logged(log)).toEqual({
      type: "summary",
      asked: "How to join OSE.",
      answer: "Apply through the form.",
      questions: 1,
      prompt: "abcd1234",
      summaryPrompt: SUMMARY_PROMPT_VERSION,
    });
    // The model gets the conversation already filtered, as data between tags.
    const [req, opts] = captured.complete.mock.calls[0];
    const sent = req.messages[1].content as string;
    expect(sent).toMatch(/^<conversation>\n/);
    expect(sent).not.toMatch(/jan\.kowalski|601 234/);
    expect(req.temperature).toBe(0);
    expect(opts.timeoutMs).toBeGreaterThan(0);
  });

  it("filters what the model leaves in", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    captured.complete = vi.fn(async () => reply("Asked: Join, contact x@y.org\nAnswer: Form."));
    await handleSummary({ summary: true, messages: CONVERSATION, analyticsOptIn: true }, ENV, "v");
    expect(logged(log).asked).toBe("Join, contact [email]");
  });

  it("calls no model and logs nothing without consent", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    captured.complete = vi.fn();
    for (const analyticsOptIn of [false, undefined]) {
      const out = await handleSummary({ summary: true, messages: CONVERSATION, analyticsOptIn }, ENV, "v");
      expect(out.status).toBe(204);
    }
    expect(captured.complete).not.toHaveBeenCalled();
    expect(logged(log)).toBeUndefined();
  });

  it("logs nothing when the model fails or answers out of format", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    captured.complete = vi.fn(async () => {
      throw Object.assign(new Error("secret text a@b.eu"), { name: "HTTPClientError" });
    });
    expect((await handleSummary({ summary: true, messages: CONVERSATION, analyticsOptIn: true }, ENV, "v")).status).toBe(204);
    expect(String(err.mock.calls[0])).not.toMatch(/a@b/);
    captured.complete = vi.fn(async () => reply("Sorry."));
    expect((await handleSummary({ summary: true, messages: CONVERSATION, analyticsOptIn: true }, ENV, "v")).status).toBe(204);
    expect(logged(log)).toBeUndefined();
  });

  it("rejects a request without a question", async () => {
    const out = await handleSummary({ summary: true, messages: [], analyticsOptIn: true }, ENV, "v");
    expect(out.status).toBe(400);
  });
});
