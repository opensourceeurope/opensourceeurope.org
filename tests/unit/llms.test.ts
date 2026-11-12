import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { docsMarkdown, fillVersion, markdownUrl, pageTitle, renderLlmsFullTxt, renderLlmsTxt } from '../../src/lib/llms';

const head = { title: 'Open Source Europe', summary: 'A fiscal host.', details: 'More text.' };
const ORIGIN = 'https://opensourceeurope.org';
const page = (body: string) => docsMarkdown({ title: 'Basics', url: `${ORIGIN}/docs/basics/`, body }, ORIGIN, 'Source:');

describe('renderLlmsTxt', () => {
  const text = renderLlmsTxt(head, [
    { heading: 'Docs', links: [{ title: 'Basics [beta]', url: 'https://x.org/docs/basics/', description: 'Start here.' }] },
    { heading: 'Empty', links: [] },
  ]);

  it('starts with the title as H1 and the summary as a blockquote', () => {
    expect(text.startsWith('# Open Source Europe\n\n> A fiscal host.\n\nMore text.\n')).toBe(true);
  });

  it('lists links under H2 headings, escapes brackets and drops empty sections', () => {
    expect(text).toContain('## Docs\n\n- [Basics \\[beta\\]](https://x.org/docs/basics/): Start here.\n');
    expect(text).not.toContain('## Empty');
  });
});

describe('docsMarkdown', () => {
  it('starts with the title and the address of the page', () => {
    expect(page('Body.')).toBe(`# Basics\n\nSource: ${ORIGIN}/docs/basics/\n\nBody.\n`);
  });

  it('turns an aside into a blockquote with its kind', () => {
    expect(page(':::caution\nCheck the receipt.\n\nKeep it.\n:::')).toContain('> **Caution:** Check the receipt.\n>\n> Keep it.');
    expect(page(':::note\n**Important**: read this.\n:::')).toContain('> **Important**: read this.');
  });

  it('drops MDX imports and card grids, and turns a link card into a list item', () => {
    const text = page(
      "import { CardGrid, LinkCard } from '@astrojs/starlight/components';\n\n<CardGrid>\n  <LinkCard title=\"Expenses\" href=\"/docs/how-it-works/expenses/\" description=\"Pay a supplier.\" />\n</CardGrid>",
    );
    expect(text).not.toMatch(/import|CardGrid|LinkCard/);
    expect(text).toContain(`- [Expenses](${ORIGIN}/docs/how-it-works/expenses/): Pay a supplier.`);
  });

  it('makes docs links absolute and replaces images with their alt text', () => {
    const text = page('See [Refunds](/docs/refunds/).\n\n![A bank form](./form.png)');
    expect(text).toContain(`[Refunds](${ORIGIN}/docs/refunds/)`);
    expect(text).toContain('[Image: A bank form]');
  });

  // A new kind of Starlight syntax needs a rule in docsMarkdown and in .opencrane/extensions.py.
  it('leaves no Starlight or MDX syntax in any docs page', () => {
    const files = (readdirSync('docs', { recursive: true }) as string[]).filter(
      (file) => /\.mdx?$/.test(file) && !file.startsWith('superpowers'),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const body = readFileSync(join('docs', file), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
      const text = page(body).replace(/```[\s\S]*?```/g, '');
      expect(text, file).not.toMatch(/^:::|^import |<[A-Z]\w*[\s/>]|\]\(\/docs\/|!\[/m);
    }
  });
});

describe('renderLlmsFullTxt', () => {
  it('puts the head first and separates the pages', () => {
    const text = renderLlmsFullTxt(head, [
      { title: 'A', url: 'https://x/a/', markdown: '# A\n' },
      { title: 'B', url: 'https://x/b/', markdown: '# B\n' },
    ]);
    expect(text).toMatch(/^# Open Source Europe\n[\s\S]*\n---\n\n# A\n\n---\n\n# B\n$/);
  });
});

describe('addresses, versions and titles', () => {
  it('gives the Markdown copy of a docs page the address without the slash', () => {
    expect(markdownUrl('https://x.org/docs/how-it-works/basics/')).toBe('https://x.org/docs/how-it-works/basics.md');
    expect(markdownUrl('https://x.org/docs/')).toBe('https://x.org/docs.md');
  });

  it('fills in the release version', () => {
    expect(fillVersion('uvx ose-knowledge-mcp=={version}', '2.0.0')).toBe('uvx ose-knowledge-mcp==2.0.0');
  });

  it('removes the site name after a page title', () => {
    expect(pageTitle('About us | Open Source Europe', 'Open Source Europe')).toBe('About us');
    expect(pageTitle('Open Source Europe | A home', 'Open Source Europe')).toBe('Open Source Europe | A home');
  });
});
