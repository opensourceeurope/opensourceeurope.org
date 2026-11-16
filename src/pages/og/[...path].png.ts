// The share image of every page, and the generic one at /og/default.png. See src/lib/og.ts.
import type { APIRoute, GetStaticPaths } from 'astro';
import { DEFAULT_OG_PATH, ogImagePath, renderOgImage, type OgCard } from '../../lib/og';
import { defaultOgCard, ogCards } from '../../lib/og-pages';

// `/og/docs/faq.png` has the param `docs/faq`.
const param = (imagePath: string) => imagePath.replace(/^\/og\//, '').replace(/\.png$/, '');

export const getStaticPaths = (async () => {
  const cards = await ogCards();
  return [
    { params: { path: param(DEFAULT_OG_PATH) }, props: { card: await defaultOgCard(), large: true } },
    ...cards.map((card) => ({ params: { path: param(ogImagePath(card.path)) }, props: { card, large: false } })),
  ];
}) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ props }) => {
  const { card, large } = props as { card: OgCard; large: boolean };
  return new Response(new Uint8Array(await renderOgImage(card, large)), { headers: { 'Content-Type': 'image/png' } });
};
