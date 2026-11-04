import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractPage, normalise, type LivePage } from './extract';

/**
 * Headings and text blocks present on only one of the two pages, after
 * whitespace normalising, minus the strings in `allowed`. Live-only strings
 * come first, then local-only ones, each in page order.
 */
export function diffPage(live: LivePage, local: LivePage, allowed: string[] = []): string[] {
  const skip = new Set(allowed.map(normalise));
  const onlyIn = (a: string[], b: string[]) => {
    const other = new Set(b.map(normalise));
    return [...new Set(a.map(normalise))].filter((t) => t && !other.has(t) && !skip.has(t));
  };
  const headings = (p: LivePage) => p.headings.map((h) => h.text);
  return [
    ...onlyIn(headings(live), headings(local)),
    ...onlyIn(live.textBlocks, local.textBlocks),
    ...onlyIn(headings(local), headings(live)),
    ...onlyIn(local.textBlocks, live.textBlocks),
  ];
}

export type AllowedDiffs = Record<string, { diff: string; note: string }[]>;

/** Allowed differences for one route: its own entries plus the site-wide `*` entries (header, footer). */
export function allowedFor(allowed: AllowedDiffs, path: string): string[] {
  return [...(allowed['*'] ?? []), ...(allowed[path] ?? [])].map((a) => a.diff);
}

const LIVE_ORIGIN = 'https://opensourceeurope.org';
export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const USAGE = `Usage: npm run drift -- [base-url] [path ...]

Compares the text of every page on ${LIVE_ORIGIN} with a locally served build.
Start the build first in another terminal:

  npm run build && npm run preview

base-url  where the build is served (default http://localhost:4321)
path      limit the check to these routes, for example /about/ (default: all)

Differences listed in tests/fixtures/live/allowed-diffs.json are ignored, under
the page's path or under "*" for every page.
Exits 1 when any other difference remains, or when a page can't be fetched.`;

async function fetchPage(url: string): Promise<LivePage> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return extractPage(await res.text(), url);
}

async function main(args: string[]): Promise<number> {
  if (args.includes('-h') || args.includes('--help')) {
    console.log(USAGE);
    return 0;
  }
  const base = (args.find((a) => /^https?:\/\//.test(a)) ?? 'http://localhost:4321').replace(/\/$/, '');
  const { ROUTES } = await import('../../tests/e2e/routes');
  const requested = args.filter((a) => a.startsWith('/'));
  const paths = ROUTES.filter((r) => r.status === 200 && r.live !== false)
    .map((r) => r.path)
    .filter((p) => requested.length === 0 || requested.includes(p));
  const allowedFile = fileURLToPath(new URL('../../tests/fixtures/live/allowed-diffs.json', import.meta.url));
  const allowed = JSON.parse(readFileSync(allowedFile, 'utf8')) as AllowedDiffs;

  let failed = false;
  for (const path of paths) {
    let diffs: string[];
    let live: LivePage;
    try {
      live = await fetchPage(LIVE_ORIGIN + path);
      const local = await fetchPage(base + path);
      diffs = diffPage(live, local, allowedFor(allowed, path));
    } catch (error) {
      failed = true;
      console.log(`✗ ${path}: ${(error as Error).message}`);
      continue;
    }
    if (diffs.length === 0) {
      console.log(`✓ ${path}`);
      continue;
    }
    failed = true;
    const liveTexts = new Set([...live.headings.map((h) => h.text), ...live.textBlocks].map(normalise));
    console.log(`✗ ${path}`);
    for (const d of diffs) console.log(`    ${liveTexts.has(d) ? 'live only ' : 'local only'}  ${d}`);
  }
  if (failed) console.log('\nDrift found. Bring the change over, or log it in docs/migration-notes.md and allowed-diffs.json.');
  return failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
