import { Mistral } from "@mistralai/mistralai";
import { AbortedError, runAgent, type AgentEvent, type AgentResult, type ChatMessage, type MistralChat, type MistralResponse } from "./agent.js";
import { openMcpSession, SEARCH_TIMEOUT_MS, annotateAndNumber, newRegistry, type McpSession, type NumberedCitation } from "./mcp.js";
import { ChatFailure, classifyError, errorResponse, isTransient, withRetry } from "./errors.js";
import { prepareHistory } from "./history.js";
import { extractFollowups, extractUnanswered, keepCitedSources, unlinkForeignUrls } from "./sources.js";
import { createDeltaFilter, createSseWriter, type SseEventName } from "./stream.js";
import { PERSONA } from "./persona.generated.js";
import { EARLIER_TURNS_NOTE, buildSystemPrompt, promptVersion } from "./chat-rules.js";

// The full system prompt: the shared persona plus the chat-only rules.
export const SYSTEM_PROMPT = buildSystemPrompt(PERSONA);
// Computed once at startup from every text the model gets besides the
// conversation; logged with opt-in analytics.
export const PROMPT_VERSION = promptVersion(SYSTEM_PROMPT + EARLIER_TURNS_NOTE);

export interface ChatRequest { messages: ChatMessage[]; analyticsOptIn?: boolean; }
export interface Env { MISTRAL_API_KEY: string; MISTRAL_MODEL?: string; MISTRAL_BASE_URL?: string; OSE_MCP_URL: string; MAX_TOOL_ROUNDS?: string;
  /** Overrides for slow local models. Production uses the defaults. */
  CHAT_MODEL_TIMEOUT_MS?: string; CHAT_SEARCH_TIMEOUT_MS?: string; CHAT_BUDGET_MS?: string;
  /** "false" turns off the automatic first search. */
  CHAT_SEARCH_FIRST?: string; }

// Deterministic safety net for the chat UI, which renders the numbered source
// chips itself: strip a model-written trailing "Sources"/"References" section (and
// any header-less trailing dump of bare-URL / markdown-link list items) from the
// answer, so it never duplicates the chip row. CHAT_CITATION_DIRECTIVE (chat-rules.ts) asks the
// model not to write one, but that is a prompt (the model sometimes obeys the base
// persona's "cite source + URL" instead) — this makes the de-duplication certain.
// Only a TRAILING sources block is removed: a mid-answer heading that merely reads
// "Sources" is left alone, and a URL inside a sentence is not a list item.
export function stripTrailingSourceList(answer: string): string {
  const headerRe = /^\s*(?:#{1,6}\s*)?(?:\*\*|__)?\s*(?:sources|references)\s*:?\s*(?:\*\*|__)?\s*$/i;
  const urlItemRe = /^\s*(?:[-*]|\d+[.)])?\s*<?https?:\/\/\S+>?\.?\s*$/i;
  const lines = answer.split("\n");
  // Cut from the earliest trailing "Sources"/"References" header line to the end.
  let cut = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (headerRe.test(lines[i])) cut = i;
  }
  const kept = lines.slice(0, cut);
  // Also drop trailing blank lines and header-less bare-URL / link-only list items.
  while (kept.length && (kept[kept.length - 1].trim() === "" || urlItemRe.test(kept[kept.length - 1]))) {
    kept.pop();
  }
  return kept.join("\n").replace(/\s+$/, "");
}

// Translate the agent's neutral message shape into the camelCase form the Mistral
// SDK request schema expects. The SDK validates request messages with Zod and
// silently strips unknown keys, so a snake_case `tool_calls` / `tool_call_id`
// would be dropped — sending the assistant tool-call turn with no tool calls and
// triggering a 400 ("Assistant message must have either content or tool_calls").
export function toMistralMessages(messages: any[]): any[] {
  return messages.map((m) => {
    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      return {
        role: "assistant",
        content: m.content ?? "",
        toolCalls: m.tool_calls.map((tc: any) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      };
    }
    if (m.role === "tool") {
      return { role: "tool", name: m.name, toolCallId: m.tool_call_id, content: m.content };
    }
    return m;
  });
}

