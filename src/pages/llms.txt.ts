import type { APIRoute } from 'astro';
import { renderLlmsTxt } from '../lib/llms';
import { llmsHead, llmsSections } from '../lib/llms-content';

// The index for AI tools, https://llmstxt.org. Not a page, so not in the sitemap.
export const GET: APIRoute = async ({ site }) =>
  new Response(renderLlmsTxt(await llmsHead(), await llmsSections(site!)), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
