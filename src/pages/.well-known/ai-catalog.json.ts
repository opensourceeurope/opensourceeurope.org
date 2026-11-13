import type { APIRoute } from 'astro';
import { aiCatalog } from '../../lib/agent-discovery';
import { fillVersion } from '../../lib/llms';
import { loadSettings } from '../../lib/site';
import manifest from '../../../.release-please-manifest.json';

// What agents can use here (ARD and the AI Catalog data model): the skill, the MCP package and llms.txt.
export const GET: APIRoute = async ({ site }) => {
  const { seo, llms } = await loadSettings();
  const texts = {
    site_name: seo.site_name,
    representative_queries: llms.representative_queries,
    // The first tool in llms.tools is the MCP server.
    mcp_description: fillVersion(llms.tools[0].description, manifest['.']),
  };
  return new Response(JSON.stringify(aiCatalog(site!, texts), null, 2), { headers: { 'content-type': 'application/json' } });
};
