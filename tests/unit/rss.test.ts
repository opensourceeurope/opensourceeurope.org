import { describe, expect, it } from 'vitest';
import { absoluteUrls, buildRss, escapeXml } from '../../src/lib/rss';
import { formatDate, isoDate } from '../../src/lib/blog-format';

const feed = {
  title: 'OSE blog',
  description: 'News & notes',
  link: 'https://opensourceeurope.org/blog/',
  self: 'https://opensourceeurope.org/rss.xml',
  items: [
    {
      title: 'Older <post>',
      link: 'https://opensourceeurope.org/blog/older/',
      description: 'Old',
      date: new Date('2026-01-01'),
    },
    {
      title: 'Newer',
      link: 'https://opensourceeurope.org/blog/newer/',
      description: 'New',
      date: new Date('2026-11-09'),
      author: 'Ada',
      html: '<p><a href="/docs/">Docs</a> <img src="/app/uploads/x.png" alt="x"> <a href="//cdn.example/">cdn</a> ]]> end</p>',
    },
  ],
};

describe('buildRss', () => {
  const xml = buildRss(feed);

  it('declares RSS 2.0 with a self link', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"')).toBe(true);
    expect(xml).toContain('<atom:link href="https://opensourceeurope.org/rss.xml" rel="self" type="application/rss+xml" />');
  });

  it('escapes text', () => {
    expect(xml).toContain('<description>News &amp; notes</description>');
    expect(xml).toContain('<title>Older &lt;post&gt;</title>');
  });

  it('dates the feed by its newest item', () => {
    expect(xml).toContain('<lastBuildDate>Mon, 09 Nov 2026 00:00:00 GMT</lastBuildDate>');
  });

  it('carries the full text with absolute links and a safe CDATA section', () => {
    expect(xml).toContain('href="https://opensourceeurope.org/docs/"');
    expect(xml).toContain('src="https://opensourceeurope.org/app/uploads/x.png"');
    expect(xml).toContain('href="//cdn.example/"');
    expect(xml).toContain(']]]]><![CDATA[> end');
    expect(xml).toContain('<dc:creator>Ada</dc:creator>');
  });

  it('leaves out optional elements an item does not have', () => {
    const older = xml.slice(xml.indexOf('<item>'), xml.indexOf('</item>'));
    expect(older).not.toContain('content:encoded');
    expect(older).not.toContain('dc:creator');
  });
});

describe('helpers', () => {
  it('escapes all five XML characters', () => {
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;');
  });
  it('does not touch absolute or protocol-relative URLs', () => {
    expect(absoluteUrls('<a href="https://x.org/">', 'https://opensourceeurope.org')).toBe('<a href="https://x.org/">');
  });
  it('formats dates in UTC', () => {
    expect(formatDate(new Date('2026-11-09'))).toBe('9 November 2026');
    expect(isoDate(new Date('2026-11-09'))).toBe('2026-11-09');
  });
});
