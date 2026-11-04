import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// The two contact function instances started in playwright.config.ts.
const OUTBOX = 'test-results/outbox.jsonl';
const SLOW_OUTBOX = 'test-results/outbox-slow.jsonl';
const SLOW_ENDPOINT = 'http://localhost:8082/';

const SENT = 'Thank you for your message. We will get back to you soon.';
const INVALID = 'Please check the form and try again.';
const ERROR = 'Your message could not be sent. Please try again later, or email us at home@opensourceeurope.org.';

// The projects run in parallel and share the outbox, so each test counts only
// the lines that hold its own unique name.
const linesWith = (file: string, text: string) =>
  existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter((line) => line.includes(text)).length : 0;

const uniqueName = () => `Ada Tester ${test.info().project.name} ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`;

async function fill(page: Page, name: string, email = 'ada@example.org') {
  await page.getByLabel('Full name*', { exact: true }).fill(name);
  await page.getByLabel('Email address*', { exact: true }).fill(email);
  await page.getByLabel("What's your message*", { exact: true }).fill('Hello from the contact form test.');
}

const submit = (page: Page) => page.getByRole('button', { name: 'send a message', exact: true });
const status = (page: Page) => page.locator('form[data-contact] [aria-live="polite"]');

test.beforeEach(async ({ page }) => {
  await page.goto('/contact/');
});

test('the fields have the live labels, placeholders and descriptions', async ({ page }) => {
  const name = page.getByLabel('Full name*', { exact: true });
  await expect(name).toHaveAttribute('placeholder', 'Your full name');
  await expect(name).toHaveAttribute('required', '');

  const email = page.getByLabel('Email address*', { exact: true });
  await expect(email).toHaveAttribute('type', 'email');
  await expect(email).toHaveAttribute('placeholder', 'name@email.com');
  await expect(email).toHaveAttribute('required', '');

  const group = page.getByRole('radiogroup', { name: 'I am interested in*' });
  const options = ['Founding a project', 'Getting information on a project', 'Becoming a partner', 'Publish a project', 'Other'];
  for (const option of options) await expect(group.getByRole('radio', { name: option, exact: true })).toHaveCount(1);
  await expect(group.getByRole('radio')).toHaveCount(options.length);
  await expect(group.getByRole('radio', { name: 'Founding a project' })).toBeChecked();
  await expect(page.locator('input[name="interest_other"]')).toHaveAttribute('aria-label', 'Other Choice, please specify');

  const message = page.getByLabel("What's your message*", { exact: true });
  await expect(message).toHaveJSProperty('tagName', 'TEXTAREA');
  await expect(message).toHaveAttribute('placeholder', 'Write your message here...');
  await expect(message).toHaveAttribute('required', '');
  await expect(message).toHaveAccessibleDescription(/^Please give as much information as possible for a quicker resolution/);

  const link = page.getByLabel('Add a link with files or something additional', { exact: true });
  await expect(link).toHaveAttribute('type', 'url');
  await expect(link).toHaveAttribute('placeholder', 'https://');
  await expect(link).not.toHaveAttribute('required');
  await expect(link).toHaveAccessibleDescription(/^We encourage you to include files or images in a cloud drive link\./);

  await expect(submit(page)).toBeVisible();
});

test('the honeypot is out of reach and the timestamp is hidden', async ({ page }) => {
  const honeypot = page.locator('input[name="website"]');
  await expect(honeypot).toHaveAttribute('tabindex', '-1');
  await expect(honeypot).toHaveAttribute('autocomplete', 'off');
  await expect(honeypot).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('label[for="website"]')).toHaveText('Leave this field empty');
  await expect(honeypot).not.toBeInViewport();
  await expect(page.locator('input[name="ts"]')).toHaveAttribute('type', 'hidden');
});

test('"Other" reveals the text field', async ({ page }) => {
  const other = page.getByRole('textbox', { name: 'Other Choice, please specify' });
  await expect(other).toBeHidden();
  await page.getByRole('radio', { name: 'Other', exact: true }).check();
  await expect(other).toBeVisible();
  await page.getByRole('radio', { name: 'Becoming a partner' }).check();
  await expect(other).toBeHidden();
});

test('a filled form is sent and the success is announced', async ({ page }, info) => {
  test.skip(info.project.name === 'no-js', 'needs JavaScript');
  const name = uniqueName();
  await expect(page.locator('input[name="ts"]')).toHaveValue(/^\d{13}$/);
  await fill(page, name);
  await submit(page).click();
  await expect(status(page)).toHaveText(SENT);
  await expect.poll(() => linesWith(OUTBOX, name)).toBe(1);
  await expect(submit(page)).toBeEnabled();
});

