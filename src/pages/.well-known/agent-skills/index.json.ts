import type { APIRoute } from 'astro';
import { skillsIndex } from '../../../lib/agent-discovery';

// The skills that agents can install, per the Agent Skills Discovery RFC 0.2.0.
export const GET: APIRoute = ({ site }) =>
  new Response(JSON.stringify(skillsIndex(site!), null, 2), { headers: { 'content-type': 'application/json' } });
