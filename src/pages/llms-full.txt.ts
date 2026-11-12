import type { APIRoute } from 'astro';
import { renderLlmsFullTxt } from '../lib/llms';
import { docsPages, llmsHead } from '../lib/llms-content';

// The text of every docs page in one file, for AI tools. Not a page, so not in the sitemap.
export const GET: APIRoute = async ({ site }) =>
  new Response(renderLlmsFullTxt(await llmsHead(), await docsPages(site!)), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
