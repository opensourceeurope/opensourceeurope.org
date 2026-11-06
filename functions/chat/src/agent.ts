import { SEARCH_TOOL, toolSchema, type Citation } from "./mcp.js";

export interface ChatMessage { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; name?: string; }
export interface ToolCall { id: string; function: { name: string; arguments: string }; }
export interface MistralResponse { content: string | null; tool_calls?: ToolCall[]; }
export type ToolChoice = "auto" | "required" | "none";
/**
 * One model call. With onText the call streams: every piece of answer text is
 * passed to onText as it arrives, and the full response is still returned.
 */
export type MistralChat = (
  messages: any[],
  tools: any[],
  toolChoice: ToolChoice,
  onText?: (text: string) => void,
) => Promise<MistralResponse>;
export type SearchFn = (query: string) => Promise<{ text: string; citations: Citation[] }>;

export interface AgentResult {
  answer: string;
  citations: Citation[];
  /** Number of model calls made, including a forced final call. */
  rounds: number;
  /** True when the answer came from the forced, tool-free final call. */
  forced: boolean;
  /** True when the only searches were the forced round-1 ones (searchFirst). */
  autoSearchOnly: boolean;
  /** True when a search failed and the answer was forced early. */
  searchFailed: boolean;
}

// Progress events, emitted in order. They let a caller (the SSE transport)
// report progress without changing the loop itself. "writing" and "delta" are
// emitted only with the stream option: "writing" when the forced call starts or
// when a round's first answer text arrives, "delta" for each piece of text.
// A round that turns out to call tools after some text was streamed is followed
// by a "search" or a "writing" event, which tells the caller to drop that text.
export type AgentEvent =
  | { type: "model_call"; round: number; toolChoice: ToolChoice }
  | { type: "writing"; round: number }
  | { type: "delta"; round: number; text: string }
  | { type: "search"; round: number; query: string }
  | { type: "search_done"; round: number; query: string; citations: Citation[] }
  | { type: "search_failed"; round: number; query: string }
  | { type: "answer"; round: number; answer: string; forced: boolean };

export const FALLBACK_ANSWER = "I couldn't complete the search in time. Please rephrase your question.";

// Added to the last tool result (or the question) before the forced final call.
// It is appended, not sent as its own user message: a user message straight
// after a tool message is not a valid order for every provider.
export const ANSWER_NOW_NOTE =
  "No more searches are possible. Answer the question now, using only what the searches above returned.";

// The tool result the model gets when a search fails.
export const SEARCH_UNAVAILABLE = "The documentation search is unavailable right now. No results.";

// A search round is started only when at least this much of the request budget
// is left: room for the search itself plus a final model call.
export const DEFAULT_SEARCH_RESERVE_MS = 30_000;

/** The error the agent throws when the caller aborts the request. */
export class AbortedError extends Error {
  constructor() {
    super("aborted");
    this.name = "AbortError";
  }
}

// Id of the search the agent starts itself. Mistral wants 9 alphanumerics.
export const AUTO_SEARCH_ID = "autosrch1";

// The question to search for when the model does not choose a query itself.
function lastQuestion(messages: ChatMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user");
  return (last?.content ?? "").slice(0, 300);
}

function withNote(messages: ChatMessage[], note: string | undefined): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (!note || last?.role !== "user") return messages;
  return [...messages.slice(0, -1), { ...last, content: `${last.content}\n\n${note}` }];
}

function dedupeByUrl(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter((c) => (c.url && !seen.has(c.url) ? (seen.add(c.url), true) : false));
}

function queryOf(tc: ToolCall): string {
  try {
    return JSON.parse(tc.function.arguments).query ?? "";
  } catch {
    return "";
  }
}

// Append the answer-now note to the last tool result or user message, so no
// user message follows a tool message directly.
function addAnswerNowNote(messages: any[]): void {
  const last = messages[messages.length - 1];
  if (last && (last.role === "tool" || last.role === "user")) {
    messages[messages.length - 1] = { ...last, content: `${last.content}\n\n${ANSWER_NOW_NOTE}` };
  } else {
    messages.push({ role: "user", content: ANSWER_NOW_NOTE });
  }
}

