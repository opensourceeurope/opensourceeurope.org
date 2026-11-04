import type { Citation } from './types';

// Minimal markdown renderer for chat answers. All input is HTML-escaped first,
// so model output can never inject markup. Supports headings, bold, italic,
// inline code, [text](url) links, bare https:// autolinks, ul/ol lists and
// [n] footnote markers.
//
// A [text](url) link or a bare URL becomes an <a> only when the URL is the URL
// of a citation of the same answer (same host and path; scheme, query,
// fragment, a trailing slash and the host's case are ignored). Every other
// URL stays plain text. The chat function already unlinks such URLs; this is
// the second line of defence.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isHttp(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

// host + path, the same key the chat function compares URLs by.
function urlKey(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

function citedKeys(cites: Record<string, Citation>): Set<string> {
  const keys = new Set<string>();
  for (const c of Object.values(cites)) {
    const key = c && c.url ? urlKey(c.url) : null;
    if (key) keys.add(key);
  }
  return keys;
}

function anchor(escapedUrl: string, label: string): string {
  return `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

function footnotes(s: string, cites: Record<string, Citation>): string {
  return s.replace(/\[(\d+)\]/g, (m: string, n: string) => {
    const c = cites[n];
    if (!c || !c.url || !isHttp(c.url)) return m;
    const title = escapeHtml(c.title || c.source_name || c.url);
    return `<sup class="fn"><a href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer" title="${title}">${n}</a></sup>`;
  });
}

// Inline transforms on an already-escaped line.
function inline(s: string, cites: Record<string, Citation>): string {
  const cited = citedKeys(cites);
  const isCited = (escapedUrl: string): boolean => {
    const key = urlKey(unescapeHtml(escapedUrl));
    return key !== null && cited.has(key);
  };
  return s
    .split(/(`[^`]+`)/)
    .map((part) => {
      if (/^`[^`]+`$/.test(part)) return `<code>${part.slice(1, -1)}</code>`;
      let p = part.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        (_m: string, label: string, url: string) => (isCited(url) ? anchor(url, label) : label),
      );
      // Bare URLs; ones already inside href="..." are preceded by a quote,
      // which this pattern rejects. A URL ends at whitespace or any of
      // ( ) < > " ' ` ] (escaped here as entities), the same characters the
      // chat function stops at, so both agree on the host. Trailing sentence
      // punctuation stays outside the link.
      p = p.replace(
        /(^|[\s(])(https?:\/\/(?:(?!&(?:lt|gt|quot|#39);)[^\s()`\]])+)/g,
        (_m: string, pre: string, raw: string) => {
          const url = raw.replace(/[.,;:!?]+$/, '');
          return pre + (isCited(url) ? anchor(url, url) : url) + raw.slice(url.length);
        },
      );
      p = p.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      p = p.replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
      return footnotes(p, cites);
    })
    .join('');
}

export function renderMarkdown(md: string, cites: Record<string, Citation>): string {
  const html: string[] = [];
  let para: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;

  const flushPara = (): void => {
    if (para.length) {
      html.push(`<p>${para.join('<br>')}</p>`);
      para = [];
    }
  };
  const flushList = (): void => {
    if (list) {
      html.push(`<${list.type}>${list.items.map((i) => `<li>${i}</li>`).join('')}</${list.type}>`);
      list = null;
    }
  };

  for (const line of String(md).split(/\r?\n/)) {
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (h) {
      flushPara();
      flushList();
      html.push(`<p class="md-h">${inline(escapeHtml(h[2]), cites)}</p>`);
    } else if (ul) {
      flushPara();
      if (list && list.type !== 'ul') flushList();
      list = list ?? { type: 'ul', items: [] };
      list.items.push(inline(escapeHtml(ul[1]), cites));
    } else if (ol) {
      flushPara();
      if (list && list.type !== 'ol') flushList();
      list = list ?? { type: 'ol', items: [] };
      list.items.push(inline(escapeHtml(ol[1]), cites));
    } else {
      flushList();
      para.push(inline(escapeHtml(line), cites));
    }
  }
  flushPara();
  flushList();
  return html.join('');
}
