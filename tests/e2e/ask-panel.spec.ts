import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { allowedFor, diffPage, type AllowedDiffs } from '../../scripts/live/drift';
import { extractPage, type LivePage } from '../../scripts/live/extract';
import { ROUTES } from './routes';

const allowed = JSON.parse(readFileSync('tests/fixtures/live/allowed-diffs.json', 'utf8')) as AllowedDiffs;

const CHAT_URL = 'http://localhost:8090/chat';
const CONSENT = JSON.stringify({ v: 1, analytics: 'denied' });

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };

/** Answers the cross-origin preflight and the POST of the chat function. */
async function mockChat(page: Page, reply: { answer: string; citations: unknown[] }, seen: string[] = []) {
  await page.route(CHAT_URL, async (route) => {
    const request = route.request();
    seen.push(request.method());
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(reply) });
  });
}

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** Answers the POST with an event stream made of several events. */
async function mockChatStream(page: Page, body: string) {
  await page.route(CHAT_URL, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/event-stream' }, body });
  });
}

const button = (page: Page) => page.locator('[data-ask-open]');
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Ask Open Source Europe' });

async function overlaps(a: Locator, b: Locator): Promise<boolean> {
  const [x, y] = [await a.boundingBox(), await b.boundingBox()];
  if (!x || !y) return false;
  return x.x < y.x + y.width && y.x < x.x + x.width && x.y < y.y + y.height && y.y < x.y + x.height;
}

