import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

// The file a /docs/ URL path is built from, if any.
const fileFor = (urlPath: string) => {
  const base = join(ROOT, urlPath.replace(/^\/|\/$/g, ''));
  return ['.md', '.mdx', '/index.md', '/index.mdx'].map((ext) => base + ext).find((f) => existsSync(f));
};

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
    // Internal links point at /docs/ pages, not at .md files, absolute or relative.
    expect(body).not.toMatch(/\]\((?!https?:)[^)\s]*\.mdx?(#[^)]*)?\)/);
  });

  it('has a file name Starlight keeps as its URL', () => {
    // Starlight lower-cases slugs and drops dots, so such a name would not match its sidebar entry.
    for (const part of relative(join(ROOT, 'docs'), file).replace(/\.mdx?$/, '').split('/')) {
      expect(part).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('links only to docs pages that exist', () => {
    for (const [, href] of body.matchAll(/\]\((\/docs\/[^)#\s]*)/g)) expect(fileFor(href), href).toBeDefined();
    for (const [, href] of body.matchAll(/href="(\/docs\/[^"#]*)/g)) expect(fileFor(href), href).toBeDefined();
  });

  it('sends applications to the OSE apply page on Open Collective', () => {
    expect(body).not.toMatch(/oceurope\.org\/apply|typeform\.com/);
  });

  it('starts its headings at ## and skips no level', () => {
    const levels = body
      .replace(/```[\s\S]*?```/g, '')
      .split('\n')
      .filter((l) => /^#{1,6} /.test(l))
      .map((l) => l.indexOf(' '));
    let previous = 1;
    for (const level of levels) {
      expect(level, `h${level} after h${previous}`).toBeLessThanOrEqual(previous + 1);
      previous = level;
    }
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
