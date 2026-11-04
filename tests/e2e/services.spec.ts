import { expect, test } from '@playwright/test';

const SERVICES = [
  { title: 'Technical Resources & Guidance', path: '/services/technical-resources-guidance/' },
  { title: 'Fiscal hosting', path: '/services/fiscal-hosting/' },
  { title: 'Admin & financial support', path: '/services/admin-financial-support/' },
];

test('the services page lists each service in order, with a link to its page', async ({ page }) => {
  await page.goto('/services/');
  const rows = page.locator('[data-service]');
  await expect(rows).toHaveCount(SERVICES.length);
  for (const [i, service] of SERVICES.entries()) {
    const row = rows.nth(i);
    // The accessible name: the visible letters of a highlighted word are aria-hidden (E1).
    await expect(row.getByRole('heading', { level: 2 })).toHaveAccessibleName(
      new RegExp(`^${service.title.replace(/[&]/g, '\\$&')}`),
    );
    await expect(row.getByRole('link', { name: 'Read more' })).toHaveAttribute('href', service.path);
  }
});

test('at 1440 px each service image sits left of its text', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop layout');
  await page.goto('/services/');
  for (const row of await page.locator('[data-service]').all()) {
    const media = (await row.locator('.service__media').boundingBox())!;
    const text = (await row.locator('.service__text').boundingBox())!;
    expect(media.x + media.width).toBeLessThanOrEqual(text.x);
  }
});

for (const service of SERVICES) {
  test(`${service.path} lists the four numbered cards one after another`, async ({ page }) => {
    // The settled state of E10; with motion allowed the cards stack (motion.spec.ts).
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(service.path);
    const cards = page.locator('.steps--stacked li');
    await expect(cards).toHaveCount(4);
    let bottom = -Infinity;
    for (const [i, card] of (await cards.all()).entries()) {
      await expect(card.getByRole('heading', { level: 3, name: `0${i + 1}`, exact: true })).toBeVisible();
      const b = (await card.boundingBox())!;
      expect(b.y).toBeGreaterThanOrEqual(bottom);
      bottom = b.y + b.height;
    }
  });
}

test('at 1440 px a step card puts its text left of its image', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop layout');
  await page.goto('/services/fiscal-hosting/');
  const card = page.locator('.steps--stacked li').first();
  const text = (await card.locator('.steps__text').boundingBox())!;
  const media = (await card.locator('.steps__media').boundingBox())!;
  expect(text.x + text.width).toBeLessThanOrEqual(media.x);
  expect(Math.round((await card.boundingBox())!.height)).toBe(340);
});
