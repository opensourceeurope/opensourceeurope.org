import { expect, test } from '@playwright/test';

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test('at 1440 px the mission eyebrow, heading and text sit side by side without overlapping', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop layout');
  await page.goto('/');
  const boxes = await Promise.all(
    ['.intro--mission .intro__eyebrow', '.intro--mission .intro__heading', '.intro--mission .intro__body'].map(
      async (selector) => (await page.locator(selector).boundingBox())!,
    ),
  );
  const [eyebrow, heading, body] = boxes as [Box, Box, Box];
  expect(overlaps(eyebrow, heading)).toBe(false);
  expect(overlaps(heading, body)).toBe(false);
  expect(overlaps(eyebrow, body)).toBe(false);
  // One row: left to right, with tops within a few pixels of each other.
  expect(eyebrow.x + eyebrow.width).toBeLessThanOrEqual(heading.x);
  expect(heading.x + heading.width).toBeLessThanOrEqual(body.x);
  expect(Math.abs(heading.y - body.y)).toBeLessThan(16);
});
