import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const banner = (page: Page) => page.locator('[data-consent]');

test.describe('consent banner', () => {
  test.skip(({ javaScriptEnabled }) => !javaScriptEnabled, 'needs JavaScript');

  test('shows on the first visit, Reject stores denied, a reload keeps it hidden', async ({ page }) => {
    await page.goto('/');
    await expect(banner(page)).toBeVisible();
    await banner(page).getByRole('button', { name: 'Reject analytics' }).click();
    await expect(banner(page)).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('ose-consent'))).toBe('{"v":1,"analytics":"denied"}');
    await page.reload();
    await expect(banner(page)).toBeHidden();
  });

  test('is first in the tab order and the skip link still works', async ({ page }) => {
    await page.goto('/');
    await expect(banner(page)).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(banner(page).getByRole('button', { name: 'Close' })).toBeFocused();
    await banner(page).getByRole('button', { name: 'Close' }).click();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  });

  test('Accept stores granted and loads nothing when analytics is null', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await banner(page).getByRole('button', { name: 'Accept analytics' }).click();
    await page.waitForTimeout(300);
    expect(requests).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('ose-consent'))).toBe('{"v":1,"analytics":"granted"}');
    // The consent choice is the only browser storage, before and after a reload.
    await page.reload();
    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['ose-consent']);
    expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
  });

  test('the footer Privacy settings button reopens it and focus returns when it closes', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ose-consent', '{"v":1,"analytics":"denied"}'));
    await page.goto('/');
    await expect(banner(page)).toBeHidden();
    const opener = page.locator('[data-consent-open]');
    await opener.focus();
    await page.keyboard.press('Enter');
    await expect(banner(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(banner(page)).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('the settings view saves the Analytics toggle', async ({ page }) => {
    await page.goto('/');
    await banner(page).getByRole('button', { name: 'Manage my preferences' }).click();
    await expect(banner(page).getByText('Always on')).toBeVisible();
    await banner(page).getByRole('switch', { name: 'Analytics' }).check();
    await banner(page).getByRole('button', { name: 'Save my choice' }).click();
    expect(await page.evaluate(() => localStorage.getItem('ose-consent'))).toBe('{"v":1,"analytics":"granted"}');
  });

  test('passes axe with the banner and the settings view open', async ({ page }) => {
    await page.goto('/');
    await expect(banner(page)).toBeVisible();
    const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
    await banner(page).getByRole('button', { name: 'Manage my preferences' }).click();
    expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  });

  test('works when localStorage throws', async ({ page }) => {
    const errors: Error[] = [];
    page.on('pageerror', (e) => errors.push(e));
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
    });
    await page.goto('/');
    await expect(banner(page)).toBeVisible();
    await banner(page).getByRole('button', { name: 'Reject analytics' }).click();
    await expect(banner(page)).toBeHidden();
    expect(errors).toEqual([]);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the banner stays hidden and covers nothing', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-consent]')).toBeHidden();
  });
});
