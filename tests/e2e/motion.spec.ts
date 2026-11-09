import { expect, test, type Page } from '@playwright/test';

// Motion effects from dev-guide/animations.md (E1–E5, E9, E10). Each effect has a
// settled state that shows without JavaScript and under reduced motion.

const PAGES = ['/', '/about/'];
const SERVICE = '/services/fiscal-hosting/';

/** Scrolls through the whole page so that every scroll-triggered effect gets its chance to start. */
async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 400) {
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
  });
}

/** Every `.char` and `[data-reveal]` element that has a transform or is not fully opaque. */
async function unsettled(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.char, [data-reveal]')]
      .map((el) => ({ text: el.textContent, style: getComputedStyle(el) }))
      .filter(({ style }) => style.transform !== 'none' || Number(style.opacity) < 1)
      .map(({ text, style }) => `${text}: ${style.transform} ${style.opacity}`),
  );
}

const trackTransform = (page: Page) =>
  page.locator('[data-marquee-track]').evaluate((el) => getComputedStyle(el).transform);

test.describe('under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  for (const path of PAGES) {
    test(`${path}: highlighted letters keep their settled state`, async ({ page }, info) => {
      test.skip(info.project.name === 'no-js', 'covered by the no-js test below');
      await page.goto(path);
      await scrollThrough(page);
      await page.waitForTimeout(300);
      expect(await page.locator('.char').count()).toBeGreaterThan(0);
      expect(await unsettled(page)).toEqual([]);
    });
  }

  test('FAQ answers open without the height animation', async ({ page }) => {
    await page.goto('/how-to-join/');
    const durations = await page
      .locator('[data-faq] details')
      .first()
      .evaluate((el) => getComputedStyle(el, '::details-content').transitionDuration);
    expect(durations.split(',').every((d) => parseFloat(d) === 0)).toBe(true);
  });

  test('the logo marquee does not move and its logos wrap', async ({ page }) => {
    await page.goto('/');
    const track = page.locator('[data-marquee-track]');
    await track.scrollIntoViewIfNeeded();
    const before = await trackTransform(page);
    await page.waitForTimeout(2000);
    expect(await trackTransform(page)).toBe(before);
    await expect(track).toHaveCSS('flex-wrap', 'wrap');
    await expect(page.locator('[data-marquee-pause]')).toBeHidden();
  });

  test('moving the pointer over a button does not move a glow', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'pointer effect');
    await page.goto('/');
    const button = page.locator('.cta.primary').first();
    const box = (await button.boundingBox())!;
    const glows = () =>
      page.evaluate(() => [...document.querySelectorAll('[data-glow-el]')].map((el) => getComputedStyle(el).transform));
    await page.mouse.move(box.x + 10, box.y + box.height / 2);
    await page.waitForTimeout(100);
    const before = await glows();
    await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2, { steps: 5 });
    await page.waitForTimeout(500);
    expect(await glows()).toEqual(before);
  });

  test('the circle section on the home page is not pinned', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-pin-circle] .circles')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('[data-pin-circle] .circles__item')).toHaveCount(36);
    const quote = page.locator('[data-pin-circle]');
    await expect(quote).not.toHaveCSS('position', 'sticky');
    await expect(page.locator('.pin-circle')).toHaveCount(0);
  });

  test('the values row is not pinned and scrolls by itself', async ({ page }) => {
    await page.goto('/about/');
    await expect(page.locator('[data-values]')).not.toHaveClass(/is-pinned/);
    const track = page.locator('[data-values-track]');
    const { scrollWidth, clientWidth } = await track.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);
  });

  test('the stacked "How it works" cards are listed one after another', async ({ page }) => {
    await page.goto(SERVICE);
    await expect(page.locator('[data-stack]')).not.toHaveClass(/is-pinned/);
    const tops = await page.locator('.steps--stacked li').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    for (let i = 1; i < tops.length; i++) expect(tops[i]!).toBeGreaterThan(tops[i - 1]!);
  });
});

test.describe('without JavaScript', () => {
  for (const path of PAGES) {
    test(`${path}: every highlighted letter and reveal is fully visible`, async ({ page }, info) => {
      test.skip(info.project.name !== 'no-js', 'no-js only');
      await page.goto(path);
      const hidden = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.char, [data-reveal]')]
          .filter((el) => Number(getComputedStyle(el).opacity) < 1)
          .map((el) => el.textContent),
      );
      expect(hidden).toEqual([]);
      expect(await unsettled(page)).toEqual([]);
    });
  }

  test('no motion control shows and nothing is pinned', async ({ page }, info) => {
    test.skip(info.project.name !== 'no-js', 'no-js only');
    await page.goto('/');
    await expect(page.locator('[data-marquee-pause]')).toBeHidden();
    await expect(page.locator('[data-carousel-next]')).toBeHidden();
    await expect(page.locator('.pin-circle')).toHaveCount(0);
  });
});

