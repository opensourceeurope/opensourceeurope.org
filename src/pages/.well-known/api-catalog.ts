import type { APIRoute } from 'astro';
import { apiCatalog } from '../../lib/agent-discovery';

// The API catalog (RFC 9727). deploy-site.yml uploads it as application/linkset+json.
export const GET: APIRoute = ({ site }) =>
  new Response(JSON.stringify(apiCatalog(site!), null, 2), { headers: { 'content-type': 'application/linkset+json' } });
