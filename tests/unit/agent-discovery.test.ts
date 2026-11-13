import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { aiCatalog, apiCatalog, sha256, skillDescription, skillMarkdown, skillsIndex } from '../../src/lib/agent-discovery';

const site = new URL('https://www.opensourceeurope.org');
const texts = { site_name: 'Open Source Europe', representative_queries: ['a?', 'b?'], mcp_description: 'Searches the docs.' };

describe('agent skill', () => {
  const markdown = skillMarkdown('1.2.3');

  it('fills in the MCP version', () => {
    expect(markdown).toContain('uvx ose-knowledge-mcp==1.2.3');
    expect(markdown).not.toContain('{version}');
  });

  it('is listed with its description and the SHA-256 of its text', () => {
    const skill = (skillsIndex(site, markdown) as any).skills[0];
    expect(skill.name).toMatch(/^[a-z0-9-]+$/);
    expect(skill.type).toBe('skill-md');
    expect(skill.description).toBe(skillDescription(markdown));
    expect(skill.url).toBe('https://www.opensourceeurope.org/.well-known/agent-skills/open-source-europe/SKILL.md');
    expect(skill.digest).toBe(`sha256:${createHash('sha256').update(markdown).digest('hex')}`);
  });

  it('formats a digest as sha256:<hex>', () => {
    expect(sha256('')).toBe('sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('aiCatalog', () => {
  const catalog = aiCatalog(site, texts, skillMarkdown('1.2.3'), '1.2.3') as any;

  it('gives every entry an identifier, a name, a type and exactly one of url or data', () => {
    expect(catalog.entries.length).toBeGreaterThan(0);
    for (const entry of catalog.entries) {
      expect(entry.identifier).toMatch(/^urn:air:www\.opensourceeurope\.org:/);
      expect(entry.displayName).toBeTruthy();
      expect(entry.type).toBeTruthy();
      expect('url' in entry !== 'data' in entry).toBe(true);
    }
  });

  it('names no hosted MCP endpoint, only the local package', () => {
    const mcp = catalog.entries.find((e: any) => e.data);
    expect(mcp.data.packages).toEqual([{ registryType: 'pypi', identifier: 'ose-knowledge-mcp', version: '1.2.3', transport: { type: 'stdio' } }]);
    expect(mcp.data).not.toHaveProperty('remotes');
  });
});

describe('apiCatalog', () => {
  it('is a linkset with the MCP package and its docs', () => {
    const entry = (apiCatalog(site) as any).linkset[0];
    expect(entry.anchor).toBe('https://pypi.org/project/ose-knowledge-mcp/');
    expect(entry['service-doc'][0].href).toBe('https://www.opensourceeurope.org/docs/guides/ask-ose-from-your-ai-tools/');
  });
});
