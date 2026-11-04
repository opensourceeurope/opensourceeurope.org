import type { Citation } from "./mcp.js";

// Post-processing of the model's answer, so the browser only gets sources the
// answer really used and only links that came from this request's search results.

export interface Numbered extends Citation { n?: number; }

// Inline code: the same pattern the browser's markdown.ts uses, so the
// function and the browser agree on what is code. Only the [n] markers use
// it; unlinkForeignUrls covers code too.
const CODE_SPLIT = /(`[^`\n]+`)/;

// Apply fn to the text outside inline code only.
function outsideCode(text: string, fn: (s: string) => string): string {
  return text
    .split(CODE_SPLIT)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join("");
}

// A footnote marker: [1], [1][2] are two markers, [1, 2] is one list. Not a
// marker: a markdown link label such as [2](https://...), or an index such as
// arr[1] (a word character right before the bracket).
const MARKER_RE = /(?<!\w)\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g;

function numbersIn(list: string): number[] {
  return list.split(",").map((s) => parseInt(s.trim(), 10));
}

/**
 * Keep only the citations whose [n] marker appears in the answer, renumber them
 * 1..k in order of first appearance and rewrite the markers to match. A
 * bracketed number that is no citation, such as [2025], is left as it is, and
 * so is anything inside inline code. When the answer has no marker at all, the
 * citations are returned unchanged and `marked` is false: a small model
 * sometimes forgets the markers, and the caller decides what to show.
 */
export function keepCitedSources<T extends Numbered>(
  answer: string,
  citations: T[],
): { answer: string; citations: T[]; marked: boolean } {
  const byNumber = new Map<number, T>();
  citations.forEach((c, i) => byNumber.set(c.n ?? i + 1, c));
  const isCitation = (list: string) => numbersIn(list).every((n) => byNumber.has(n));

  const order: number[] = [];
  outsideCode(answer, (part) => {
    for (const m of part.matchAll(MARKER_RE)) {
      if (!isCitation(m[1])) continue;
      for (const n of numbersIn(m[1])) if (!order.includes(n)) order.push(n);
    }
    return part;
  });
  if (order.length === 0) return { answer, citations, marked: false };

  const renumber = new Map<number, number>(order.map((old, i) => [old, i + 1]));
  const rewritten = outsideCode(answer, (part) =>
    part.replace(MARKER_RE, (m, list: string) =>
      isCitation(list) ? numbersIn(list).map((n) => `[${renumber.get(n)}]`).join("") : m,
    ),
  );
  return {
    answer: rewritten,
    citations: order.map((old, i) => ({ ...byNumber.get(old)!, n: i + 1 })),
    marked: true,
  };
}

// host + path, lower-cased host, no fragment, no query, no trailing slash. The
// scheme is ignored on purpose: http and https count as the same URL.
function urlKey(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

// [label](url) or [label](url "title"). The label may hold one level of
// brackets (a [1] marker), the URL one level of balanced parentheses. The
// title is matched only to be dropped.
const MD_LINK = String.raw`\[((?:[^\[\]]|\[[^\]]*\])+)\]\((https?:\/\/(?:[^\s()]|\([^\s()]*\))+)(?:\s+"[^"]*")?\)`;
const AUTOLINK = String.raw`<(https?:\/\/[^\s>]+)>`;
// A bare URL ends at whitespace or any of ( ) < > " ' ` ]. The browser's
// autolinker (src/scripts/chat/markdown.ts) stops at the same characters, so
// both see the same URL and text after it can't change its host.
const BARE = String.raw`(https?:\/\/[^\s<>()\`\]"']+)`;
const LINK_RE = new RegExp(`${MD_LINK}|${AUTOLINK}|${BARE}`, "gi");
const BARE_RE = new RegExp(BARE, "gi");

// Write a URL so that no Markdown renderer or autolinker sees a URL in it:
// "https://evil.example/x" becomes "https[:]//evil[.]example/x". The scheme
// separator and every dot in the host are bracketed; the path is kept.
export function defangUrl(url: string): string {
  return url.replace(
    /^(https?):\/\/([^/?#]*)/i,
    (_m, scheme: string, host: string) => `${scheme}[:]//${host.replace(/\./g, "[.]")}`,
  );
}

/**
 * Turn every http(s) URL in the answer that is not a search-result URL of this
 * request into plain text that is no URL any more: a markdown link becomes its
 * label, and a bare URL or autolink is defanged (see defangUrl). URLs are
 * compared by host and path; the fragment is ignored. A link label goes
 * through the same pass, and a result link whose label holds a foreign URL is
 * unlinked too. The pass covers the whole answer, inline code and code fences
 * included, so it does not depend on how the browser pairs backticks.
 */
export function unlinkForeignUrls(answer: string, resultUrls: string[]): string {
  const allowed = new Set(resultUrls.map(urlKey).filter((k): k is string => k !== null));
  const ok = (url: string) => {
    const key = urlKey(url);
    return key !== null && allowed.has(key);
  };
  const bare = (raw: string) => {
    // Trailing sentence punctuation is not part of a bare URL.
    const url = raw.replace(/[.,;:!?]+$/, "");
    const tail = raw.slice(url.length);
    return ok(url) ? raw : `${defangUrl(url)}${tail}`;
  };
  const bareOnly = (text: string) => text.replace(BARE_RE, (m) => bare(m));

  return answer.replace(LINK_RE, (m, label?: string, mdUrl?: string, autoUrl?: string, bareUrl?: string) => {
    if (mdUrl) {
      // A link title is dropped: a URL inside it would reach the browser.
      const cleanLabel = bareOnly(label!);
      return ok(mdUrl) && cleanLabel === label ? `[${label}](${mdUrl})` : cleanLabel;
    }
    if (autoUrl) return ok(autoUrl) ? m : defangUrl(autoUrl);
    return bare(bareUrl!);
  });
}

// The marker the chat rules ask for when the docs don't answer the main
// question. Spacing and case variants from small models are accepted too,
// also between the brackets ("[ [unanswered] ]"). The delta filter in
// stream.ts accepts the same spacing.
const UNANSWERED_RE = /[ \t]*\[\s*\[\s*unanswered\s*\]\s*\][ \t]*/gi;

/** Remove the "not in the docs" marker from the answer and report whether it was there. */
export function extractUnanswered(answer: string): { answer: string; unanswered: boolean } {
  const unanswered = UNANSWERED_RE.test(answer);
  UNANSWERED_RE.lastIndex = 0;
  if (!unanswered) return { answer, unanswered };
  return { answer: answer.replace(UNANSWERED_RE, "").replace(/\s+$/, ""), unanswered };
}

// The block of suggested next questions the chat rules allow after an answer.
// Spacing (also between the brackets), case and a "follow-ups" spelling from
// small models are accepted too.
const FOLLOWUPS_RE = /\[\s*\[\s*follow-?ups\s*\]\s*\]/i;
// A question with a link is dropped: chips show plain text only.
const URL_IN_TEXT = /\bhttps?:\/\/|\bwww\./i;
export const MAX_FOLLOWUPS = 3;
export const MAX_FOLLOWUP_CHARS = 120;

// A list bullet or number the model may put before each question.
const BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s+/;

const sameQuestion = (s: string) => s.trim().toLowerCase();

/**
 * Remove the [[followups]] block from the end of the answer and return its
 * questions: at most MAX_FOLLOWUPS, each trimmed and capped at
 * MAX_FOLLOWUP_CHARS code points (an emoji is never split), with empty lines,
 * questions with a URL, duplicates and the visitor's own question
 * (case-insensitive) left out. Everything after the marker belongs
 * to the block, so no question text stays in the answer.
 */
export function extractFollowups(answer: string, question = ""): { answer: string; followups: string[] } {
  const m = FOLLOWUPS_RE.exec(answer);
  if (!m) return { answer, followups: [] };
  const before = answer.slice(0, m.index).replace(/\s+$/, "");
  const seen = new Set<string>([sameQuestion(question)]);
  const followups: string[] = [];
  for (const line of answer.slice(m.index + m[0].length).split("\n")) {
    let q = line.replace(BULLET_RE, "").trim();
    if (!q || URL_IN_TEXT.test(q)) continue;
    const chars = Array.from(q);
    if (chars.length > MAX_FOLLOWUP_CHARS) q = `${chars.slice(0, MAX_FOLLOWUP_CHARS - 1).join("").trimEnd()}…`;
    const key = sameQuestion(q);
    if (seen.has(key)) continue;
    seen.add(key);
    followups.push(q);
    if (followups.length === MAX_FOLLOWUPS) break;
  }
  return { answer: before, followups };
}