test('without JavaScript the form posts and lands on the success state', async ({ page }, info) => {
  test.skip(info.project.name !== 'no-js', 'no-JS check');
  const name = uniqueName();
  await fill(page, name);
  await submit(page).click();
  await page.waitForURL('**/contact/#form-sent');
  await expect(page.locator('#form-sent')).toBeVisible();
  await expect(page.locator('#form-sent')).toHaveText(SENT);
  await expect(page.locator('#form-invalid')).toBeHidden();
  await expect(page.locator('#form-error')).toBeHidden();
  expect(linesWith(OUTBOX, name)).toBe(1);
});

test('the state blocks stay hidden until their fragment is the target', async ({ page }) => {
  for (const id of ['form-sent', 'form-invalid', 'form-error']) await expect(page.locator(`#${id}`)).toBeHidden();
  await page.goto('/contact/#form-invalid');
  await expect(page.locator('#form-invalid')).toHaveText(INVALID);
  await expect(page.locator('#form-invalid')).toBeVisible();
  await page.goto('/contact/#form-error');
  await expect(page.locator('#form-error')).toHaveText(ERROR);
  await expect(page.locator('#form-error')).toBeVisible();
});

test('a server-side email error shows next to the field and takes focus', async ({ page }, info) => {
  test.skip(info.project.name === 'no-js', 'needs JavaScript');
  await page.locator('form[data-contact]').evaluate((form) => form.setAttribute('novalidate', ''));
  await fill(page, uniqueName(), 'invalid@');
  await submit(page).click();

  const email = page.getByLabel('Email address*', { exact: true });
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute('aria-invalid', 'true');
  await expect(email).toHaveAccessibleDescription('Enter a valid email address.');
  await expect(page.locator('#email-error')).toBeVisible();
  await expect(status(page)).toHaveText(INVALID);
  await expect(submit(page)).toBeEnabled();
});

test('a network failure shows an error and enables the button again', async ({ page }, info) => {
  test.skip(info.project.name === 'no-js', 'needs JavaScript');
  await page.route('http://localhost:8081/**', (route) => route.abort());
  await fill(page, uniqueName());
  await submit(page).click();
  await expect(status(page)).toHaveText(ERROR);
  await expect(submit(page)).toBeEnabled();
  await expect(submit(page)).not.toHaveAttribute('aria-busy', 'true');
});

test('a request that never answers times out with an error and enables the button again', async ({ page }, info) => {
  test.skip(info.project.name === 'no-js', 'needs JavaScript');
  await page.clock.install();
  await page.route('http://localhost:8081/**', () => {});
  await fill(page, uniqueName());
  await submit(page).click();
  await expect(submit(page)).toHaveAttribute('aria-busy', 'true');
  await page.clock.fastForward(15_000);
  await page.clock.resume();
  await expect(status(page)).toHaveText(ERROR);
  await expect(submit(page)).toBeEnabled();
  await expect(submit(page)).not.toHaveAttribute('aria-busy', 'true');
});

test('the button is disabled and busy while the request is pending', async ({ page }, info) => {
  test.skip(info.project.name === 'no-js', 'needs JavaScript');
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('http://localhost:8081/**', async (route) => {
    await held;
    await route.fulfill({ status: 502, contentType: 'application/json', body: '{"ok":false,"error":"server"}', headers: { 'access-control-allow-origin': '*' } });
  });
  await fill(page, uniqueName());
  await submit(page).click();
  await expect(submit(page)).toBeDisabled();
  await expect(submit(page)).toHaveAttribute('aria-busy', 'true');
  release();
  await expect(status(page)).toHaveText(ERROR);
  await expect(submit(page)).toBeEnabled();
});

test('a submission faster than the minimum delay reports success but is not sent', async ({ page }, info) => {
  test.skip(info.project.name === 'no-js', 'the load timestamp needs JavaScript');
  // This instance keeps the production delay of 3000 ms.
  await page.locator('form[data-contact]').evaluate((form, url) => form.setAttribute('action', url), SLOW_ENDPOINT);
  await page.waitForTimeout(500);
  const name = uniqueName();
  await fill(page, name);
  await submit(page).click();
  await expect(status(page)).toHaveText(SENT);
  expect(linesWith(SLOW_OUTBOX, name)).toBe(0);
});