test.describe('highlighted words (E1)', () => {
  test('screen readers get the whole word, the letters are hidden from them', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'We make open source sustainable without paperwork', exact: false }),
    ).toBeVisible();
    const exposed = await page.evaluate(
      () => [...document.querySelectorAll('.char')].filter((el) => !el.closest('[aria-hidden="true"]')).length,
    );
    expect(exposed).toBe(0);
  });

  test('the letters grow when the word scrolls into view, then settle', async ({ page }, info) => {
    test.skip(info.project.name === 'no-js', 'needs JavaScript');
    await page.goto('/about/');
    const mark = page.locator('[data-highlight]').filter({ hasText: 'values' });
    // Before the trigger the letters are at full height.
    expect(await mark.locator('.char').first().evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    await mark.scrollIntoViewIfNeeded();
    await expect.poll(() => mark.locator('.char').last().evaluate((el) => getComputedStyle(el).transform)).not.toBe('none');
    await page.waitForTimeout(1500);
    expect(await unsettled(page)).toEqual([]);
  });
});

test.describe('logo marquee (E3)', () => {
  test('moves, and the pause button stops it', async ({ page }, info) => {
    test.skip(info.project.name === 'no-js', 'needs JavaScript');
    await page.goto('/');
    const pause = page.locator('[data-marquee-pause]');
    await pause.scrollIntoViewIfNeeded();
    await expect(pause).toBeVisible();
    await expect(pause).toHaveAccessibleName(/.+/);
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
    // Move the pointer away so that hover does not pause it.
    await page.mouse.move(0, 0);
    const first = await trackTransform(page);
    await page.waitForTimeout(500);
    expect(await trackTransform(page)).not.toBe(first);

    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(0, 0);
    const paused = await trackTransform(page);
    await page.waitForTimeout(500);
    expect(await trackTransform(page)).toBe(paused);

    await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'false');
  });

  test('keeps the logos in one row', async ({ page }, info) => {
    test.skip(info.project.name === 'no-js', 'needs JavaScript');
    await page.goto('/');
    const tops = await page
      .locator('[data-marquee-track] li')
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);
  });
});

test.describe('project card carousel (E4)', () => {
  test('the next and previous buttons move the row', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'arrows from 1024 px');
    await page.goto('/');
    const next = page.locator('[data-carousel-next]');
    const prev = page.locator('[data-carousel-prev]');
    await expect(next).toHaveAccessibleName(/.+/);
    await expect(prev).toHaveAccessibleName(/.+/);
    await expect(prev).toHaveAttribute('aria-disabled', 'true');
    const firstCard = page.locator('[data-cards-track] > li').first();
    await next.scrollIntoViewIfNeeded();
    const before = (await firstCard.boundingBox())!.x;
    await next.focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await firstCard.boundingBox())!.x).toBeLessThan(before - 100);
    await expect(next).toHaveAttribute('aria-disabled', 'true');
    await prev.focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => Math.round((await firstCard.boundingBox())!.x)).toBe(Math.round(before));
  });

  test('cards share one height', async ({ page }) => {
    await page.goto('/');
    const heights = await page
      .locator('[data-cards-track] > li')
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
    expect(new Set(heights).size).toBe(1);
  });

  test('below 1024 px three dots move the row', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'dots below 1024 px');
    await page.goto('/');
    const dots = page.locator('[data-carousel-dot]');
    await expect(dots).toHaveCount(3);
    await expect(dots.first()).toHaveAttribute('aria-current', 'true');
    await expect(dots.nth(2)).toHaveAccessibleName(/.+/);
    const track = page.locator('[data-cards-track]');
    await dots.nth(2).scrollIntoViewIfNeeded();
    await dots.nth(2).click();
    await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(300);
    await expect(dots.nth(2)).toHaveAttribute('aria-current', 'true');
  });
});

test.describe('pointer glow (E5)', () => {
  test('a glow follows the pointer inside a button and never hides the cursor', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'fine pointer only');
    await page.addInitScript(() => localStorage.setItem('ose-consent', '{"v":1,"analytics":"denied"}')); // the banner would cover the hero button
    await page.goto('/');
    const button = page.locator('.cta.primary').first();
    const box = (await button.boundingBox())!;
    await page.mouse.move(box.x + 10, box.y + box.height / 2);
    const glow = button.locator('[data-glow-el]');
    await expect(glow).toHaveCount(1);
    const at = () => glow.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
    const start = await at();
    await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
    await expect.poll(at).toBeGreaterThan(start + 20);
    expect(await page.evaluate(() => getComputedStyle(document.body).cursor)).not.toBe('none');
    expect(await button.evaluate((el) => getComputedStyle(el).cursor)).not.toBe('none');
  });

  test('no glow on touch screens', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'coarse pointer');
    // No banner over the button, and the tap must not leave the site (the CTA may link elsewhere).
    await page.addInitScript(() => {
      localStorage.setItem('ose-consent', '{"v":1,"analytics":"denied"}');
      addEventListener('click', (e) => e.preventDefault(), true);
    });
    await page.goto('/', { waitUntil: 'load' });
    const cta = page.locator('.cta.primary').first();
    await expect(cta).toBeVisible();
    // A mouse-type event on a coarse-pointer device: only the (pointer: fine) guard can stop the glow.
    await cta.evaluate((el) => {
      const host = el.matches('[data-glow]') ? el : el.querySelector('[data-glow]');
      if (!host) throw new Error('no glow host in the CTA');
      host.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    });
    await expect(page.locator('[data-glow-el]')).toHaveCount(0);
    await cta.tap();
    await expect(page.locator('[data-glow-el]')).toHaveCount(0);
    await expect(cta).toBeVisible();
  });
});

