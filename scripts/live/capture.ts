/**
 * Captures the live site as reference material: page text and image lists
 * (tests/fixtures/live/<slug>.json), the images themselves, and, under
 * reference/ (not committed), full-page screenshots, screenshots of the
 * scroll-driven sections and measured computed styles.
 *
 * Only content and measurements are taken. No markup, CSS or script from the
 * live site is stored.
 *
 * Usage: npm run capture
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import { parse } from 'node-html-parser';
import { ROUTES } from '../../tests/e2e/routes';
import { extractPage } from './extract';
import { USER_AGENT } from './drift';

const ORIGIN = 'https://opensourceeurope.org';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];
const UPLOADS = /\/app\/uploads\/[^\s"'()<>,]+?\.(?:png|jpe?g|gif|webp|avif|svg)/gi;
const THEME_IMAGES = /\/app\/themes\/[^/\s"'()<>]+\/resources\/images\/([^\s"'()<>,]+?\.(?:png|jpe?g|gif|webp|avif|svg))/gi;
// Referenced by the site head (og:image, JSON-LD logo) but not by page content.
const HEAD_IMAGES = ['/app/uploads/2026/01/cropped-ose.png'];

function slugFor(path: string): string {
  return path === '/' ? 'home' : path.replace(/^\/|\/$/g, '').replace(/\//g, '--');
}

/** Image URLs the page content uses, as root-relative paths. Head-only references (favicons, social images, JSON-LD) are left out. */
function contentImagePaths(html: string): { uploads: string[]; theme: string[] } {
  const doc = parse(html, { comment: false });
  const headOnly = 'link[rel*="icon"], meta, script[type="application/ld+json"]';
  for (const node of doc.querySelectorAll(headOnly)) node.remove();
  const text = doc.toString().replace(/\\\//g, '/');
  const uploads = new Set<string>();
  const theme = new Set<string>();
  for (const m of text.matchAll(UPLOADS)) uploads.add(decodeURI(m[0]));
  for (const m of text.matchAll(THEME_IMAGES)) theme.add(decodeURI(m[0]));
  return { uploads: [...uploads].sort(), theme: [...theme].sort() };
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.text();
}

const failures: string[] = [];

async function download(path: string, targets: string[]): Promise<void> {
  try {
    const res = await fetch(ORIGIN + encodeURI(path), { headers: { 'user-agent': USER_AGENT } });
    if (!res.ok) throw new Error(`status ${res.status}`);
    await save(Buffer.from(await res.arrayBuffer()), targets);
  } catch (error) {
    console.warn(`  ! ${path} failed: ${error instanceof Error ? error.message : error}`);
    failures.push(path);
  }
}

async function save(body: Buffer, targets: string[]): Promise<void> {
  for (const target of targets) {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }
}

// Representative elements whose computed styles become design tokens.
const ROLES: Record<string, string> = {
  body: 'body',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  eyebrow: 'main p.uppercase',
  paragraph: 'main p:not(.uppercase)',
  'button-primary': 'a[class*="linear-gradient"]',
  'button-primary-inner': 'a[class*="linear-gradient"] .box-button',
  'button-secondary': 'a:not([class*="linear-gradient"]) > .box-button',
  'nav-link': '#main-nav-link',
  'text-link': 'main a.line-link',
  header: '#site-header',
  footer: 'footer',
  section: 'main > section, main > div > section',
  card: '[class~="rounded-[12px]"], [class~="rounded-[16px]"]',
  'faq-item': '.accordion-item',
  grid: '.grid-custom',
};
const PROPS = [
  'color', 'backgroundColor', 'backgroundImage', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
  'letterSpacing', 'textTransform', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'marginTop', 'marginBottom', 'borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderRadius', 'gap',
  'maxWidth', 'width', 'height', 'boxShadow', 'gridTemplateColumns', 'columnGap',
];

type StyleSample = { text: string; styles: Record<string, string> };

async function measure(page: Page): Promise<Record<string, StyleSample[]>> {
  return page.evaluate(
    ({ roles, props }) => {
      const out: Record<string, StyleSample[]> = {};
      for (const [role, selector] of Object.entries(roles)) {
        const seen = new Set<string>();
        const samples: StyleSample[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
          if (el.closest('#gdpr-cookie-consent-bar, #gdpr-gdprmodal, h1, h2, h3') && !/^h[1-3]$/.test(role)) continue;
          const rect = el.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          const cs = getComputedStyle(el);
          const styles: Record<string, string> = {};
          for (const p of props) styles[p] = String(cs.getPropertyValue(p.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)));
          const key = JSON.stringify({ ...styles, width: '', height: '' });
          if (seen.has(key)) continue;
          seen.add(key);
          samples.push({ text: (el.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 60), styles });
          if (samples.length >= 6) break;
        }
        out[role] = samples;
      }
      return out;
    },
    { roles: ROLES, props: PROPS },
  );
}

