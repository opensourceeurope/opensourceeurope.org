import { describe, expect, it } from 'vitest';
import { DEFAULT_OG_PATH, OG_HEIGHT, OG_WIDTH, ogImagePath, renderOgImage } from '../../src/lib/og';

describe('ogImagePath', () => {
  it('maps a page path to its image', () => {
    expect(ogImagePath('/docs/faq/')).toBe('/og/docs/faq.png');
    expect(ogImagePath('/blog/')).toBe('/og/blog.png');
    expect(ogImagePath('/services/fiscal-hosting')).toBe('/og/services/fiscal-hosting.png');
  });

  it('gives the home page the generic image', () => {
    expect(ogImagePath('/')).toBe(DEFAULT_OG_PATH);
  });
});

describe('renderOgImage', () => {
  // The width and height of a PNG are in its IHDR chunk, at bytes 16 and 20.
  const size = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)];

  it('draws a 1200 by 630 PNG', async () => {
    const png = await renderOgImage({ path: '/docs/faq/', eyebrow: 'Docs', title: 'Fiscal hosting FAQs', description: 'Answers.' });
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(size(png)).toEqual([OG_WIDTH, OG_HEIGHT]);
  });

  it('draws a long title with Latin Extended letters', async () => {
    const title = 'Zażółć gęślą jaźń: a very long title that has to wrap over several lines of the card and then some more';
    const png = await renderOgImage({ path: '/x/', title }, true);
    expect(size(png)).toEqual([OG_WIDTH, OG_HEIGHT]);
  });
});
