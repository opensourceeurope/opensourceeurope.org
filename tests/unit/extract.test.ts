import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractPage } from '../../scripts/live/extract';

const html = readFileSync(new URL('../fixtures/html/sample.html', import.meta.url), 'utf8');
const page = extractPage(html, 'https://example.org/sample/');

const EXCLUDED_TEXT = [
  'script text must not appear',
  'hidden-rule',
  'Skip to content',
  'Cloned heading',
  'Cloned carousel card text',
  'Gravity form label',
  'Local form label',
  'Noscript text',
  'Cookie banner text',
  'Local consent banner text',
];

describe('extractPage', () => {
  it('reads the title, description and url', () => {
    expect(page.url).toBe('https://example.org/sample/');
    expect(page.title).toBe('Sample page | Example');
    expect(page.description).toBe('A hand-written page for extractor tests.');
  });

  it('returns the h1 first, with whitespace normalised', () => {
    expect(page.headings[0]).toEqual({ level: 1, text: 'Sample heading one' });
  });

  it('strips the decorative glyphs from headings and joins per-character spans', () => {
    const texts = page.headings.map((h) => h.text);
    expect(texts).toContain('We make open source sun work');
    expect(texts).toContain('Heading with parens');
    expect(texts).toContain('Heading with underscore');
    expect(texts).toContain('Open so is public');
    expect(texts.some((t) => /[<_]|\(\)/.test(t))).toBe(false);
  });

  it('keeps a word break between block-level children and at <br> inside a heading', () => {
    const texts = page.headings.map((h) => h.text);
    expect(texts).toContain('We take care of the admin. You take care of the code');
    expect(texts).toContain('Break inside');
  });

  it('collects text blocks, treating <br> as a space and inline elements as part of the block', () => {
    expect(page.textBlocks).toContain('First paragraph with bold and a link.');
    expect(page.textBlocks).toContain('Line one line two');
    expect(page.textBlocks).toContain('List item one');
    expect(page.textBlocks).toContain('Footer text');
  });

  it('keeps heading text out of the text blocks', () => {
    expect(page.textBlocks.some((t) => t.includes('Sample heading'))).toBe(false);
  });

  it('collects images and links', () => {
    expect(page.images).toEqual([{ src: '/app/uploads/2026/01/sample.png', alt: 'Sample image' }]);
    expect(page.links).toContainEqual({ text: 'a link', href: 'https://example.org/docs' });
    expect(page.links).toContainEqual({ text: 'About', href: '/about/' });
  });

  it('drops every excluded region', () => {
    const all = JSON.stringify(page);
    for (const text of EXCLUDED_TEXT) expect(all).not.toContain(text);
  });

  it('honours a custom exclude list', () => {
    const withFooterExcluded = extractPage(html, 'https://example.org/sample/', ['script', 'footer']);
    expect(withFooterExcluded.textBlocks).not.toContain('Footer text');
    expect(withFooterExcluded.textBlocks).toContain('Cookie banner text');
  });
});
