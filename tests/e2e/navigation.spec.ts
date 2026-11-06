import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { parse } from 'yaml';
import { ROUTES } from './routes';

const settings = parse(readFileSync('src/content/settings/site.yaml', 'utf8'));
const MOBILE = { width: 390, height: 844 };
const enabled = ROUTES.filter((r) => r.enabled && r.status === 200);

test('every nav link resolves to a route or the apply URL', () => {
  const paths = new Set(ROUTES.map((r) => r.path));
  for (const link of settings.nav) expect(paths.has(link.href), link.href).toBe(true);
  expect(settings.apply_url).toMatch(/^https:\/\//);
});

for (const route of enabled) {
  test(`${route.path} marks its own nav link with aria-current`, async ({ page }) => {
    await page.goto(route.path);
    const current = page.locator('.site-nav a[aria-current="page"]');
    const expected = settings.nav.filter((l: { href: string }) => l.href === route.path);
    await expect(current).toHaveCount(expected.length);
    if (expected.length) await expect(current).toHaveAttribute('href', route.path);
  });
}

test.describe('mobile menu', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name === 'no-js', 'script-driven behaviour');
  });

  test('opens, moves focus, traps Tab and closes on Escape', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    const button = page.locator('[data-menu-toggle]');
    const menu = page.locator('#site-menu');
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.locator('a').first()).toBeFocused();

    // The cycle is the links, then the toggle, then the links again.
    const count = await menu.locator('a').count();
    for (let i = 1; i < count; i++) await page.keyboard.press('Tab');
    await expect(menu.locator('a').last()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(menu.locator('a').first()).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(button).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(menu.locator('a').last()).toBeFocused();

    // From the toggle, the keyboard closes the menu.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await button.click();
    await expect(menu.locator('a').first()).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
    await expect(menu).toBeHidden();
  });

  test('the open panel scrolls when the viewport is shorter than the menu', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ose-consent', '{"v":1,"analytics":"denied"}'));
    await page.setViewportSize({ width: 390, height: 300 });
    await page.goto('/');
    await page.locator('[data-menu-toggle]').click();
    const menu = page.locator('.site-nav'); // the panel that scrolls
    await expect(menu).toBeVisible();
    const bottom = () => menu.evaluate((el) => el.getBoundingClientRect().bottom);
    // The panel grows to the bottom of the viewport and no further, once the open transition ends.
    await expect.poll(bottom).toBeGreaterThanOrEqual(299);
    expect(await bottom()).toBeLessThanOrEqual(300);
    expect(await menu.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    const last = menu.locator('a').last();
    await last.scrollIntoViewIfNeeded();
    const box = (await last.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(300);
  });

  test('the toggle is a button reachable by keyboard', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ose-consent', '{"v":1,"analytics":"denied"}')); // the banner takes the first Tab stop, tested in consent.spec
    await page.setViewportSize(MOBILE);
    await page.goto('/');
    expect(await page.locator('[data-menu-toggle]').evaluate((el) => el.tagName)).toBe('BUTTON');
    await page.keyboard.press('Tab'); // skip link
    await page.keyboard.press('Tab'); // logo
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-menu-toggle]')).toBeFocused();
  });
});

test('footer cookie item is a consent button', async ({ page }) => {
  await page.goto('/');
  const button = page.locator('footer button[data-consent-open]');
  await expect(button).toHaveCount(1);
  await expect(button).toHaveAttribute('type', 'button');
});

test('without JavaScript every nav link is reachable at 390 px', async ({ page, javaScriptEnabled }) => {
  test.skip(javaScriptEnabled, 'no-js project only');
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  const links = page.locator('#site-menu a');
  const total = await links.count();
  expect(total).toBe(settings.nav.length + 1);
  for (let i = 0; i < total; i++) {
    await expect(links.nth(i)).toBeVisible();
    await links.nth(i).focus();
    await expect(links.nth(i)).toBeFocused();
  }
});

test('reduced motion removes the header and panel transitions', async ({ page }, info) => {
  test.skip(info.project.name === 'no-js', 'script-driven behaviour');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(MOBILE);
  await page.goto('/');
  for (const selector of ['[data-site-header]', '.site-nav']) {
    const duration = await page.locator(selector).first().evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration.split(',').every((d) => parseFloat(d) === 0), `${selector}: ${duration}`).toBe(true);
  }
  const after = await page
    .locator('.site-nav__link')
    .first()
    .evaluate((el) => getComputedStyle(el, '::after').transitionDuration);
  expect(after.split(',').every((d) => parseFloat(d) === 0)).toBe(true);
});

test('docs pages use the site header, with search in the sidebar', async ({ page }) => {
  await page.goto('/docs/how-it-works/basics/');
  await expect(page.locator('[data-site-header]')).toHaveCount(1);
  await expect(page.locator('.site-nav a[href="/docs/"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#starlight__sidebar .docs-search site-search')).toHaveCount(1);
  await expect(page.locator('header.header site-search')).toHaveCount(0);
});
