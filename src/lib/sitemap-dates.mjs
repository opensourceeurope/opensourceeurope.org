// The <lastmod> dates of the sitemap. Search engines and AI crawlers use them to
// decide what to fetch again. Only pages with a reliable date get one:
// - docs pages: the "Last updated" date that the docs show, from git;
// - blog posts: `updated`, or else `date`, from the front matter;
// - legal pages: `updated` from the front matter.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { docsCommitDates } from './docs-git-dates.mjs';

/** The URL path of a docs file: docs/index.mdx is /docs/, docs/faq/index.md is /docs/faq/, docs/a/b.md is /docs/a/b/. */
export function docsPath(file) {
  const path = file
    .replace(/\\/g, '/')
    .replace(/\.mdx?$/, '')
    .replace(/(^|\/)index$/, '');
  return `/${path}/`.replace(/\/+/g, '/');
}

/** The value of a top-level key in a Markdown file's front matter. */
export function frontMatterValue(text, key) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
  const line = block.split(/\r?\n/).find((l) => l.startsWith(`${key}:`));
  return line?.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') || undefined;
}

/** The Markdown files of a folder, as [name without extension, text]. */
function markdownFiles(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => [f.replace(/\.md$/, ''), readFileSync(join(dir, f), 'utf8')]);
}

/** A map from URL path to its last change, as an ISO date. */
export function sitemapDates(cwd = process.cwd()) {
  const dates = new Map();
  for (const [file, time] of docsCommitDates('docs', cwd)) {
    dates.set(docsPath(file), new Date(time).toISOString());
  }
  for (const [slug, text] of markdownFiles(join(cwd, 'src/content/blog'))) {
    if (frontMatterValue(text, 'draft') === 'true') continue;
    const date = frontMatterValue(text, 'updated') ?? frontMatterValue(text, 'date');
    if (date) dates.set(`/blog/${slug}/`, new Date(date).toISOString());
  }
  for (const [slug, text] of markdownFiles(join(cwd, 'src/content/legal'))) {
    const date = frontMatterValue(text, 'updated');
    if (date) dates.set(`/${slug}/`, new Date(date).toISOString());
  }
  return dates;
}