test.describe('pinned sections (E2, E9, E10)', () => {
  test('the home circles grow into one large circle while the section is pinned', async ({ page }, info) => {
    test.skip(info.project.name === 'no-js', 'needs JavaScript');
    await page.goto('/');
    const quote = page.locator('[data-pin-circle]');
    const middle = page.locator('.circles__item--center');
    await expect(page.locator('.pin-circle')).toHaveCount(1);
    const small = (await middle.boundingBox())!.width;
    const top = await quote.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    const vh = page.viewportSize()!.height;
    await page.evaluate((y) => window.scrollTo(0, y), top + vh);
    await expect.poll(async () => (await quote.boundingBox())!.y).toBe(0);
    await expect.poll(async () => (await middle.boundingBox())!.width, { timeout: 5000 }).toBeGreaterThan(small * 4);
  });

  test('the circle section is not pinned on a short viewport, so its text is not clipped', async ({ page }, info) => {
    test.skip(info.project.name === 'no-js', 'needs JavaScript');
    await page.setViewportSize({ width: 640, height: 450 });
    await page.goto('/');
    await expect(page.locator('.pin-circle')).toHaveCount(0);
    const quote = page.locator('[data-pin-circle]');
    await expect(quote).not.toHaveCSS('position', 'sticky');
    const text = quote.locator('.quote__text').first();
    await text.scrollIntoViewIfNeeded();
    const [t, q] = [(await text.boundingBox())!, (await quote.boundingBox())!];
    expect(t.y + t.height).toBeLessThanOrEqual(q.y + q.height);
  });

  test('the values row moves sideways while the section is pinned', async ({ page }, info) => {
    test.skip(info.project.name === 'no-js', 'needs JavaScript');
    await page.goto('/about/');
    const section = page.locator('[data-values]');
    await expect(section).toHaveClass(/is-pinned/);
    const first = page.locator('.value').first();
    const x0 = (await first.boundingBox())!.x;
    const top = await section.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    await page.evaluate((y) => window.scrollTo(0, y), top + 600);
    await expect.poll(async () => (await section.locator('.values__pin').boundingBox())!.y).toBeLessThanOrEqual(1);
    await expect.poll(async () => (await first.boundingBox())!.x, { timeout: 5000 }).toBeLessThan(x0 - 300);
  });

  test('the "How it works" cards stack while the section is pinned', async ({ page }, info) => {
    test.skip(info.project.name === 'no-js', 'needs JavaScript');
    await page.goto(SERVICE);
    const section = page.locator('[data-stack]');
    await expect(section).toHaveClass(/is-pinned/);
    const cards = page.locator('.steps--stacked li');
    const top = await section.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    // Past the pinned distance every card sits at the same place, the last one on top at full scale.
    await page.evaluate((y) => window.scrollTo(0, y), top + 1800);
    await expect
      .poll(async () => cards.evaluateAll((els) => els.map((el) => getComputedStyle(el).transform)), { timeout: 5000 })
      .toEqual([
        expect.stringMatching(/^matrix\(0\.88/),
        expect.stringMatching(/^matrix\(0\.92/),
        expect.stringMatching(/^matrix\(0\.96/),
        expect.stringMatching(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/),
      ]);
  });
});

test.describe('FAQ accordion (E11)', () => {
  test('answers start closed, and opening one question closes the open one', async ({ page }, info) => {
    test.skip(info.project.name === 'no-js', 'without JavaScript every answer starts open');
    await page.goto('/how-to-join/');
    const items = page.locator('[data-faq] details');
    await expect(items.first()).not.toHaveAttribute('open');
    await items.nth(0).locator('summary').click();
    await expect(items.nth(0)).toHaveAttribute('open', '');
    await items.nth(1).locator('summary').click();
    await expect(items.nth(1)).toHaveAttribute('open', '');
    await expect(items.nth(0)).not.toHaveAttribute('open');
  });

  test('without JavaScript every answer shows', async ({ page }, info) => {
    test.skip(info.project.name !== 'no-js', 'no-js project only');
    await page.goto('/how-to-join/');
    const items = page.locator('[data-faq] details');
    const count = await items.count();
    expect(count).toBeGreaterThan(1);
    for (let i = 0; i < count; i++) await expect(items.nth(i)).toHaveAttribute('open', '');
  });
});
