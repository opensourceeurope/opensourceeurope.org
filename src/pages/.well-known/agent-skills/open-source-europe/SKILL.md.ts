import type { APIRoute } from 'astro';
import { skillMarkdown } from '../../../../lib/agent-discovery';

// The skill listed in index.json. Its source is src/content/agent-skills/open-source-europe/SKILL.md.
export const GET: APIRoute = () =>
  new Response(skillMarkdown(), { headers: { 'content-type': 'text/markdown; charset=utf-8' } });