/** Media-query widths the live stylesheets use, measured through the CSSOM. */
async function breakpoints(page: Page): Promise<string[]> {
  // No named inner functions here: tsx would wrap them in a helper that
  // doesn't exist in the page.
  return page.evaluate(() => {
    const found = new Set<string>();
    const stack: CSSRule[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        stack.push(...Array.from(sheet.cssRules));
      } catch {
        // cross-origin sheet
      }
    }
    while (stack.length) {
      const rule = stack.pop()!;
      if (rule instanceof CSSMediaRule) found.add(rule.conditionText);
      if (rule instanceof CSSGroupingRule) stack.push(...Array.from(rule.cssRules));
    }
    return [...found].filter((c) => /width/.test(c)).sort();
  });
}

async function settle(page: Page): Promise<void> {
  // Scroll through once so lazy images load and one-shot animations finish.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 400) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500);
}

/**
 * Viewport screenshots of each pinned, scroll-driven section (E2, E9, E10 in
 * docs/animations.md) at 0, 25, 50, 75 and 100 % of its scroll range. The
 * full-page screenshot only shows these sections in their starting state.
 */
async function pinStates(page: Page, slug: string, width: number): Promise<void> {
  const pins = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.pin-spacer')).map((el) => ({
      top: el.getBoundingClientRect().top + window.scrollY,
      length: parseFloat(getComputedStyle(el).paddingBottom),
    })),
  );
  for (const [i, pin] of pins.entries()) {
    for (const pct of [0, 25, 50, 75, 100]) {
      await page.evaluate((top) => window.scrollTo(0, top), Math.round(pin.top + (pin.length * pct) / 100));
      // The live scroll animations trail the scroll position by about a second.
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(ROOT, `reference/screens/${slug}-${width}-pin${i + 1}-${pct}.png`) });
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function main(): Promise<void> {
  const paths = ROUTES.filter((r) => r.status === 200 && r.live !== false).map((r) => r.path);
  const uploads = new Set<string>();
  const theme = new Set<string>();

  for (const path of paths) {
    const slug = slugFor(path);
    const html = await fetchText(ORIGIN + path);
    const page = extractPage(html, ORIGIN + path);
    await mkdir(join(ROOT, 'tests/fixtures/live'), { recursive: true });
    await writeFile(join(ROOT, `tests/fixtures/live/${slug}.json`), `${JSON.stringify(page, null, 2)}\n`);
    const images = contentImagePaths(html);
    images.uploads.forEach((u) => uploads.add(u));
    images.theme.forEach((t) => theme.add(t));
    console.log(`✓ ${path} → tests/fixtures/live/${slug}.json`);
  }

  const browser = await chromium.launch();
  try {
    for (const path of paths) {
      const slug = slugFor(path);
      const styles: Record<string, unknown> = { url: ORIGIN + path };
      for (const { width, height } of WIDTHS) {
        const context = await browser.newContext({ viewport: { width, height }, userAgent: USER_AGENT });
        const page = await context.newPage();
        page.on('response', (res) => {
          const url = new URL(res.url());
          if (url.origin !== ORIGIN || !res.headers()['content-type']?.startsWith('image/')) return;
          const p = decodeURI(url.pathname);
          if (p.match(UPLOADS)?.[0] === p) uploads.add(p);
          else if (p.match(THEME_IMAGES)?.[0] === p) theme.add(p);
        });
        await page.goto(ORIGIN + path, { waitUntil: 'networkidle' });
        // Keep the cookie banner out of the reference screenshots.
        await page.addStyleTag({ content: '#gdpr-cookie-consent-bar { display: none !important; }' });
        await settle(page);
        await mkdir(join(ROOT, 'reference/screens'), { recursive: true });
        await page.screenshot({ path: join(ROOT, `reference/screens/${slug}-${width}.png`), fullPage: true });
        styles[String(width)] = await measure(page);
        await pinStates(page, slug, width);
        if (width === WIDTHS[0]!.width) styles.breakpoints = await breakpoints(page);
        await context.close();
      }
      await mkdir(join(ROOT, 'reference/styles'), { recursive: true });
      await writeFile(join(ROOT, `reference/styles/${slug}.json`), `${JSON.stringify(styles, null, 2)}\n`);
      console.log(`✓ ${path} → reference/screens/${slug}-*.png, reference/styles/${slug}.json`);
    }
  } finally {
    await browser.close();
  }

  for (const path of [...uploads].sort()) {
    const rel = path.replace(/^\/app\/uploads\//, '');
    await download(path, [join(ROOT, 'public/app/uploads', rel), join(ROOT, 'src/assets/uploads', rel)]);
  }
  for (const path of HEAD_IMAGES.filter((p) => !uploads.has(p))) {
    await download(path, [join(ROOT, 'public', path)]);
  }
  for (const path of [...theme].sort()) {
    const rel = path.replace(THEME_IMAGES, '$1');
    await download(path, [join(ROOT, 'src/assets/theme', rel)]);
  }
  console.log(`✓ ${uploads.size} upload images, ${theme.size} theme images, ${HEAD_IMAGES.length} head image(s)`);
  if (failures.length) {
    console.error(`✗ ${failures.length} image download(s) failed:\n${failures.map((f) => `  ${f}`).join('\n')}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
