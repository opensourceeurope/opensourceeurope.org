import type { APIRoute, GetStaticPaths } from 'astro';
import type { DocsPage } from '../lib/llms';
import { docsPages } from '../lib/llms-content';

// A Markdown copy of each docs page for AI tools: /docs/how-it-works/basics/ has
// /docs/how-it-works/basics.md, and /docs/ has /docs.md.
export const getStaticPaths = (async () =>
  (await docsPages(new URL(import.meta.env.SITE))).map((page) => ({
    params: { slug: new URL(page.url).pathname.replace(/^\/|\/$/g, '') },
    props: { page },
  }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
  new Response((props as { page: DocsPage }).page.markdown, {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });
