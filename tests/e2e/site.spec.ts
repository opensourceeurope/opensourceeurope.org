import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ROUTES } from './routes';

const ORIGIN = 'https://opensourceeurope.org';

test.describe('site-wide quality', () => {
  for (const route of ROUTES) {
    const run = route.enabled ? test : test.skip;

    if (route.status === 200) {
      run(`${route.path} meets the quality bar`, async ({ page, context }) => {
        const hosts = new Set<string>();
        page.on('request', (request) => {
          const { protocol, hostname } = new URL(request.url());
          if (protocol.startsWith('http')) hosts.add(hostname);
        });

        const response = await page.goto(route.path);
        await page.waitForLoadState('networkidle');
        expect(response?.status()).toBe(200);

        await expect(page.locator('h1')).toHaveCount(1);
        await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', ORIGIN + route.path);
        await expect(page.locator('meta[name=description]')).toHaveAttribute('content', /\S/);
        await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /\S/);

        const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
        expect(jsonLd.length).toBeGreaterThan(0);
        for (const block of jsonLd) expect(() => JSON.parse(block)).not.toThrow();

        expect([...hosts].filter((h) => h !== 'localhost')).toEqual([]);
        expect(await context.cookies()).toEqual([]);

        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        expect(axe.violations).toEqual([]);

        // Review focus: no horizontal scroll at narrow and zoomed viewports.
        for (const size of [
          { width: 320, height: 640 },
          { width: 640, height: 450 },
        ]) {
          await page.setViewportSize(size);
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth,
          );
          expect(overflow, `${size.width}x${size.height}`).toBeLessThanOrEqual(0);
        }
      });
    } else {
      run(`${route.path} is a noindex 404`, async ({ page }) => {
        const response = await page.goto(route.path);
        expect(response?.status()).toBe(404);
        await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
        await expect(page.locator('link[rel=canonical]')).toHaveCount(0);
        await expect(page.locator('h1')).toHaveCount(1);

        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        expect(axe.violations).toEqual([]);
      });
    }
  }

  test('the sitemap lists every enabled page and leaves out the 404 page', async ({}, info) => {
    test.skip(info.project.name !== 'desktop', 'reads the build output once');
    const sitemap = readFileSync('dist/sitemap-0.xml', 'utf8');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    for (const route of ROUTES.filter((r) => r.enabled && r.status === 200)) {
      expect(locs).toContain(ORIGIN + route.path);
    }
    expect(locs.filter((loc) => loc.includes('404'))).toEqual([]);
  });
});
