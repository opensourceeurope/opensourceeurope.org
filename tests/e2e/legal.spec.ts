import { expect, test } from '@playwright/test';

for (const { path, title } of [
  { path: '/privacy-policy/', title: 'Privacy Policy' },
  { path: '/term-conditions/', title: 'Terms of Hosting' },
]) {
  test(`${path} has its title as the one h1, then the closing call to action`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.getByRole('heading', { level: 2, name: 'Ready to host your project?' })).toBeVisible();
  });
}

test('the privacy policy describes the contact form, hosting and browser storage', async ({ page }) => {
  await page.goto('/privacy-policy/');
  const main = page.locator('main');
  await expect(main).toContainText('through Proton Mail (Proton AG, Switzerland)');
  await expect(main).not.toContainText('Transactional Email');
  await expect(main).toContainText('home@opensourceeurope.org');
  await expect(main).toContainText('Belgian Data Protection Authority');
  await expect(main).toContainText('Proton AG');
  await expect(main).not.toContainText('Lorem Ipsum');
  await expect(main).toContainText('ose-consent');
  await expect(main).not.toContainText(/Google Tag Manager|reCAPTCHA/);
});

test('the terms page holds the Terms of Hosting and Exhibit A', async ({ page }) => {
  await page.goto('/term-conditions/');
  const main = page.locator('main');
  await expect(page.getByRole('heading', { level: 2, name: '6. TERMINATION' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'EXHIBIT A: Protocols' })).toBeVisible();
  await expect(main).not.toContainText('Lorem Ipsum');
  await expect(main).toContainText('operating the Open Source Europe fiscal hosting programme');
  await expect(main).toContainText('home@opensourceeurope.org');
  await expect(main).not.toContainText(/Foundation|jf@opencollective\.com/);
});

test('the 404 page links back to the home page and fills the screen', async ({ page }) => {
  const response = await page.goto('/does-not-exist/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: '404' })).toBeVisible();
  await expect(page.getByText('Oops, this page doesn’t exist!')).toBeVisible();
  await expect(page.getByRole('link', { name: 'return to homepage' })).toHaveAttribute('href', '/');
  const viewport = page.viewportSize()!;
  const section = (await page.locator('main section').first().boundingBox())!;
  expect(section.height).toBeGreaterThanOrEqual(viewport.height - 1);
});
