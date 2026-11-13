import { describe, expect, it } from 'vitest';
import { docsPath, frontMatterValue, sitemapDates } from '../../src/lib/sitemap-dates.mjs';

describe('docsPath', () => {
  it('maps docs files to their URL paths', () => {
    expect(docsPath('docs/index.mdx')).toBe('/docs/');
    expect(docsPath('docs/faq/index.md')).toBe('/docs/faq/');
    expect(docsPath('docs/faq/general-faqs.md')).toBe('/docs/faq/general-faqs/');
  });
});

describe('frontMatterValue', () => {
  const text = '---\ntitle: "A post"\ndate: 2026-11-09\n---\n\nupdated: 2027-01-01\n';
  it('reads a key from the front matter only', () => {
    expect(frontMatterValue(text, 'title')).toBe('A post');
    expect(frontMatterValue(text, 'date')).toBe('2026-11-09');
    expect(frontMatterValue(text, 'updated')).toBeUndefined();
  });
});

describe('sitemapDates', () => {
  const dates = sitemapDates();
  it('dates the docs, the blog posts and the legal pages', () => {
    expect(dates.get('/docs/')).toBeDefined();
    expect(dates.get('/privacy-policy/')).toBeDefined();
    expect([...dates.keys()].some((path) => path.startsWith('/blog/'))).toBe(true);
  });
});
