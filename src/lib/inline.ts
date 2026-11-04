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
