export type InlinePart = { kind: 'text' | 'strong' | 'mark'; text: string };

const MARKUP = /\*\*(.+?)\*\*|==(.+?)==/g;

/**
 * Splits body text into plain, bold (`**bold**`) and highlighted
 * (`==highlight==`) runs. Nothing else is interpreted, so content never
 * carries HTML.
 */
export function inlineParts(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let last = 0;
  for (const match of text.matchAll(MARKUP)) {
    if (match.index > last) parts.push({ kind: 'text', text: text.slice(last, match.index) });
    parts.push(match[1] !== undefined ? { kind: 'strong', text: match[1] } : { kind: 'mark', text: match[2]! });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}

export type LinkPart = { kind: 'text' | 'link'; text: string };

// A bare http(s) URL, up to whitespace or a closing parenthesis.
const URL_PATTERN = /https?:\/\/[^\s)]+/g;

/**
 * Splits plain text into text runs and bare URLs, so a template can render
 * each URL as a link. Trailing sentence punctuation stays outside the link.
 */
export function linkParts(text: string): LinkPart[] {
  const parts: LinkPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0].replace(/[.,;:!?]+$/, '');
    if (match.index > last) parts.push({ kind: 'text', text: text.slice(last, match.index) });
    parts.push({ kind: 'link', text: url });
    last = match.index + url.length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}
