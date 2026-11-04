import type { ChatMessage } from "./agent.js";

export const MAX_MESSAGES = 12;
export const MAX_USER_CHARS = 2000;
export const MAX_ASSISTANT_CHARS = 4000;

type Turn = { role: "user" | "assistant"; content: string };

function cap(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

/**
 * Turn the conversation the browser sent into the history the model sees:
 * user and assistant text turns only, no trailing assistant turn (so the last
 * message is the visitor's question), each message capped, the last
 * MAX_MESSAGES kept. Returns null when there is no question to answer.
 */
export function prepareHistory(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const turns: Turn[] = raw.filter(
    (m): m is Turn =>
      !!m && typeof m === "object" && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
  );
  while (turns.length && turns[turns.length - 1].role === "assistant") turns.pop();
  const kept = turns.slice(-MAX_MESSAGES).map((m) => ({
    role: m.role,
    content: cap(m.content, m.role === "user" ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS),
  }));
  const last = kept[kept.length - 1];
  if (!last || !last.content.trim()) return null;
  return kept;
}
