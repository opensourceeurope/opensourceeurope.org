// The share image of every page, read from the content collections. The home page and the
// pages with `noindex` have no card of their own and use the generic image. A page that
// sets `seo.ogImage` uses that image instead.
import { getCollection } from 'astro:content';
import { loadSettings } from './site';
import { loadPosts, postPath } from './blog';
import { pageTitle } from './llms';
import { ogImagePath, type OgCard } from './og';

let cache: Promise<OgCard[]> | undefined;

/** One card per page that has its own share image. Built once per build. */
export function ogCards(): Promise<OgCard[]> {
  cache ??= (async () => {
    const { seo: siteSeo, share_image: labels, blog } = await loadSettings();
    const title = (seoTitle: string) => pageTitle(seoTitle, siteSeo.site_name);
    type Seo = { title: string; description: string; ogImage?: string; noindex?: boolean };
    // A page with its own `seo.ogImage` needs no drawn image.
    const page = (path: string, seo: Seo, eyebrow?: string): OgCard[] =>
      seo.noindex || seo.ogImage ? [] : [{ path, eyebrow, title: title(seo.title), description: seo.description }];

    const pages = (await getCollection('pages'))
      .filter((entry) => entry.id !== 'home')
      .flatMap((entry) => page(`/${entry.id}/`, entry.data.seo));
    const services = (await getCollection('services')).flatMap((entry) =>
      page(`/services/${entry.id}/`, entry.data.seo, labels.services_label),
    );
    const legal = (await getCollection('legal')).flatMap((entry) => page(`/${entry.id}/`, entry.data.seo, labels.legal_label));
    const posts = (await loadPosts()).map((post) => ({
      path: postPath(post),
      eyebrow: labels.blog_label,
      title: post.data.title,
      description: post.data.description,
    }));
    // Starlight builds draft pages in `npm run dev` only, so their images follow the same rule.
    const docs = (await getCollection('docs', (entry) => import.meta.env.DEV || !entry.data.draft)).map((entry) => ({
      path: `/${entry.id}/`,
      eyebrow: labels.docs_label,
      title: entry.data.title,
      description: entry.data.description,
    }));
    return [
      ...pages,
      ...services,
      ...legal,
      { path: '/blog/', eyebrow: labels.blog_label, title: blog.title, description: blog.description },
      ...posts,
      ...docs,
    ];
  })();
  return cache;
}

/** The generic card, drawn larger. The home page and every page without a card use it. */
export async function defaultOgCard(): Promise<OgCard> {
  const { share_image } = await loadSettings();
  return { path: '/', title: share_image.default_title, description: share_image.default_description };
}

/**
 * The share image of a page: its `seo.ogImage` if it sets one, else the card the build draws
 * for its path, else the generic image.
 */
export async function ogImageFor(pathname: string, override?: string): Promise<string> {
  if (override) return override;
  const { seo } = await loadSettings();
  const normalised = pathname.endsWith('/') ? pathname : `${pathname}/`;
  const hasCard = (await ogCards()).some((card) => card.path === normalised);
  return hasCard ? ogImagePath(normalised) : seo.default_og_image;
}
