import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ENDPOINT = 'http://localhost:8090/chat';
const ERROR_TEXT =
  "Sorry, I couldn't reach the OSE assistant just now. Please check your connection and try again in a moment.";

// The page posts across origins, so the mock answers the preflight and the POST.
async function mockChat(page: Page, status: number) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };
  let replies = 0;
  await page.route(ENDPOINT, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (status !== 200) return route.fulfill({ status, headers: cors, body: 'error' });
    replies += 1;
    return route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify({
        // Each reply is numbered, so a test can wait for exactly the answer to its own question.
        answer: `OSE is a fiscal host for open source projects (reply ${replies}) [1].`,
        citations: [{ n: 1, title: 'About OSE', url: 'https://example.org/about' }],
      }),
    });
  });
}

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/** Answers the POST with an event stream made of several events, as the function does with Accept: text/event-stream. */
async function mockChatStream(page: Page, body: string) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' };
  await page.route(ENDPOINT, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/event-stream; charset=utf-8' }, body });
  });
}

/** Records every text the visually hidden status element shows. */
async function recordStatus(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __status: string[] };
    w.__status = [];
    const el = document.querySelector('[data-chat] [data-chat-status]')!;
    // Mutations arrive in batches, so read each record: one text per change.
    new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach((n) => w.__status.push(n.textContent ?? ''));
    }).observe(el, { childList: true });
  });
  return () => page.evaluate(() => (window as unknown as { __status: string[] }).__status);
}

test('shows every section', async ({ page }, info) => {
  test.skip(info.project.name === 'no-js', 'the no-JavaScript test covers this page');
  await page.goto('/ask/');
  await expect(page.getByRole('heading', { level: 1, name: 'Ask Open Source Europe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Use it in your own tools — or run it locally' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sovereign by design' })).toBeVisible();
  const snippets = page.locator('.snippets__code');
  await expect(snippets).toHaveCount(4);
  await expect(snippets.nth(0)).toContainText('ose-knowledge-mcp==');
  await expect(snippets.nth(1)).toContainText('/plugin marketplace add opensourceeurope/ose-ai');
  await expect(snippets.nth(2)).toContainText('codex plugin marketplace add opensourceeurope/ose-ai');
  await expect(snippets.nth(3)).toContainText('git clone https://github.com/opensourceeurope/opensourceeurope.org.git');
  const texts = await snippets.evaluateAll((pres) =>
    pres.map((pre) => [pre.textContent, pre.querySelector('code')?.textContent]),
  );
  for (const [preText, codeText] of texts) expect(preText).toBe(codeText);
  await expect(page.locator('a[href="#tools"]').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Source code on GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/opensourceeurope/opensourceeurope.org',
  );
  await expect(page.locator('a[href="#sovereignty"]')).toBeVisible();
});

test('answers a question', async ({ page }, info) => {
  test.skip(info.project.name === 'no-js', 'needs JavaScript');
  await mockChat(page, 200);
  await page.goto('/ask/');
  await page.getByLabel('Your question').fill('What is OSE?');
  await page.getByLabel('Your question').press('Enter');
  await expect(page.getByText('OSE is a fiscal host for open source projects')).toBeVisible();
  const source = page.getByRole('link', { name: /About OSE/ });
  await expect(source).toBeVisible();
  await expect(source).toHaveAttribute('target', '_blank');
  await expect(page.getByText('Sources', { exact: true })).toBeVisible();
});

const SHARING_ON = 'Your questions are shared to help OSE improve the docs.';
const SHARING_OFF = 'Your questions are not shared.';

/** Asks one question and returns the analyticsOptIn flag of the POST body. `reply` is the number of the mocked reply to wait for. */
async function askAndReadOptIn(page: Page, question: string, reply: number): Promise<unknown> {
  const posted = page.waitForRequest((r) => r.url() === ENDPOINT && r.method() === 'POST');
  await page.getByLabel('Your question').fill(question);
  await page.getByLabel('Your question').press('Enter');
  const body = (await posted).postDataJSON() as { analyticsOptIn: unknown };
  await expect(page.getByText(`(reply ${reply})`)).toBeVisible();
  return body.analyticsOptIn;
}

test('the honeypot is out of reach', async ({ page }) => {
  await page.goto('/ask/');
  const honeypot = page.locator('[data-chat] input[name="website"]');
  await expect(honeypot).toHaveAttribute('tabindex', '-1');
  await expect(honeypot).toHaveAttribute('autocomplete', 'off');
  await expect(honeypot).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('[data-chat] .chat__honeypot label')).toHaveText('Leave this field empty');
  await expect(honeypot).not.toBeInViewport();
});

test('sends the honeypot only when something filled it', async ({ page }, info) => {
  test.skip(info.project.name === 'no-js', 'needs JavaScript');
  await mockChat(page, 200);
  await page.goto('/ask/');
  let posted = page.waitForRequest((r) => r.url() === ENDPOINT && r.method() === 'POST');
  await page.getByLabel('Your question').fill('What is OSE?');
  await page.getByLabel('Your question').press('Enter');
  expect((await posted).postDataJSON()).not.toHaveProperty('website');
  await expect(page.getByText('(reply 1)')).toBeVisible();
  await page.locator('[data-chat] input[name="website"]').fill('https://spam.example', { force: true });
  posted = page.waitForRequest((r) => r.url() === ENDPOINT && r.method() === 'POST');
  await page.getByLabel('Your question').fill('And the fees?');
  await page.getByLabel('Your question').press('Enter');
  expect((await posted).postDataJSON()).toMatchObject({ website: 'https://spam.example' });
});

test('shares nothing without a stored consent choice', async ({ page }, info) => {
  test.skip(info.project.name === 'no-js', 'needs JavaScript');
  await mockChat(page, 200);
  await page.goto('/ask/');
  await expect(page.locator('[data-chat-sharing-text]')).toHaveText(SHARING_OFF);
  expect(await askAndReadOptIn(page, 'What is OSE?', 1)).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('ose-consent'))).toBeNull();
});