export async function runAgent(opts: {
  persona: string;
  userMessages: ChatMessage[];
  mistralChat: MistralChat;
  search: SearchFn;
  maxRounds?: number;
  /** Milliseconds left in the request budget. Unlimited when omitted. */
  timeLeftMs?: () => number;
  searchReserveMs?: number;
  /**
   * Ground every answer in at least one search (default true). The first call
   * requires a tool call; if the model answers anyway, its text is dropped and
   * the agent searches for the question itself.
   */
  searchFirst?: boolean;
  onEvent?: (e: AgentEvent) => void;
  /**
   * Stream the calls that may give the final answer (every call except a
   * forced round-1 search) and emit their text as "delta" events.
   */
  stream?: boolean;
  /** Aborts the loop between steps, for example when the client disconnects. */
  signal?: AbortSignal;
  /** Added to the last user message the model sees. The automatic search uses the question without it. */
  questionNote?: string;
}): Promise<AgentResult> {
  const { persona, userMessages, mistralChat, search } = opts;
  const maxRounds = opts.maxRounds ?? 4;
  const timeLeft = opts.timeLeftMs ?? (() => Number.POSITIVE_INFINITY);
  const reserve = opts.searchReserveMs ?? DEFAULT_SEARCH_RESERVE_MS;
  const emit = opts.onEvent ?? (() => {});
  const searchFirst = opts.searchFirst ?? true;
  const messages: any[] = [{ role: "system", content: persona }, ...withNote(userMessages, opts.questionNote)];
  const citations: Citation[] = [];
  let autoSearches = 0;
  let modelSearches = 0;
  let searchFailed = false;
  const checkAbort = () => {
    if (opts.signal?.aborted) throw new AbortedError();
  };
  // The onText callback for one streamed call, or undefined when not streaming.
  const textSink = (round: number, writingSent: boolean) => {
    if (!opts.stream) return undefined;
    let sent = writingSent;
    return (text: string) => {
      if (!text) return;
      if (!sent) {
        sent = true;
        emit({ type: "writing", round });
      }
      emit({ type: "delta", round, text });
    };
  };

  const finish = (round: number, text: string | null, forced: boolean): AgentResult => {
    const answer = text && text.trim() ? text : FALLBACK_ANSWER;
    emit({ type: "answer", round, answer, forced });
    return {
      answer,
      citations: dedupeByUrl(citations),
      rounds: round,
      forced,
      autoSearchOnly: autoSearches > 0 && modelSearches === 0,
      searchFailed,
    };
  };

  let round = 0;
  loop: while (round < maxRounds) {
    checkAbort();
    round++;
    const toolChoice: ToolChoice = searchFirst && round === 1 ? "required" : "auto";
    emit({ type: "model_call", round, toolChoice });
    // A required call never gives the answer, so it is not streamed.
    const onText = toolChoice === "auto" ? textSink(round, false) : undefined;
    let res = onText
      ? await mistralChat(messages, [toolSchema], toolChoice, onText)
      : await mistralChat(messages, [toolSchema], toolChoice);
    // A round-1 search under searchFirst counts as automatic even when the
    // model picked the query: it was forced to search, so the results may have
    // nothing to do with an off-topic or declined answer.
    const auto = searchFirst && round === 1;
    if (!res.tool_calls || res.tool_calls.length === 0) {
      if (!auto) return finish(round, res.content, false);
      // Not every provider honours "required": search for the question ourselves.
      res = {
        content: "",
        tool_calls: [{ id: AUTO_SEARCH_ID, function: { name: SEARCH_TOOL, arguments: JSON.stringify({ query: lastQuestion(userMessages) }) } }],
      };
    }
    // Not enough budget left to search and still answer: drop this tool-call
    // turn (it would have no tool results) and answer from what we have.
    if (timeLeft() < reserve) break;
    const calls = res.tool_calls ?? [];
    messages.push({ role: "assistant", content: res.content ?? "", tool_calls: calls });
    for (const tc of calls) {
      const query = queryOf(tc);
      if (searchFailed) {
        // Every tool call needs a result; don't try again after a failure.
        messages.push({ role: "tool", name: tc.function.name, tool_call_id: tc.id, content: SEARCH_UNAVAILABLE });
        continue;
      }
      checkAbort();
      emit({ type: "search", round, query });
      try {
        const r = await search(query);
        checkAbort();
        if (auto) autoSearches++;
        else modelSearches++;
        citations.push(...r.citations);
        emit({ type: "search_done", round, query, citations: r.citations });
        messages.push({ role: "tool", name: tc.function.name, tool_call_id: tc.id, content: r.text });
      } catch (e) {
        if (e instanceof AbortedError) throw e;
        // A failed or slow search does not fail the request: the model answers
        // from the earlier rounds' results.
        searchFailed = true;
        emit({ type: "search_failed", round, query });
        messages.push({ role: "tool", name: tc.function.name, tool_call_id: tc.id, content: SEARCH_UNAVAILABLE });
      }
    }
    if (searchFailed || timeLeft() < reserve) break loop;
  }

  // Search budget used up: one last call that may not call tools.
  checkAbort();
  round++;
  addAnswerNowNote(messages);
  emit({ type: "model_call", round, toolChoice: "none" });
  if (opts.stream) emit({ type: "writing", round });
  const onText = textSink(round, true);
  const res = onText
    ? await mistralChat(messages, [toolSchema], "none", onText)
    : await mistralChat(messages, [toolSchema], "none");
  return finish(round, res.content, true);
}
