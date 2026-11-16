// Draws the share images (Open Graph and X cards), 1200 by 630 pixels, at build time.
// satori lays out the card and turns it into SVG, and resvg turns the SVG into PNG.
// src/pages/og/[...path].png.ts serves one image per page, and the heads link to them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** The text of one share image. `path` is the page's path, such as `/docs/faq/`. */
export type OgCard = {
  path: string;
  eyebrow?: string;
  title: string;
  description?: string;
};

/** The path of the generic image, which the home page and every page without a card use. */
export const DEFAULT_OG_PATH = '/og/default.png';

/** The path of the share image of a page: `/docs/faq/` gives `/og/docs/faq.png`. */
export function ogImagePath(pagePath: string): string {
  const trimmed = pagePath.replace(/^\/+|\/+$/g, '');
  return trimmed ? `/og/${trimmed}.png` : DEFAULT_OG_PATH;
}

// The colours of src/styles/tokens.css.
const BG = '#0a242b';
const TEXT = '#ffffff';
const MUTED = 'rgba(255, 255, 255, 0.72)';
const ACCENT = '#9fe7f5';
const BRAND_GRADIENT = 'linear-gradient(90deg, #419ebd 0%, #9fe7f5 30%, #f7ad1a 70%, #f27f0c 100%)';
const GLOW =
  'radial-gradient(circle at 100% 0%, rgba(159, 231, 245, 0.28) 0%, rgba(159, 231, 245, 0) 45%), ' +
  'radial-gradient(circle at 0% 100%, rgba(242, 127, 12, 0.18) 0%, rgba(242, 127, 12, 0) 40%)';
const LOGO_RATIO = 119 / 50;

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): Node => ({
  type,
  props: { style, children, ...extra },
});

type Assets = { fonts: { name: string; data: Buffer; weight: 500 | 700; style: 'normal' }[]; logo: string };
let assets: Assets | undefined;

// The build runs from the repository root, so the files are read from there.
function loadAssets(): Assets {
  if (assets) return assets;
  const root = process.cwd();
  const font = (weight: 500 | 700) => ({
    name: 'Manrope',
    data: readFileSync(join(root, `src/assets/fonts/Manrope-${weight}.ttf`)),
    weight,
    style: 'normal' as const,
  });
  const svg = readFileSync(join(root, 'public/images/ose-logo.svg'));
  assets = { fonts: [font(500), font(700)], logo: `data:image/svg+xml;base64,${svg.toString('base64')}` };
  return assets;
}

// Smaller type for longer titles, so most fit on two or three lines.
function titleSize(title: string, large: boolean): number {
  if (large) return title.length <= 40 ? 84 : 72;
  if (title.length <= 32) return 80;
  if (title.length <= 60) return 66;
  return 56;
}

function card(content: OgCard, logo: string, large: boolean): Node {
  const logoHeight = large ? 88 : 60;
  const size = titleSize(content.title, large);
  const top = h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }, [
    h('img', {}, undefined, { src: logo, width: Math.round(logoHeight * LOGO_RATIO), height: logoHeight }),
    content.eyebrow
      ? h(
          'div',
          {
            display: 'flex',
            color: ACCENT,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: 3,
            textTransform: 'uppercase',
            padding: '10px 22px',
            border: `2px solid ${ACCENT}`,
            borderRadius: 999,
          },
          content.eyebrow,
        )
      : null,
  ]);
  const text = h('div', { display: 'flex', flexDirection: 'column', gap: 24 }, [
    h(
      'div',
      { display: 'block', fontSize: size, lineHeight: 1.12, fontWeight: 700, color: TEXT, letterSpacing: -1.5, lineClamp: 3 },
      content.title,
    ),
    content.description
      ? h('div', { display: 'block', fontSize: 30, lineHeight: 1.4, fontWeight: 500, color: MUTED, lineClamp: 2 }, content.description)
      : null,
  ]);
  return h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      width: OG_WIDTH,
      height: OG_HEIGHT,
      backgroundColor: BG,
      backgroundImage: GLOW,
      fontFamily: 'Manrope',
    },
    [
      h('div', { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flexGrow: 1, padding: '64px 80px 56px' }, [
        top,
        text,
      ]),
      h('div', { display: 'flex', width: '100%', height: 12, backgroundImage: BRAND_GRADIENT }),
    ],
  );
}

/** The PNG of one share image. `large` draws the generic image, with a bigger logo and title. */
export async function renderOgImage(content: OgCard, large = false): Promise<Buffer> {
  const { fonts, logo } = loadAssets();
  const svg = await satori(card(content, logo, large) as never, { width: OG_WIDTH, height: OG_HEIGHT, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
}
