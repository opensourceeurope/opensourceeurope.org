import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lighthouse's robots-txt audit is skipped in lighthouserc.*.json, because it reports
// Content-Signal (https://contentsignals.org) as an unknown directive. Google ignores
// directives it does not know. This test checks the rest of what that audit checks.
const KNOWN = ['user-agent', 'allow', 'disallow', 'sitemap', 'content-signal'];
const lines = readFileSync('public/robots.txt', 'utf8')
  .split('\n')
  .map((line) => line.replace(/#.*/, '').trim())
  .filter(Boolean);

describe('robots.txt', () => {
  it('uses only known directives, each as "name: value"', () => {
    for (const line of lines) {
      expect(line).toMatch(/^[A-Za-z-]+:\s*\S/);
      expect(KNOWN).toContain(line.slice(0, line.indexOf(':')).toLowerCase());
    }
  });

  it('allows every crawler and blocks nothing', () => {
    expect(lines).toContain('User-agent: *');
    expect(lines.filter((l) => /^disallow:\s*\S/i.test(l))).toEqual([]);
  });

  it('gives the sitemap as an absolute URL', () => {
    const sitemap = lines.find((l) => /^sitemap:/i.test(l));
    expect(sitemap?.slice(sitemap.indexOf(':') + 1).trim() ?? '').toMatch(/^https:\/\/www\.opensourceeurope\.org\//);
  });

  it('declares a yes or no for search, ai-input and ai-train', () => {
    const signal = lines.find((l) => /^content-signal:/i.test(l)) ?? '';
    for (const key of ['search', 'ai-input', 'ai-train']) expect(signal).toMatch(new RegExp(`\\b${key}=(yes|no)\\b`));
  });
});
