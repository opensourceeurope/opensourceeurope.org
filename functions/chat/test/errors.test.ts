import { describe, it, expect, vi } from "vitest";
import { classifyError, errorResponse, withRetry, ChatFailure } from "../src/errors.js";

const httpErr = (statusCode: number) => Object.assign(new Error(`status ${statusCode}`), { statusCode });
const named = (name: string) => Object.assign(new Error(name), { name });

describe("classifyError", () => {
  it.each([
    ["429 from the model API", httpErr(429), "busy"],
    ["503 from the model API", httpErr(503), "unavailable"],
    ["500 from the model API", httpErr(500), "unavailable"],
    ["400 from the model API (our fault)", httpErr(400), "error"],
    ["SDK request timeout", named("RequestTimeoutError"), "timeout"],
    ["AbortSignal.timeout", named("TimeoutError"), "timeout"],
    ["SDK connection error", named("ConnectionError"), "unavailable"],
    ["fetch failed", new TypeError("fetch failed"), "unavailable"],
    ["MCP request timeout", Object.assign(new Error("t"), { code: -32001 }), "timeout"],
    ["an explicit failure", new ChatFailure("busy"), "busy"],
    ["anything else", new Error("boom"), "error"],
  ])("%s", (_n, e, code) => {
    expect(classifyError(e)).toBe(code);
  });
});

describe("errorResponse", () => {
  it.each([
    ["busy", 429],
    ["unavailable", 503],
    ["timeout", 504],
    ["bad_request", 400],
    ["error", 500],
  ] as const)("%s -> %i", (code, status) => {
    expect(errorResponse(code)).toEqual({ status, json: { error: code } });
  });
});

describe("withRetry", () => {
  it("retries a transient error once", async () => {
    const fn = vi.fn().mockRejectedValueOnce(httpErr(503)).mockResolvedValueOnce("ok");
    await expect(withRetry(fn, { delayMs: 0 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after one retry", async () => {
    const fn = vi.fn().mockRejectedValue(httpErr(429));
    await expect(withRetry(fn, { delayMs: 0 })).rejects.toMatchObject({ statusCode: 429 });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a timeout or a client error", async () => {
    for (const e of [named("RequestTimeoutError"), httpErr(400)]) {
      const fn = vi.fn().mockRejectedValue(e);
      await expect(withRetry(fn, { delayMs: 0 })).rejects.toBe(e);
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  it("does not retry when the caller says there is no time left", async () => {
    const fn = vi.fn().mockRejectedValue(httpErr(503));
    await expect(withRetry(fn, { delayMs: 0, canRetry: () => false })).rejects.toBeTruthy();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
