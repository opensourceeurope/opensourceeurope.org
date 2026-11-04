import { HTMLElement, NodeType, parse, type Node } from 'node-html-parser';

export type LivePage = {
  url: string;
  title: string;
  description: string;
  headings: { level: number; text: string }[];
  textBlocks: string[];
  images: { src: string; alt: string }[];
  links: { text: string; href: string }[];
};

// Regions left out of text comparison: the live WordPress cookie banner,
// cookie settings dialog, skip link and Gravity Forms form, the local consent
// banner, contact form and skip link, and anything hidden from assistive
// technology (carousel clones, glyphs, split characters whose readable copy
// sits elsewhere).
export const DEFAULT_EXCLUDE = [
  'script',
  'style',
  'noscript',
  'template',
  '#gdpr-cookie-consent-bar',
  '#gdpr-gdprmodal',
  'a.sr-only[href="#main"]',
  '.gform_wrapper',
  '[data-consent]',
  '[data-ask-panel]',
  '.skip-link',
  'form[data-contact]',
  '[aria-hidden="true"]',
];

// Elements whose text belongs to the surrounding block. Any other element
// starts a new text block.
const INLINE = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark',
  'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr',
]);

const HEADING = /^h([1-6])$/;

// The live theme replaces spaces in some headings with `<`, `_` or `()`, and
// ends most headings with `<_` or `()`. The rebuild renders these as
// aria-hidden decoration, so the readable text is the words alone.
const GLYPHS = /<_|\(\)|<|_/g;

export function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function normaliseHeading(text: string): string {
  return normalise(text.replace(GLYPHS, ' '));
}

function tag(node: HTMLElement): string {
  return (node.rawTagName ?? '').toLowerCase();
}

/** Text of a subtree, with `<br>` and block-level children read as word breaks. */
function textOf(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE) return node.text;
  if (!(node instanceof HTMLElement)) return '';
  const name = tag(node);
  if (name === 'br') return ' ';
  const text = node.childNodes.map(textOf).join('');
  return name === '' || INLINE.has(name) ? text : ` ${text} `;
}

/**
 * Splits the text outside headings into blocks. A block is a run of text whose
 * nearest non-inline ancestor is the same element.
 */
function collectBlocks(root: HTMLElement): string[] {
  const blocks: string[] = [];
  let current = '';
  let owner: HTMLElement | null = null;

  const flush = () => {
    const text = normalise(current);
    if (text) blocks.push(text);
    current = '';
  };

  const walk = (node: Node, block: HTMLElement) => {
    if (node.nodeType === NodeType.TEXT_NODE) {
      if (owner !== block) {
        flush();
        owner = block;
      }
      current += node.text;
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const name = tag(node);
    if (HEADING.test(name)) {
      flush();
      owner = null;
      return;
    }
    if (name === 'br') {
      current += ' ';
      return;
    }
    const next = name === '' || INLINE.has(name) ? block : node;
    for (const child of node.childNodes) walk(child, next);
    if (next !== block) {
      flush();
      owner = null;
    }
  };

  walk(root, root);
  flush();
  return blocks;
}

export function extractPage(html: string, url: string, exclude: string[] = DEFAULT_EXCLUDE): LivePage {
  const doc = parse(html, { comment: false });
  const title = normalise(doc.querySelector('title')?.text ?? '');
  const description = normalise(doc.querySelector('meta[name="description"]')?.getAttribute('content') ?? '');

  for (const selector of exclude) {
    for (const node of doc.querySelectorAll(selector)) node.remove();
  }

  const body = doc.querySelector('body') ?? doc;

  const headings = body
    .querySelectorAll('h1, h2, h3, h4, h5, h6')
    .map((h) => ({ level: Number(tag(h).slice(1)), text: normaliseHeading(textOf(h)) }))
    .filter((h) => h.text);

  const images = body
    .querySelectorAll('img')
    .map((img) => ({ src: img.getAttribute('src') ?? '', alt: normalise(img.getAttribute('alt') ?? '') }))
    .filter((img) => img.src);

  const links = body
    .querySelectorAll('a[href]')
    .map((a) => ({ text: normalise(textOf(a)), href: a.getAttribute('href') ?? '' }));

  return { url, title, description, headings, textBlocks: collectBlocks(body), images, links };
}