test.describe('ask panel', () => {
  test.skip(({ javaScriptEnabled }) => !javaScriptEnabled, 'needs JavaScript');

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((value) => {
      if (!sessionStorage.getItem('no-consent')) localStorage.setItem('ose-consent', value);
    }, CONSENT);
  });

  test('loads no chat code before the click', async ({ page }) => {
    const scripts: string[] = [];
    const chat: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'script') scripts.push(r.url());
      if (r.url().startsWith(CHAT_URL)) chat.push(r.method());
    });
    await mockChat(page, { answer: 'Hello', citations: [] }, chat);
    await page.goto('/about/', { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');
    await expect(button(page)).toBeVisible();
    const before = scripts.length;
    expect(chat).toEqual([]);
    await button(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect.poll(() => scripts.length).toBeGreaterThan(before);
    expect(chat).toEqual([]);
  });

  test('opens, answers and closes', async ({ page }) => {
    await mockChat(page, { answer: 'Mocked answer text.', citations: [{ n: 1, url: 'https://opensourceeurope.org/about/', title: 'About' }] });
    await page.goto('/about/');
    await button(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator('dialog [data-chat-input]')).toBeFocused();
    await page.locator('dialog [data-chat-input]').fill('What is OSE?');
    await page.locator('dialog [data-chat-send]').click();
    await expect(dialog(page).getByText('Mocked answer text.')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(button(page)).toBeFocused();
  });

  test('streams an answer in the panel', async ({ page }) => {
    await mockChatStream(
      page,
      sse('status', { kind: 'searching' }) +
        sse('status', { kind: 'searching', query: 'join' }) +
        sse('status', { kind: 'writing' }) +
        sse('delta', { text: 'Apply through ' }) +
        sse('delta', { text: 'the form [1].' }) +
        sse('done', {
          answer: 'Apply through *the form* [1].',
          citations: [{ n: 1, url: 'https://opensourceeurope.org/how-to-join/', title: 'How to join' }],
          unanswered: false,
          followups: ['What are the fees?'],
        }),
    );
    await page.goto('/about/');
    await button(page).click();
    await page.locator('dialog [data-chat-input]').fill('How do I join?');
    await page.locator('dialog [data-chat-send]').click();
    const answer = dialog(page).locator('.msg--assistant .msg__bubble--md');
    await expect(answer).toContainText('Apply through the form');
    await expect(answer.locator('em')).toHaveText('the form');
    await expect(dialog(page).locator('.msg--assistant[aria-hidden]')).toHaveCount(0);
    await expect(dialog(page).getByRole('link', { name: /How to join/ })).toBeVisible();
    await expect(page.locator('dialog [data-chat-status]')).toHaveText('Answer ready');
    const chip = dialog(page).getByRole('list', { name: 'Ask next' }).getByRole('button', { name: 'What are the fees?' });
    await chip.click();
    await expect(page.locator('dialog [data-chat-input]')).toHaveValue('What are the fees?');
    await expect(page.locator('dialog [data-chat-input]')).toBeFocused();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(axe.violations).toEqual([]);
  });

  test('shares a question only after Accept analytics in the banner', async ({ page }) => {
    const bodies: Array<{ analyticsOptIn: unknown }> = [];
    await mockChat(page, { answer: 'Mocked answer text.', citations: [] });
    page.on('request', (r) => {
      if (r.url() === CHAT_URL && r.method() === 'POST') bodies.push(r.postDataJSON());
    });
    await page.goto('/about/');
    const status = page.locator('dialog [data-chat-sharing-text]');
    const ask = async (question: string, count: number): Promise<void> => {
      await page.locator('dialog [data-chat-input]').fill(question);
      await page.locator('dialog [data-chat-send]').click();
      await expect.poll(() => bodies.length).toBe(count);
      await expect(dialog(page).getByText('Mocked answer text.')).toHaveCount(count);
    };
    await button(page).click();
    await expect(status).toHaveText('Your questions are not shared.');
    await ask('First question', 1);
    expect(bodies[0].analyticsOptIn).toBe(false);
    // The link closes the panel and shows the banner. Accept, then open the panel again.
    await page.locator('dialog').getByRole('button', { name: 'Change this in Privacy settings' }).click();
    await expect(dialog(page)).toBeHidden();
    const banner = page.locator('[data-consent]');
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Accept analytics' }).click();
    await expect(button(page)).toBeFocused();
    await button(page).click();
    await expect(status).toHaveText('Your questions are shared to help OSE improve the docs.');
    await ask('Second question', 2);
    expect(bodies[1].analyticsOptIn).toBe(true);
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['ose-consent']);
  });

  test('the button stays visible and links to /ask/ when the panel code cannot load', async ({ page }) => {
    await page.route(/\/panel\.[^/]*\.js$/, (route) => route.abort());
    await page.goto('/about/');
    await expect(button(page)).toBeVisible();
    await expect(button(page)).toHaveAttribute('href', '/ask/');
  });

  test('the button stays visible when no panel script runs at all', async ({ page }) => {
    await page.route(/\/AskPanel[^/]*\.js$|\/panel\.[^/]*\.js$/, (route) => route.abort());
    await page.goto('/about/');
    await expect(button(page)).toBeVisible({ timeout: 6000 });
    await expect(button(page)).toHaveAttribute('href', '/ask/');
  });

  test('closes with the close button', async ({ page }) => {
    await page.goto('/about/');
    await button(page).click();
    await dialog(page).getByRole('button', { name: 'Close the chat' }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(button(page)).toBeFocused();
  });

  test('stays open on a click inside the panel near its edge', async ({ page }) => {
    await page.goto('/about/');
    await button(page).click();
    await expect(dialog(page)).toBeVisible();
    const box = (await page.locator('dialog.ask-panel__dialog').boundingBox())!;
    await page.mouse.click(box.x + 4, box.y + box.height - 4);
    await expect(dialog(page)).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(dialog(page)).toBeHidden();
  });

  test('widens when its left edge is dragged, and keeps the page visible', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop width only');
    await page.goto('/about/');
    await button(page).click();
    const panel = page.locator('dialog.ask-panel__dialog');
    const handle = dialog(page).getByRole('separator', { name: 'Resize the chat panel' });
    await expect(handle).toBeVisible();
    // Measure the handle only once the panel has slid in.
    await panel.evaluate((el) => Promise.all(el.getAnimations().map((x) => x.finished)));
    expect((await panel.boundingBox())!.width).toBe(440);
    const h = (await handle.boundingBox())!;
    const [x, y] = [h.x + h.width / 2, h.y + h.height / 2];
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 300, y, { steps: 5 });
    await page.mouse.up();
    await expect(dialog(page)).toBeVisible();
    expect(Math.round((await panel.boundingBox())!.width)).toBe(740);
    // Dragged past the left edge, the panel stops 96px short of it.
    await page.mouse.move(x - 300, y);
    await page.mouse.down();
    await page.mouse.move(0, y, { steps: 5 });
    await page.mouse.up();
    expect(Math.round((await panel.boundingBox())!.x)).toBe(96);
    await expect(handle).toHaveAttribute('aria-valuenow', '100');
    // The width stays for the next open on the same page.
    await page.keyboard.press('Escape');
    await button(page).click();
    await panel.evaluate((el) => Promise.all(el.getAnimations().map((x) => x.finished)));
    expect(Math.round((await panel.boundingBox())!.x)).toBe(96);
    await handle.dblclick();
    expect((await panel.boundingBox())!.width).toBe(440);
  });

  test('resizes with the arrow keys on the handle', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop width only');
    await page.goto('/about/');
    await button(page).click();
    const panel = page.locator('dialog.ask-panel__dialog');
    const handle = dialog(page).getByRole('separator', { name: 'Resize the chat panel' });
    await expect(handle).toHaveAttribute('aria-valuenow', '0');
    await handle.focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    expect((await panel.boundingBox())!.width).toBe(520);
    await page.keyboard.press('ArrowRight');
    expect((await panel.boundingBox())!.width).toBe(480);
    await page.keyboard.press('End');
    await expect(handle).toHaveAttribute('aria-valuenow', '100');
    await page.keyboard.press('Home');
    expect((await panel.boundingBox())!.width).toBe(440);
    await expect(dialog(page)).toBeVisible();
  });

  test('has no resize handle on a phone', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'phone width only');
    await page.goto('/about/');
    await button(page).click();
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator('[data-ask-resize]')).toBeHidden();
  });

  test('has no axe violations with the panel open', async ({ page }) => {
    await page.goto('/about/');
    await button(page).click();
    await expect(dialog(page)).toBeVisible();
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(axe.violations).toEqual([]);
  });

  test('fits a phone', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'phone width only');
    await page.setViewportSize({ width: 390, height: 844 });
    const answer = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1} of a long answer.`).join('\n\n');
    const citations = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, url: `https://opensourceeurope.org/p${i}/`, title: `Source number ${i + 1}` }));
    await mockChat(page, { answer, citations });
    await page.goto('/about/');
    await button(page).click();
    await page.locator('dialog [data-chat-input]').fill('Long please');
    await page.locator('dialog [data-chat-send]').click();
    await expect(dialog(page).getByText('Paragraph 40 of a long answer.')).toBeAttached();
    const box = await page.locator('dialog.ask-panel__dialog').boundingBox();
    expect(box).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
    const transcript = page.locator('dialog [data-chat-transcript]');
    const scrolls = await transcript.evaluate((el) => el.scrollHeight > el.clientHeight);
    expect(scrolls).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('does not cover the consent banner', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('ose-consent');
      sessionStorage.setItem('no-consent', '1');
    });
    await page.goto('/about/');
    const banner = page.locator('[data-consent]');
    await expect(banner).toBeVisible();
    await expect(button(page)).toBeVisible();
    for (const b of await banner.getByRole('button').all()) expect(await overlaps(button(page), b)).toBe(false);
    expect(await overlaps(button(page), banner)).toBe(false);
  });

  // 320 x 256 CSS pixels is a 1280 x 1024 screen at 400% zoom (WCAG 1.4.10). The banner is
  // taller than the room left, so the button may overlap it, but it must stay on screen.
  test('stays inside a short viewport while the consent banner is shown', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 256 });
    await page.addInitScript(() => {
      localStorage.removeItem('ose-consent');
      sessionStorage.setItem('no-consent', '1');
    });
    await page.goto('/about/');
    await expect(page.locator('[data-consent]')).toBeVisible();
    await expect(button(page)).toBeVisible();
    await expect(button(page)).toHaveCSS('visibility', 'visible');
    const box = await button(page).boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    expect(box.y + box.height).toBeLessThanOrEqual(256);
  });

  test('does not cover the footer links', async ({ page }) => {
    await page.goto('/about/');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    const links = await page.locator('footer a').all();
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(await overlaps(button(page), link)).toBe(false);
  });

  // The panel carries data-ask-panel, which the extractor ignores like the consent banner.
  // parity.spec.ts runs the same comparison for every route; this one checks the panel adds no text to it.
  test('keeps the parity text unchanged', async ({ request }, info) => {
    test.skip(info.project.name !== 'desktop', 'HTML comparison, runs once');
    for (const route of ROUTES.filter((r) => r.enabled && r.status === 200 && r.live !== false)) {
      const slug = route.path === '/' ? 'home' : route.path.replace(/^\/|\/$/g, '').replace(/\//g, '--');
      const live = JSON.parse(readFileSync(`tests/fixtures/live/${slug}.json`, 'utf8')) as LivePage;
      const html = await (await request.get(route.path)).text();
      expect(html).toContain('data-ask-panel');
      const local = extractPage(html, route.path);
      expect(diffPage(live, local, allowedFor(allowed, route.path)), route.path).toEqual([]);
    }
  });

  for (const key of ['Control+K', 'Meta+K']) {
    test(`${key} opens the panel, Escape closes it and focus returns`, async ({ page }) => {
      await mockChat(page, { answer: 'Hello', citations: [] });
      await page.goto('/about/', { waitUntil: 'load' });
      await expect(button(page)).toBeVisible();
      const link = page.locator('main a[href]').first();
      await link.focus();
      await expect(link).toBeFocused();
      await page.keyboard.press(key);
      await expect(dialog(page)).toBeVisible();
      await expect(page.getByLabel('Your question')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toBeHidden();
      await expect(link).toBeFocused();
    });
  }

  /** Presses a key and reports whether the page prevented its default action (seen by a window listener, after ours). */
  async function pressPrevented(page: Page, key: string): Promise<boolean> {
    await page.evaluate(() => {
      const w = window as unknown as { __dp?: boolean };
      w.__dp = undefined;
      addEventListener('keydown', (e) => (w.__dp = e.defaultPrevented), { once: true });
    });
    await page.keyboard.press(key);
    return page.evaluate(() => (window as unknown as { __dp?: boolean }).__dp === true);
  }

  test('the shortcut does nothing while the privacy banner is visible', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('ose-consent'));
    await page.goto('/about/', { waitUntil: 'load' });
    await expect(page.locator('[data-consent]')).toBeVisible();
    await expect(button(page)).toBeVisible();
    const link = page.locator('main a[href]').first();
    await link.focus();
    expect(await pressPrevented(page, 'Control+K')).toBe(false);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(link).toBeFocused();
  });

  test('Alt+Control+K does nothing', async ({ page }) => {
    await page.goto('/about/', { waitUntil: 'load' });
    await expect(button(page)).toBeVisible();
    expect(await pressPrevented(page, 'Alt+Control+K')).toBe(false);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });

  test('another modal dialog blocks the shortcut', async ({ page }) => {
    await page.goto('/about/', { waitUntil: 'load' });
    await expect(button(page)).toBeVisible();
    await page.evaluate(() => {
      const d = document.createElement('dialog');
      d.id = 'other-modal';
      d.innerHTML = '<button>Close</button>';
      document.body.append(d);
      d.showModal();
    });
    expect(await pressPrevented(page, 'Control+K')).toBe(false);
    await expect(page.locator('dialog[open]')).toHaveCount(1);
    await expect(page.locator('#other-modal')).toHaveAttribute('open', '');
  });

  test('the shortcut works from a text field', async ({ page }) => {
    await page.goto('/contact/', { waitUntil: 'load' });
    await expect(button(page)).toBeVisible();
    const field = page.getByLabel("What's your message*", { exact: true });
    await field.focus();
    await page.keyboard.press('Control+K');
    await expect(dialog(page)).toBeVisible();
    await expect(page.getByLabel('Your question')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(field).toBeFocused();
  });

  test('the shortcut inside the open panel keeps it open and focuses the field', async ({ page }) => {
    await page.goto('/about/', { waitUntil: 'load' });
    await expect(button(page)).toBeVisible();
    const link = page.locator('main a[href]').first();
    await link.focus();
    await page.keyboard.press('Control+K');
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Close the chat' }).focus();
    await page.keyboard.press('Control+K');
    await expect(dialog(page)).toBeVisible();
    await expect(page.getByLabel('Your question')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(link).toBeFocused();
  });

  test('the button announces the shortcut and shows a hint', async ({ page }) => {
    await page.goto('/about/', { waitUntil: 'load' });
    await expect(button(page)).toHaveAttribute('aria-keyshortcuts', 'Control+K Meta+K');
    await expect(page.locator('[data-ask-hint]')).toHaveText(/^(Ctrl K|⌘K)$/);
  });

  test('/ask/ has no button', async ({ page }) => {
    await page.goto('/ask/');
    await expect(button(page)).toHaveCount(0);
  });
});

test.describe('ask panel without JavaScript', () => {
  test.skip(({ javaScriptEnabled }) => javaScriptEnabled, 'no-js project only');

  test('the button is a link to /ask/', async ({ page }) => {
    await page.goto('/about/');
    await expect(page.getByRole('link', { name: 'Ask', exact: true })).toHaveAttribute('href', '/ask/');
    await expect(page.locator('[data-ask-hint]')).toBeHidden();
    await expect(button(page)).not.toHaveAttribute('aria-keyshortcuts', /.*/);
  });
});