// Clean the model's answer before it reaches the browser: drop a model-written
// sources list, unlink every URL that is not one of this request's search
// results, and keep only the sources the answer cites, renumbered 1..k. The
// [[unanswered]] marker is removed and reported as `unanswered`, and the
// [[followups]] block is removed and returned as `followups` (none when the
// docs did not answer).
// `citations` holds every search result of the request, so it is also the
// list of URLs the answer may link to. No citations are returned when the docs
// did not answer, or when the answer has no markers and the only search was
// the automatic first one (its results may have nothing to do with the answer).
export function finalizeAnswer(
  raw: string,
  citations: NumberedCitation[],
  opts: { autoSearchOnly?: boolean; question?: string } = {},
) {
  const { answer: withoutMarker, unanswered } = extractUnanswered(raw);
  const { answer, followups } = extractFollowups(withoutMarker, opts.question);
  const unlinked = unlinkForeignUrls(
    stripTrailingSourceList(answer),
    citations.map((c) => c.url ?? "").filter(Boolean),
  );
  const kept = keepCitedSources(unlinked, citations);
  const hide = unanswered || (!kept.marked && !!opts.autoSearchOnly);
  return { answer: kept.answer, citations: hide ? [] : kept.citations, unanswered, followups: hide ? [] : followups };
}

export const MODEL_TIMEOUT_MS = 25_000;
export const REQUEST_BUDGET_MS = 55_000;
export const DEFAULT_MAX_ROUNDS = 4;
// Upper bounds for the environment overrides.
export const MAX_MODEL_TIMEOUT_MS = 120_000;
export const MAX_BUDGET_MS = 240_000;
export const FINAL_ANSWER_RESERVE_MS = 20_000;
export const COLD_CONNECT_MAX_MS = 25_000;
// Length cap for the required first call, which only has to return search
// calls (up to about 105 tokens for five of them). Some models ignore
// "required" on small talk and write a reply that does not end before the
// model timeout. With the cap the call returns, and the agent searches for the
// question itself.
export const REQUIRED_CALL_MAX_TOKENS = 256;

function numberFromEnv(raw: string | undefined): number | undefined {
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function isCompleteArguments(args: unknown): boolean {
  if (typeof args !== "string") return args != null;
  try {
    JSON.parse(args);
    return true;
  } catch {
    return false;
  }
}

/** Timeouts and limits, from the environment, clamped to safe ranges. */
export function limitsFromEnv(env: Env) {
  const budgetMs = Math.min(numberFromEnv(env.CHAT_BUDGET_MS) ?? REQUEST_BUDGET_MS, MAX_BUDGET_MS);
  const modelTimeoutMs = Math.min(numberFromEnv(env.CHAT_MODEL_TIMEOUT_MS) ?? MODEL_TIMEOUT_MS, MAX_MODEL_TIMEOUT_MS);
  const searchTimeoutMs = clamp(
    numberFromEnv(env.CHAT_SEARCH_TIMEOUT_MS) ?? SEARCH_TIMEOUT_MS,
    1,
    Math.max(1, budgetMs - FINAL_ANSWER_RESERVE_MS),
  );
  const rounds = numberFromEnv(env.MAX_TOOL_ROUNDS);
  const maxRounds = rounds === undefined ? DEFAULT_MAX_ROUNDS : clamp(Math.floor(rounds), 1, 6);
  const searchFirst = (env.CHAT_SEARCH_FIRST ?? "").trim().toLowerCase() !== "false";
  return { budgetMs, modelTimeoutMs, searchTimeoutMs, maxRounds, searchFirst };
}

export interface HandlerDeps {
  /** Opens the per-request MCP search session. Defaults to a real connection. */
  openSearch?: (
    mcpUrl: string,
    opts: { canRetry: () => boolean; timeoutMs: number; connectTimeoutMs: () => number },
  ) => McpSession;
  now?: () => number;
  budgetMs?: number;
  /** Aborted when the client goes away: the agent stops and nothing is logged. */
  signal?: AbortSignal;
}

/** How a request reports progress; set only by the SSE transport. */
interface ChatHooks {
  stream?: boolean;
  onEvent?: (e: AgentEvent) => void;
  /** Called once the request is valid, before the first model call. */
  onStart?: () => void;
}

// Errors of the streaming request itself, not of the model API: a response
// that is no event stream, or one the SDK cannot parse. A normal call may work.
const STREAM_ERROR_NAMES = new Set(["SDKValidationError", "ResponseValidationError", "SyntaxError"]);
function isStreamSpecific(e: unknown): boolean {
  const err = e as { name?: unknown; statusCode?: unknown; body?: unknown; message?: unknown };
  if (typeof err?.name === "string" && STREAM_ERROR_NAMES.has(err.name)) return true;
  if (typeof err?.statusCode !== "number" || err.statusCode < 400 || err.statusCode >= 500) return false;
  const text = `${typeof err.body === "string" ? err.body : ""} ${typeof err.message === "string" ? err.message : ""}`;
  return /stream/i.test(text);
}

/** Rejects with AbortedError as soon as the signal aborts. */
function raceAbort<T>(p: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(new AbortedError());
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new AbortedError());
    signal.addEventListener("abort", onAbort, { once: true });
  });
  return Promise.race([p, aborted]).finally(() => signal.removeEventListener("abort", onAbort));
}

