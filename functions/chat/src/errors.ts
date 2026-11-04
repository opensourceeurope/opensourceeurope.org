// Error codes the function returns as { error: "<code>" }, with their status.
export type ErrorCode = "busy" | "unavailable" | "timeout" | "bad_request" | "error";

export const ERROR_STATUS: Record<ErrorCode, number> = {
  busy: 429, // upstream rate limit
  unavailable: 503, // upstream down or unreachable
  timeout: 504, // upstream too slow, or the request budget ran out
  bad_request: 400,
  error: 500,
};

/** An error that already knows which code it maps to. */
export class ChatFailure extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, options?: { cause?: unknown }) {
    super(code, options);
    this.name = "ChatFailure";
    this.code = code;
  }
}

const TIMEOUT_NAMES = new Set(["TimeoutError", "RequestTimeoutError"]);
const NETWORK_NAMES = new Set(["ConnectionError"]);
const NETWORK_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "EPIPE"]);
const MCP_REQUEST_TIMEOUT = -32001;

export function classifyError(e: unknown): ErrorCode {
  if (e instanceof ChatFailure) return e.code;
  const err = (e ?? {}) as { name?: string; message?: string; statusCode?: unknown; code?: unknown; cause?: any };
  if (err.name && TIMEOUT_NAMES.has(err.name)) return "timeout";
  if (err.code === MCP_REQUEST_TIMEOUT) return "timeout";
  if (typeof err.statusCode === "number") {
    if (err.statusCode === 429) return "busy";
    if (err.statusCode >= 500) return "unavailable";
    return "error";
  }
  if (err.name && NETWORK_NAMES.has(err.name)) return "unavailable";
  if (e instanceof TypeError && /fetch failed/i.test(err.message ?? "")) return "unavailable";
  if (typeof err.code === "string" && NETWORK_CODES.has(err.code)) return "unavailable";
  if (typeof err.cause?.code === "string" && NETWORK_CODES.has(err.cause.code)) return "unavailable";
  return "error";
}

export function errorResponse(code: ErrorCode) {
  return { status: ERROR_STATUS[code], json: { error: code } };
}

/** Rate limits, upstream 5xx and network failures are worth one more try. */
export function isTransient(e: unknown): boolean {
  const code = classifyError(e);
  return code === "busy" || code === "unavailable";
}

/** Run fn, and run it once more if it fails with a transient error. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { delayMs?: number; canRetry?: () => boolean } = {},
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isTransient(e) || (opts.canRetry && !opts.canRetry())) throw e;
    const delay = opts.delayMs ?? 500;
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    return fn();
  }
}

/** Reject with a ChatFailure("timeout") when the promise takes longer than ms. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ChatFailure("timeout")), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
