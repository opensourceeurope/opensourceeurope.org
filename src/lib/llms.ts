// Builds /llms.txt, /llms-full.txt and the Markdown copies of the docs pages, in the format of
// https://llmstxt.org.

export type LlmsLink = { title: string; url: string; description?: string };
export type LlmsSection = { heading: string; links: LlmsLink[] };
export type DocsPage = { title: string; url: string; description?: string; markdown: string };

type Head = { title: string; summary: string; details: string };

const ASIDE_LABELS: Record<string, string> = { note: 'Note', tip: 'Tip', caution: 'Caution', danger: 'Danger' };

/** Escapes the characters that end a Markdown link text early. */
function linkText(text: string): string {
  return text.replace(/[[\]\\]/g, (char) => `\\${char}`);
}

function header({ title, summary, details }: Head): string {
  return `# ${title}\n\n> ${summary.trim()}\n\n${details.trim()}\n`;
}

function linkLine({ title, url, description }: LlmsLink): string {
  return `- [${linkText(title)}](${url})${description ? `: ${description.trim()}` : ''}`;
}

/** The index: the title, the summary, a paragraph and the lists of links, each under an H2. */
export function renderLlmsTxt(head: Head, sections: LlmsSection[]): string {
  const body = sections
    .filter((section) => section.links.length > 0)
    .map((section) => `## ${section.heading}\n\n${section.links.map(linkLine).join('\n')}\n`);
  return [header(head), ...body].join('\n');
}

/** The full text: the same head, then every docs page. */
export function renderLlmsFullTxt(head: Head, pages: DocsPage[]): string {
  return [header(head), ...pages.map((page) => page.markdown)].join('\n---\n\n');
}

/** The address of the Markdown copy of a docs page: /docs/basics/ gives /docs/basics.md. */
export function markdownUrl(pageUrl: string): string {
  return pageUrl.replace(/\/$/, '.md');
}

/**
 * Turns the source of a docs page into plain Markdown, with the same rules as the preprocessors in
 * .opencrane/extensions.py: no MDX imports or card wrappers, link cards as list items, Starlight
 * asides as blockquotes, and absolute links to docs pages. Images become their alt text, because
 * the build moves the image files.
 */
export function docsMarkdown(page: { title: string; url: string; body: string }, origin: string, sourceLabel: string): string {
  let text = page.body.replace(/\r\n/g, '\n');
  text = text.replace(/^import .*$\n?/gm, '');
  text = text.replace(/^[ \t]*<\/?CardGrid>[ \t]*$/gm, '');
  text = text.replace(/^[ \t]*<LinkCard\s+(.*?)\s*\/>[ \t]*$/gm, (_, attrs: string) => {
    const values = Object.fromEntries([...attrs.matchAll(/(\w+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
    return linkLine({ title: values.title ?? '', url: values.href ?? '', description: values.description });
  });
  text = text.replace(/^:::(\w+)\n([\s\S]*?)\n:::$/gm, (_, kind: string, inner: string) => {
    const label = ASIDE_LABELS[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
    const lines = inner.trim().split('\n');
    // Keep a label the author already wrote, such as "**Important**:".
    if (!lines[0].startsWith('**')) lines[0] = `**${label}:** ${lines[0]}`;
    return lines.map((line) => (line.trim() ? `> ${line}` : '>')).join('\n');
  });
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt: string) => `[Image: ${alt}]`);
  text = text.replace(/\]\((\/docs\/[^)]*)\)/g, (_, path: string) => `](${origin}${path})`);
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return `# ${page.title}\n\n${sourceLabel} ${page.url}\n\n${text}\n`;
}

/** Replaces `{version}` with the release version. */
export function fillVersion(text: string, version: string): string {
  return text.replaceAll('{version}', version);
}

/** A page title without the site name after it: "About | Open Source Europe" gives "About". */
export function pageTitle(seoTitle: string, siteName: string): string {
  const suffix = ` | ${siteName}`;
  return seoTitle.endsWith(suffix) ? seoTitle.slice(0, -suffix.length) : seoTitle;
}
