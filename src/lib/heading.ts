import type { Decor, HeadingData } from './sections';

export const GLYPHS: Record<Decor, string> = {
  underscore: '_',
  chevron: '<',
  'chevron-underscore': '<_',
  parens: '()',
};

export type HeadingPart = { kind: 'text' | 'highlight' | 'decor'; text: string };

/**
 * Splits a heading into the parts the component renders. The decor glyph
 * follows the first occurrence of `decorAfter`, or ends the heading. The
 * first occurrence of each `highlight` becomes a highlight part.
 */
export function headingParts(heading: HeadingData): HeadingPart[] {
  const { text, decor, decorAfter } = heading;
  const ranges = (heading.highlight === undefined ? [] : [heading.highlight].flat())
    .map((h) => [text.indexOf(h), text.indexOf(h) + h.length] as const)
    .filter(([start]) => start >= 0);
  const decorAt = !decor
    ? -1
    : decorAfter && text.includes(decorAfter)
      ? text.indexOf(decorAfter) + decorAfter.length
      : text.length;

  const cuts = [...new Set([0, text.length, decorAt, ...ranges.flat()].filter((i) => i >= 0))].sort((a, b) => a - b);
  const parts: HeadingPart[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const from = cuts[i]!;
    const to = cuts[i + 1]!;
    const highlighted = ranges.some(([start, end]) => from >= start && to <= end);
    parts.push({ kind: highlighted ? 'highlight' : 'text', text: text.slice(from, to) });
    if (to === decorAt) parts.push({ kind: 'decor', text: GLYPHS[decor!] });
  }
  return parts;
}
