import { expect, test } from '@playwright/test';

test('the "For projects" cards are followed by the submit button', async ({ page }) => {
  await page.goto('/how-to-join/');
  const steps = page.locator('section.steps', { has: page.getByRole('heading', { level: 2, name: 'For projects' }) });
  await expect(steps.locator('li h3')).toHaveText(['Submit your project', 'Publish your project', 'Start receiving funds']);
  const cards = (await steps.locator('ol').boundingBox())!;
  const button = steps.getByRole('link', { name: 'submit a project' });
  await expect(button).toBeVisible();
  expect((await button.boundingBox())!.y).toBeGreaterThan(cards.y + cards.height);
});

test('the conditions list sits between its intro and closing paragraphs', async ({ page }) => {
  await page.goto('/how-to-join/');
  const section = page.locator('section', { has: page.getByRole('heading', { level: 2, name: 'Conditions for developers' }) });
  await expect(section.getByRole('listitem')).toHaveCount(3);
  const list = (await section.getByRole('list').boundingBox())!;
  const closing = (await section.getByText('These conditions help maintain trust').boundingBox())!;
  expect(closing.y).toBeGreaterThan(list.y + list.height - 1);
});
