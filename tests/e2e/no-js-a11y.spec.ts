import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ROUTES } from './routes';

// axe needs JavaScript in the page, so the no-js project cannot run it. This
// spec serves each page with its <script> elements removed instead, which
// renders the page as a visitor without JavaScript sees it.
test.describe('accessibility without JavaScript', () => {
  for (const route of ROUTES) {
    const run = route.enabled ? test : test.skip;
    run(`${route.path} has no axe violations without the site's scripts`, async ({ page }, info) => {
      test.skip(info.project.name === 'mobile', 'runs once, at desktop width');
      await page.route('**/*', async (r) => {
        const type = r.request().resourceType();
        if (type === 'script') return r.abort();
        if (type !== 'document') return r.continue();
        const response = await r.fetch();
        const body = (await response.text()).replace(/<script\b[\s\S]*?<\/script>/gi, '');
        return r.fulfill({ response, body });
      });
      await page.goto(route.path);
      expect(await page.evaluate(() => document.documentElement.classList.contains('js'))).toBe(false);
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(axe.violations).toEqual([]);
    });
  }
});
