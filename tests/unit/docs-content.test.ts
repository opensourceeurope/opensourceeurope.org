import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { parseDocsSettings, sidebarPages } from '../../src/lib/docs-settings.mjs';

const ROOT = 'src/content/docs';
const files = (readdirSync(join(ROOT, 'docs'), { recursive: true }) as string[])
  .filter((f) => /\.mdx?$/.test(f))
  .map((f) => join(ROOT, 'docs', f));

// The slug Starlight gives a file: its path without the extension, and
// without a trailing /index.
const slugOf = (file: string) => relative(ROOT, file).replace(/\.mdx?$/, '').replace(/\/index$/, '');

const settings = parseDocsSettings(readFileSync('src/content/settings/docs.yaml', 'utf8'));
const listed = sidebarPages(settings.sidebar);

function frontmatter(text: string) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  return match ? parse(match[1]) : {};
}

describe('docs sidebar', () => {
  it('lists every docs page exactly once', () => {
    const duplicates = listed.filter((slug, i) => listed.indexOf(slug) !== i);
    expect(duplicates).toEqual([]);
    expect([...listed].sort()).toEqual(files.map(slugOf).sort());
  });
});

describe.each(files)('%s', (file) => {
  const text = readFileSync(file, 'utf8');
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, '');

  it('has a title and a description', () => {
    const data = frontmatter(text);
    expect(data.title).toMatch(/\S/);
    expect(data.description).toMatch(/\S/);
  });

  it('has no GitBook syntax left', () => {
    expect(body).not.toMatch(/\{%/);
    expect(body).not.toMatch(/<figure|<img\b/);
    expect(body).not.toMatch(/docs\.opencollective\.com\/open-source-europe/);
    // Internal links point at /docs/ pages, not at .md files.
    expect(body).not.toMatch(/\]\(\/[^)]*\.md(#[^)]*)?\)/);
  });

  it('gives every link some text', () => {
    expect(body).not.toMatch(/(?<!!)\[\s*\]\(/);
  });

  it('gives every image a text alternative', () => {
    for (const [, alt] of body.matchAll(/!\[([^\]]*)\]\(/g)) expect(alt.trim()).not.toBe('');
  });

  it('starts no heading with an emoji, which would break its anchor', () => {
    for (const line of body.split('\n').filter((l) => /^#{1,6} /.test(l))) {
      expect(line.replace(/^#+ /, '')).not.toMatch(/^\p{Extended_Pictographic}/u);
    }
  });
});
