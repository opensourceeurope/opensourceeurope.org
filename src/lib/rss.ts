// Builds the RSS 2.0 feed of the blog. Plain functions, so unit tests can call them without Astro.

export interface FeedItem {
  title: string;
  // Absolute URL of the post.
  link: string;
  description: string;
  date: Date;
  // The post rendered to HTML. Root-relative links in it are made absolute.
  html?: string;
  author?: string;
}

export interface Feed {
  title: string;
  description: string;
  // Absolute URL of the blog page.
  link: string;
  // Absolute URL of the feed itself.
  self: string;
  items: FeedItem[];
}

const XML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

export const escapeXml = (text: string) => text.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);

/** Makes `href="/…"` and `src="/…"` absolute against `origin`, because feed readers have no base URL. */
export function absoluteUrls(html: string, origin: string) {
  const base = origin.replace(/\/$/, '');
  return html.replace(/\b(href|src)="\/(?!\/)/g, `$1="${base}/`);
}

// CDATA cannot hold "]]>", so it is split across two sections.
const cdata = (text: string) => `<![CDATA[${text.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;

export function buildRss(feed: Feed) {
  const origin = new URL(feed.link).origin;
  const items = feed.items.map((item) =>
    [
      '    <item>',
      `      <title>${escapeXml(item.title)}</title>`,
      `      <link>${escapeXml(item.link)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(item.link)}</guid>`,
      `      <pubDate>${item.date.toUTCString()}</pubDate>`,
      `      <description>${escapeXml(item.description)}</description>`,
      item.author ? `      <dc:creator>${escapeXml(item.author)}</dc:creator>` : '',
      item.html ? `      <content:encoded>${cdata(absoluteUrls(item.html, origin))}</content:encoded>` : '',
      '    </item>',
    ]
      .filter(Boolean)
      .join('\n'),
  );
  const latest = feed.items.reduce<Date | undefined>((max, item) => (!max || item.date > max ? item.date : max), undefined);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '  <channel>',
    `    <title>${escapeXml(feed.title)}</title>`,
    `    <link>${escapeXml(feed.link)}</link>`,
    `    <description>${escapeXml(feed.description)}</description>`,
    '    <language>en</language>',
    `    <atom:link href="${escapeXml(feed.self)}" rel="self" type="application/rss+xml" />`,
    latest ? `    <lastBuildDate>${latest.toUTCString()}</lastBuildDate>` : '',
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}