// Mistral returns either a string or a list of content chunks.
function textOf(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((c: any) => (c?.type === "text" && typeof c.text === "string" ? c.text : "")).join("");
  }
  return null;
}

// tool_choice values the endpoint rejected. Remembered for the life of the
// process, so an endpoint that rejects "required" costs one failed call, not
// one per request.
const toolChoiceFallbacks = new Set<string>();
export function resetToolChoiceFallbacks(): void {
  toolChoiceFallbacks.clear();
}

// A 4xx from the model API that complains about the tool choice value. APIs
// differ in the status: a 400 and a 422 (validation error) have both been seen.
function rejectsToolChoice(e: unknown): boolean {
  const err = e as { statusCode?: unknown; body?: unknown; message?: unknown };
  const status = err?.statusCode;
  if (typeof status !== "number" || status < 400 || status > 499) return false;
  const text = `${typeof err.body === "string" ? err.body : ""} ${typeof err.message === "string" ? err.message : ""}`;
  return /tool_choice|toolChoice/i.test(text);
}

export interface ChatResponse {
  status: number;
  json: Record<string, unknown>;
}

/** The JSON transport: one response with the finished answer. */
export function handleChat(body: ChatRequest, env: Env, deps: HandlerDeps = {}): Promise<ChatResponse> {
  return runChat(body, env, deps, {});
}