test('shares the question after Accept analytics and stops after Reject analytics', async ({ page }, info) => {
  test.skip(info.project.name === 'no-js', 'needs JavaScript');
  await mockChat(page, 200);
  await page.goto('/ask/');
  const banner = page.locator('[data-consent]');
  await banner.getByRole('button', { name: 'Accept analytics' }).click();
  await expect(page.locator('[data-chat-sharing-text]')).toHaveText(SHARING_ON);
  expect(await askAndReadOptIn(page, 'What is OSE?', 1)).toBe(true);
  // The status line link reopens the banner. Reject turns sharing off.
  const link = page.getByRole('button', { name: 'Change this in Privacy settings' });
  await link.click();
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Reject analytics' }).click();
  await expect(link).toBeFocused();
  await expect(page.locator('[data-chat-sharing-text]')).toHaveText(SHARING_OFF);
  expect(await askAndReadOptIn(page, 'And how do I join?', 2)).toBe(false);
  // The consent choice is the only browser storage.
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['ose-consent']);
});

test('has no opt-in checkbox in the chat', async ({ page }, info) => {
  test.skip(info.project.name === 'no-js', 'needs JavaScript');
  await page.goto('/ask/');
  await expect(page.locator('[data-chat] input[type="checkbox"]')).toHaveCount(0);
});

test('shows the error text on a 500', async ({ page }, info) => {
  test.skip(info.project.name === 'no-js', 'needs JavaScript');
  await mockChat(page, 500);
  await page.goto('/ask/');
  await page.getByLabel('Your question').fill('What is OSE?');
  await page.getByLabel('Your question').press('Enter');
  await expect(page.getByText(ERROR_TEXT)).toBeVisible();
  await expect(page.getByLabel('Your question')).toBeEnabled();
});

test('copies a snippet and shows the Copied label', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop', 'clipboard permissions, runs once');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/ask/');
  const button = page.locator('.snippets__copy').nth(1);
  await button.click();
  await expect(button).toContainText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('/plugin marketplace add opensourceeurope/ose-ai');
});

test('makes no request to another domain on load', async ({ page }, info) => {
  test.skip(info.project.name === 'no-js', 'needs JavaScript');
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  await page.goto('/ask/', { waitUntil: 'load' });
  const siteOrigin = new URL(page.url()).origin;
  const foreign = urls.filter((u) => /^https?:/.test(u) && new URL(u).origin !== siteOrigin);
  expect(foreign).toEqual([]);
});

