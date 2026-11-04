import { expect, test } from '@playwright/test';

type Box = { x: number; y: number; width: number; height: number };
const box = async (page: import('@playwright/test').Page, selector: string) =>
  (await page.locator(selector).first().boundingBox()) as Box;

test('at 1440 px the story eyebrow sits beside the heading, and the large image beside the text', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop layout');
  await page.goto('/about/');
  const eyebrow = await box(page, '.intro--story .intro__eyebrow');
  const heading = await box(page, '.intro--story .intro__heading');
  const body = await box(page, '.intro--story .intro__body');
  const large = await box(page, '.intro--story .intro__media--1');
  const small = await box(page, '.intro--story .intro__media--2');
  expect(eyebrow.x + eyebrow.width).toBeLessThanOrEqual(heading.x);
  expect(Math.abs(eyebrow.y - heading.y)).toBeLessThan(16);
  expect(large.y).toBeGreaterThan(heading.y + heading.height);
  expect(large.x + large.width).toBeLessThanOrEqual(body.x);
  expect(small.y).toBeGreaterThanOrEqual(body.y + body.height);
  expect(Math.abs(small.y + small.height - (large.y + large.height))).toBeLessThan(4);
});

test('the value cards form one row that scrolls sideways and takes keyboard focus', async ({ page }) => {
  // Runs in every project: without JavaScript, and under reduced motion, the
  // row must scroll by itself. With motion allowed the section pins (motion.spec.ts).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/about/');
  const track = page.locator('[data-values-track]');
  await expect(track).toHaveAttribute('tabindex', '0');
  await expect(track).toHaveAccessibleName('Our values');

  const cards = page.locator('.value__card');
  await expect(cards).toHaveCount(6);
  const tops = await cards.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);

  const { scrollWidth, clientWidth } = await track.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
  expect(scrollWidth).toBeGreaterThan(clientWidth);

  // The last card can be scrolled fully into view inside the row.
  await track.scrollIntoViewIfNeeded();
  await track.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  const last = (await cards.last().boundingBox())!;
  const view = (await track.boundingBox())!;
  expect(last.x + last.width).toBeLessThanOrEqual(view.x + view.width);
  await expect(page.getByText('Just enough structure to keep things clean.', { exact: false })).toBeInViewport();
});

test('team members sit four to a row at 1440 px and two to a row at 390 px', async ({ page }, info) => {
  test.skip(info.project.name === 'no-js', 'layout check');
  await page.goto('/about/');
  const tops = await page
    .locator('.member')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  const perRow = tops.filter((t) => t === tops[0]).length;
  expect(perRow).toBe(info.project.name === 'desktop' ? 4 : 2);
});
