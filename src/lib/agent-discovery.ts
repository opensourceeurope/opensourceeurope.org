// The discovery files for AI agents under /.well-known/:
// - agent-skills/index.json and the skill it lists (Agent Skills Discovery 0.2.0);
// - ai-catalog.json (ARD and the AI Catalog data model);
// - api-catalog (RFC 9727).
// The MCP server runs on the agent's own computer through uvx, so no file names a
// hosted MCP endpoint, and the site publishes no MCP Server Card, which describes
// remote servers only.
import { createHash } from 'node:crypto';
import skillSource from '../content/agent-skills/open-source-europe/SKILL.md?raw';
import manifest from '../../.release-please-manifest.json';
import { fillVersion } from './llms';

const VERSION: string = manifest['.'];

export const SKILL_NAME = 'open-source-europe';
export const SKILL_PATH = `/.well-known/agent-skills/${SKILL_NAME}/SKILL.md`;
export const MCP_PACKAGE = 'ose-knowledge-mcp';
export const MCP_GUIDE_PATH = '/docs/guides/ask-ose-from-your-ai-tools/';

/** The SKILL.md that agents download, with the current MCP version filled in. */
export function skillMarkdown(version = VERSION): string {
  return fillVersion(skillSource, version);
}

/** The `description` in the front matter of a SKILL.md. */
export function skillDescription(markdown: string): string {
  const match = /^---\r?\n[\s\S]*?^description:\s*(.+)$/m.exec(markdown);
  if (!match) throw new Error('The skill has no description');
  return match[1].trim();
}

export function sha256(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

export function skillsIndex(site: URL, markdown = skillMarkdown()): object {
  return {
    $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    skills: [
      {
        name: SKILL_NAME,
        type: 'skill-md',
        description: skillDescription(markdown),
        url: new URL(SKILL_PATH, site).href,
        digest: sha256(markdown),
      },
    ],
  };
}

export type CatalogTexts = { site_name: string; representative_queries: string[]; mcp_description: string };

export function aiCatalog(site: URL, texts: CatalogTexts, markdown = skillMarkdown(), version = VERSION): object {
  const host = site.hostname;
  return {
    specVersion: '1.0',
    host: { displayName: texts.site_name, identifier: new URL('/', site).href },
    entries: [
      {
        identifier: `urn:air:${host}:skill:${SKILL_NAME}`,
        displayName: `${texts.site_name} agent skill`,
        description: skillDescription(markdown),
        type: 'text/markdown',
        url: new URL(SKILL_PATH, site).href,
        representativeQueries: texts.representative_queries,
      },
      {
        identifier: `urn:air:${host}:mcp-package:${MCP_PACKAGE}`,
        displayName: `${texts.site_name} knowledge MCP server`,
        description: texts.mcp_description,
        // The server in the format of the MCP Registry's server.json: a local package, no remote.
        type: 'application/json',
        data: {
          name: MCP_PACKAGE,
          description: texts.mcp_description,
          version,
          websiteUrl: new URL(MCP_GUIDE_PATH, site).href,
          packages: [{ registryType: 'pypi', identifier: MCP_PACKAGE, version, transport: { type: 'stdio' } }],
        },
        representativeQueries: texts.representative_queries,
      },
      {
        identifier: `urn:air:${host}:docs:llms-txt`,
        displayName: `${texts.site_name} pages and docs for AI tools`,
        type: 'text/markdown',
        url: new URL('/llms.txt', site).href,
        representativeQueries: texts.representative_queries,
      },
    ],
  };
}

/** RFC 9727: the MCP package as the one API, with its docs and the AI catalog. */
export function apiCatalog(site: URL): object {
  return {
    linkset: [
      {
        anchor: `https://pypi.org/project/${MCP_PACKAGE}/`,
        'service-doc': [{ href: new URL(MCP_GUIDE_PATH, site).href, type: 'text/html' }],
        'service-desc': [{ href: new URL('/.well-known/ai-catalog.json', site).href, type: 'application/json' }],
      },
    ],
  };
}