test('has no axe violations', async ({ page }, info) => {
  test.skip(info.project.name === 'no-js', 'axe needs JavaScript');
  await page.goto('/ask/');
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations).toEqual([]);
});

test('shows the text and the no-JavaScript notice', async ({ page }, info) => {
  test.skip(info.project.name !== 'no-js', 'no-JS check');
  await page.goto('/ask/');
  await expect(page.getByRole('heading', { level: 1, name: 'Ask Open Source Europe' })).toBeVisible();
  await expect(page.getByText('The chat needs JavaScript.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Use it in your own tools — or run it locally' })).toBeVisible();
  await expect(page.getByText('ose-knowledge-mcp==').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sovereign by design' })).toBeVisible();
});

test('Control+K focuses the question field', async ({ page }, info) => {
  test.skip(info.project.name === 'no-js', 'needs JavaScript');
  await page.addInitScript(() => localStorage.setItem('ose-consent', JSON.stringify({ v: 1, analytics: 'denied' })));
  await page.goto('/ask/', { waitUntil: 'load' });
  await page.keyboard.press('Control+K');
  await expect(page.getByLabel('Your question')).toBeFocused();
});

test('streams an answer with a status line', async ({ page }, info) => {
  test.skip(info.project.name === 'no-js', 'needs JavaScript');
  const posted: Array<Record<string, string>> = [];
  page.on('request', (r) => {
    if (r.url() === ENDPOINT && r.method() === 'POST') posted.push(r.headers());
  });
  await mockChatStream(
    page,
    sse('status', { kind: 'searching' }) +
      sse('status', { kind: 'searching', query: 'fiscal hosting' }) +
      ': keep-alive\n\n' +
      sse('status', { kind: 'writing' }) +
      sse('delta', { text: 'OSE is a **fiscal host** ' }) +
      sse('delta', { text: 'for open source [1].' }) +
      sse('done', {
        answer: 'OSE is a **fiscal host** for open source [1].',
        citations: [{ n: 1, title: 'About OSE', url: 'https://example.org/about' }],
        unanswered: false,
        followups: ['How do I join OSE?', 'What does OSE charge?'],
      }),
  );
  await page.goto('/ask/');
  const statusTexts = await recordStatus(page);
  await page.getByLabel('Your question').fill('What is OSE?');
  await page.getByLabel('Your question').press('Enter');
  const answer = page.locator('[data-chat] .msg--assistant .msg__bubble--md');
  await expect(answer).toContainText('OSE is a fiscal host for open source');
  await expect(answer.locator('strong')).toHaveText('fiscal host');
  // The streamed text is replaced by one visible, announced message.
  await expect(page.locator('[data-chat] .msg--assistant')).toHaveCount(1);
  await expect(page.locator('[data-chat] .msg--assistant[aria-hidden]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /About OSE/ })).toBeVisible();
  await expect(page.locator('[data-chat] [data-chat-status]')).toHaveText('Answer ready');
  const seen = await statusTexts();
  expect(seen[0]).toBe('Searching the OSE docs…');
  expect(seen).toContain('Searching the docs: fiscal hosting…');
  expect(seen).toContain('Writing the answer…');
  expect(posted[0].accept).toBe('text/event-stream');
  await expect(page.getByRole('button', { name: 'Send question' })).toBeVisible();
  // Follow-up chips under the answer: a click fills the question field.
  const next = page.getByRole('list', { name: 'Ask next' });
  await expect(next.getByRole('button')).toHaveText(['How do I join OSE?', 'What does OSE charge?']);
  await next.getByRole('button', { name: 'What does OSE charge?' }).click();
  await expect(page.getByLabel('Your question')).toHaveValue('What does OSE charge?');
  await expect(page.getByLabel('Your question')).toBeFocused();
});

test('shows the error text for an error event', async ({ page }, info) => {
  test.skip(info.project.name === 'no-js', 'needs JavaScript');
  await mockChatStream(page, sse('status', { kind: 'searching', query: 'q' }) + sse('error', { error: 'timeout' }));
  await page.goto('/ask/');
  await page.getByLabel('Your question').fill('What is OSE?');
  await page.getByLabel('Your question').press('Enter');
  await expect(page.getByText('The answer took too long. Try again in a moment.')).toBeVisible();
});
