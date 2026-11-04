import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { allowedFor, diffPage, type AllowedDiffs } from '../../scripts/live/drift';
import { extractPage, type LivePage } from '../../scripts/live/extract';
import { ROUTES } from './routes';

// Each page task enables its routes in routes.ts. A route without a live
// fixture (the 404 page) has nothing to compare against.
const FIXTURES = 'tests/fixtures/live';
const slugFor = (path: string) => (path === '/' ? 'home' : path.replace(/^\/|\/$/g, '').replace(/\//g, '--'));
const allowed = JSON.parse(readFileSync(`${FIXTURES}/allowed-diffs.json`, 'utf8')) as AllowedDiffs;

for (const route of ROUTES.filter((r) => r.status === 200 && r.live !== false)) {
  const run = route.enabled ? test : test.skip;

  test.describe(`${route.path} parity`, () => {
    run('has the same headings and text as the live page', async ({ request }, info) => {
      test.skip(info.project.name !== 'desktop', 'HTML comparison, runs once');
      const live = JSON.parse(readFileSync(`${FIXTURES}/${slugFor(route.path)}.json`, 'utf8')) as LivePage;
      const res = await request.get(route.path);
      expect(res.status()).toBe(200);
      const local = extractPage(await res.text(), route.path);
      expect(diffPage(live, local, allowedFor(allowed, route.path))).toEqual([]);
    });

    run('shows every heading and text block without JavaScript', async ({ page, request }, info) => {
      test.skip(info.project.name !== 'no-js', 'no-JS check');
      const local = extractPage(await (await request.get(route.path)).text(), route.path);
      await page.goto(route.path);
      // Copies hidden from assistive technology (carousel clones, glyphs) are not part of the comparison,
      // and neither are controls that need the script ([data-js-only]) or the consent banner,
      // which is hidden until the script runs and shares its title with the footer link.
      const exposed = page.locator(
        ':not([aria-hidden="true"], [aria-hidden="true"] *, [data-js-only], [data-js-only] *, [data-consent], [data-consent] *)',
      );

      for (const heading of local.headings) {
        const matches = page.getByRole('heading', { level: heading.level, name: heading.text, exact: true }).and(exposed);
        await expect(matches.first(), heading.text).toBeVisible();
        for (const match of await matches.all()) await expect(match, heading.text).toBeVisible();
      }
      const jsOnly = page.locator('[data-js-only], [data-js-only] *');
      for (const text of new Set(local.textBlocks)) {
        const matches = page.getByText(text, { exact: true }).and(exposed);
        const hidesOnlyInJsControls =
          (await matches.count()) === 0 && (await page.getByText(text, { exact: true }).and(jsOnly).count()) > 0;
        if (hidesOnlyInJsControls) continue;
        await expect(matches.first(), text).toBeVisible();
        for (const match of await matches.all()) await expect(match, text).toBeVisible();
      }
    });
  });
}
