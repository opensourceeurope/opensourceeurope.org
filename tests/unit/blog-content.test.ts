import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// Blog posts: one Markdown file per post in src/content/blog/. The schema in
// src/content.config.ts checks the front matter. These tests check the rest.
const DIR = 'src/content/blog';
const files = readdirSync(DIR).filter((f) => f.endsWith('.md'));

describe('blog folder', () => {
  it('holds only Markdown posts', () => {
    expect(readdirSync(DIR).filter((f) => !f.endsWith('.md'))).toEqual([]);
  });
});

describe.each(files)('%s', (file) => {
  const text = readFileSync(join(DIR, file), 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  const data = match ? parse(match[1]) : {};
  const body = text.slice(match?.[0].length ?? 0);

  it('has a file name that is its URL', () => {
    expect(file.replace(/\.md$/, '')).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('has a title, a description and a date', () => {
    expect(data.title).toMatch(/\S/);
    expect(data.description).toMatch(/\S/);
    expect(String(data.date)).toMatch(/\d{4}-\d{2}-\d{2}|\d{4}/);
  });

  it('starts its headings at ## and skips no level', () => {
    let previous = 1;
    for (const line of body.replace(/```[\s\S]*?```/g, '').split('\n').filter((l) => /^#{1,6} /.test(l))) {
      const level = line.indexOf(' ');
      expect(level, line).toBeGreaterThan(1);
      expect(level, `h${level} after h${previous}`).toBeLessThanOrEqual(previous + 1);
      previous = level;
    }
  });

  it('links to pages, not to Markdown files, and gives every link and image text', () => {
    expect(body).not.toMatch(/\]\((?!https?:)[^)\s]*\.mdx?(#[^)]*)?\)/);
    expect(body).not.toMatch(/(?<!!)\[\s*\]\(/);
    for (const [, alt] of body.matchAll(/!\[([^\]]*)\]\(/g)) expect(alt.trim()).not.toBe('');
  });

  it('links to site pages with a trailing slash', () => {
    for (const [, href] of body.matchAll(/\]\((\/[^)#\s?]*)/g)) {
      if (!/\.[a-z0-9]+$/i.test(href)) expect(href, href).toMatch(/\/$/);
    }
  });
});