async function runChat(body: ChatRequest, env: Env, deps: HandlerDeps, hooks: ChatHooks): Promise<ChatResponse> {
  const history = prepareHistory(body?.messages);
  if (!history) return errorResponse("bad_request");
  const question = history[history.length - 1].content;
  hooks.onStart?.();

  const limits = limitsFromEnv(env);
  const now = deps.now ?? Date.now;
  const deadline = now() + (deps.budgetMs ?? limits.budgetMs);
  const timeLeft = () => deadline - now();
  // Retry only when there is still time for a meaningful second attempt.
  const canRetry = () => timeLeft() > 5_000;
  // Start a search only with room for it plus the final answer (30 s with the defaults).
  const searchReserveMs = limits.searchTimeoutMs + FINAL_ANSWER_RESERVE_MS;

  const client = new Mistral({
    apiKey: env.MISTRAL_API_KEY,
    ...(env.MISTRAL_BASE_URL ? { serverURL: env.MISTRAL_BASE_URL } : {}),
  });
  const model = env.MISTRAL_MODEL || "mistral-small-latest";

  const signal = deps.signal;
  // Request options for one model call. With a client signal, the timeout and
  // the signal are combined (the SDK ignores timeoutMs when a signal is set).
  const callOptions = () => {
    const ms = Math.min(limits.modelTimeoutMs, timeLeft());
    if (ms <= 0) throw new ChatFailure("timeout");
    if (signal?.aborted) throw new AbortedError();
    // The SDK's own retries are off: withRetry allows exactly one.
    const retries = { strategy: "none" as const };
    return signal ? { signal: AbortSignal.any([AbortSignal.timeout(ms), signal]), retries } : { timeoutMs: ms, retries };
  };

  const completeOnce = async (request: Record<string, unknown>) =>
    client.chat.complete({ model, temperature: 0.2, ...request } as any, callOptions());
  const complete = (request: Record<string, unknown>) => withRetry(() => completeOnce(request), { canRetry });

  // The request for a tool_choice value, honouring the remembered fallbacks.
  // An endpoint that does not support a value must not break every chat:
  // "required" falls back to "auto", "none" to no tools at all.
  const capFor = (toolChoice: string) => (toolChoice === "required" ? { maxTokens: REQUIRED_CALL_MAX_TOKENS } : {});
  const fallbackRequest = (wire: any[], tools: any[], toolChoice: string) =>
    toolChoice === "none" ? { messages: wire } : { messages: wire, tools, toolChoice: "auto", ...capFor(toolChoice) };
  const requestFor = (wire: any[], tools: any[], toolChoice: string) =>
    toolChoice !== "auto" && toolChoiceFallbacks.has(toolChoice)
      ? fallbackRequest(wire, tools, toolChoice)
      : { messages: wire, tools, toolChoice, ...capFor(toolChoice) };

  // One streamed call. Text goes to onText as it arrives; tool calls are
  // collected from the deltas. Text that arrives after a tool call is not
  // passed on: that round is a search round, not the answer.
  const streamOnce = async (request: Record<string, unknown>, onText: (t: string) => void, sent: { any: boolean }) => {
    const events = await client.chat.stream({ model, temperature: 0.2, ...request } as any, callOptions());
    let content = "";
    const calls: Array<{ id: string; name: string; args: string }> = [];
    for await (const ev of events as AsyncIterable<any>) {
      const delta = ev?.data?.choices?.[0]?.delta;
      for (const tc of (delta?.toolCalls ?? []) as any[]) {
        // A piece names its call by index; without one, a piece with an id
        // starts a new call and a piece without continues the last one.
        const at = typeof tc.index === "number" ? tc.index : tc.id || calls.length === 0 ? calls.length : calls.length - 1;
        const call = (calls[at] ??= { id: "", name: "", args: "" });
        if (tc.id) call.id = tc.id;
        if (tc.function?.name) call.name = tc.function.name;
        const a = tc.function?.arguments;
        if (a != null) call.args += typeof a === "string" ? a : JSON.stringify(a);
      }
      const text = textOf(delta?.content);
      if (text) {
        content += text;
        if (calls.length === 0) {
          sent.any = true;
          onText(text);
        }
      }
    }
    return {
      content,
      tool_calls: calls.filter(Boolean).map((c) => ({ id: c.id, function: { name: c.name, arguments: c.args } })),
    };
  };

  const mistralChat: MistralChat = async (messages, tools, toolChoice, onText) => {
    const wire = toMistralMessages(messages);
    if (onText) {
      const sent = { any: false };
      try {
        return await streamOnce(requestFor(wire, tools, toolChoice), onText, sent);
      } catch (e) {
        // Text already reached the browser, the client left, or the time is
        // up: no second try.
        if (sent.any || signal?.aborted || classifyError(e) === "timeout") throw e;
        const toolChoiceRejected = toolChoice !== "auto" && rejectsToolChoice(e);
        if (toolChoiceRejected) {
          toolChoiceFallbacks.add(toolChoice);
          console.warn("tool_choice_fallback", toolChoice);
        }
        const transient = isTransient(e);
        if (!toolChoiceRejected && !isStreamSpecific(e) && !(transient && canRetry())) throw e;
        // The failed stream counts as the first attempt: exactly one normal
        // call follows, without another retry. Its answer is sent as one piece.
        console.warn("stream_fallback", (e as any)?.name ?? "Error");
        if (transient) await new Promise((r) => setTimeout(r, 500));
        const r = await plainCall(wire, tools, toolChoice, completeOnce);
        if (!r.tool_calls?.length && r.content) onText(r.content);
        return r;
      }
    }
    return plainCall(wire, tools, toolChoice, complete);
  };

  // A non-streamed call. `run` is complete (with one retry) or completeOnce.
  const plainCall = async (
    wire: any[],
    tools: any[],
    toolChoice: string,
    run: (request: Record<string, unknown>) => Promise<any>,
  ): Promise<MistralResponse> => {
    const fallback = () => run(fallbackRequest(wire, tools, toolChoice));
    let r;
    if (toolChoice !== "auto" && toolChoiceFallbacks.has(toolChoice)) {
      r = await fallback();
    } else {
      try {
        r = await run({ messages: wire, tools, toolChoice, ...capFor(toolChoice) });
      } catch (e) {
        if (toolChoice === "auto" || !rejectsToolChoice(e)) throw e;
        toolChoiceFallbacks.add(toolChoice);
        console.warn("tool_choice_fallback", toolChoice);
        r = await fallback();
      }
    }
    const choice = r.choices?.[0]?.message;
    // A call cut by the length cap can end inside a tool call's arguments.
    // Sending that call back makes the next request fail, so drop it.
    const cut = r.choices?.[0]?.finishReason === "length";
    return {
      content: textOf(choice?.content),
      tool_calls: (choice?.toolCalls ?? [])
        .filter((t: any) => !cut || isCompleteArguments(t.function?.arguments))
        .map((t: any) => ({ id: t.id, function: { name: t.function.name, arguments: t.function.arguments } })),
    };
  };

  // One registry per turn: footnote numbers stay stable across every search round.
  const registry = newRegistry();
  const session = (deps.openSearch ?? ((url, o) => openMcpSession(url, o)))(env.OSE_MCP_URL, {
    canRetry,
    timeoutMs: limits.searchTimeoutMs,
    // A cold MCP container may need longer than a search to accept the first
    // connection: give it up to 25 s, minus the reserve for the search and the answer.
    connectTimeoutMs: () => Math.min(COLD_CONNECT_MAX_MS, timeLeft() - searchReserveMs),
  });

  let result: AgentResult;
  try {
    result = await runAgent({
      persona: SYSTEM_PROMPT,
      userMessages: history,
      questionNote: history.some((m) => m.role === "assistant") ? EARLIER_TURNS_NOTE : undefined,
      mistralChat,
      search: async (q) => {
        // The search has no signal of its own: stop waiting when the client leaves.
        const { text } = await raceAbort(session.search(q), signal);
        return annotateAndNumber(text, registry);
      },
      maxRounds: limits.maxRounds,
      timeLeftMs: timeLeft,
      searchReserveMs,
      searchFirst: limits.searchFirst,
      stream: hooks.stream,
      onEvent: hooks.onEvent,
      signal,
    });
  } catch (e: any) {
    if (signal?.aborted || e instanceof AbortedError) {
      // The client left: nothing to send and nothing to log.
      console.warn("chat_aborted");
      return { status: 499, json: { error: "aborted" } };
    }
    const code = classifyError(e);
    // Log only the code, the upstream status and the error name: never the
    // message or an upstream body, which may echo the conversation.
    console.error("chat_error", code, typeof e?.statusCode === "number" ? e.statusCode : "-", e?.name ?? "Error");
    return errorResponse(code);
  } finally {
    await session.close();
  }
  if (result.searchFailed) console.warn("search_failed");

  const out = finalizeAnswer(result.answer, result.citations as NumberedCitation[], {
    autoSearchOnly: result.autoSearchOnly,
    question,
  });

  // Opt-in, anonymous: the number of model calls ("rounds"), whether the docs
  // answered and the prompt version. No question text: what was asked is
  // logged once as a summary without personal data (summary.ts). No IP. Lands
  // in Scaleway Cockpit (EU), which adds the time.
  if (body.analyticsOptIn) {
    // During a search outage the docs were never consulted, so the question is
    // not logged as a documentation gap.
    const unanswered = out.unanswered && !result.searchFailed;
    const line = { type: "answer", rounds: result.rounds, unanswered, prompt: PROMPT_VERSION };
    console.log(`ANALYTICS ${JSON.stringify(line)}`);
  }

  return {
    status: 200,
    json: { answer: out.answer, citations: out.citations, unanswered: out.unanswered, followups: out.followups },
  };
}

// The search query in a status event is cut to this many characters.
export const MAX_STATUS_QUERY_CHARS = 80;
const capChars = (s: string, max: number): string => {
  const chars = Array.from(s);
  return chars.length <= max ? s : `${chars.slice(0, max - 1).join("").trimEnd()}…`;
};

/**
 * The SSE transport: status events per search and when the answer starts,
 * delta events with the answer text (markers held back), then done with the
 * same object the JSON transport returns, or error with its code. `write`
 * gets raw SSE text; the caller sets the headers and ends the response.
 */
export async function handleChatStream(
  body: ChatRequest,
  env: Env,
  write: (chunk: string) => void,
  deps: HandlerDeps = {},
): Promise<void> {
  const sse = createSseWriter(write);
  const send = (event: SseEventName, data: unknown) => {
    if (!deps.signal?.aborted) sse.send(event, data);
  };
  const filter = createDeltaFilter();
  try {
    const out = await runChat(body, env, deps, {
      stream: true,
      // Right away, so the browser shows progress before the first model call ends.
      onStart: () => send("status", { kind: "searching" }),
      onEvent: (e) => {
        if (e.type === "search") {
          filter.reset();
          send("status", { kind: "searching", query: capChars(e.query, MAX_STATUS_QUERY_CHARS) });
        } else if (e.type === "writing") {
          filter.reset();
          send("status", { kind: "writing" });
        } else if (e.type === "delta") {
          const text = filter.push(e.text);
          if (text) send("delta", { text });
        }
      },
    });
    if (out.status === 200) send("done", out.json);
    else send("error", out.json);
  } catch (e: any) {
    console.error("chat_error", e?.name ?? "Error", "error");
    send("error", { error: "error" });
  } finally {
    sse.close();
  }
}
