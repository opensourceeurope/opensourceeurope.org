import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../../src/scripts/chat/markdown';

describe('renderMarkdown', () => {
  it('escapes HTML in answers', () => {
    const out = renderMarkdown('<img src=x onerror=alert(1)>', {});
    expect(out).toContain('&lt;img');
    expect(out).not.toContain('<img');
  });

  it('turns [n] into a link to the citation', () => {
    const out = renderMarkdown('See [1].', { '1': { n: 1, url: 'https://docs.opencollective.com/x' } });
    expect(out).toContain('href="https://docs.opencollective.com/x"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('does not link non-http URLs', () => {
    expect(renderMarkdown('[x](javascript:alert(1))', {})).not.toContain('href="javascript:');
  });

  it('escapes quotes in citation URLs', () => {
    const out = renderMarkdown('See [1].', { '1': { n: 1, url: 'https://x.org/" onmouseover="alert(1)' } });
    expect(out).not.toContain('onmouseover="');
  });

  it('renders bold', () => {
    expect(renderMarkdown('a **b** c', {})).toBe('<p>a <strong>b</strong> c</p>');
  });

  it('renders lists', () => {
    expect(renderMarkdown('- one\n- two', {})).toBe('<ul><li>one</li><li>two</li></ul>');
    expect(renderMarkdown('1. one\n2. two', {})).toBe('<ol><li>one</li><li>two</li></ol>');
  });

  it('renders paragraphs', () => {
    expect(renderMarkdown('first\nsecond\n\nthird', {})).toBe('<p>first<br>second</p><p>third</p>');
  });

  it('stops a bare URL at the same characters as the chat function', () => {
    // ( ) < > " ' ` ] and whitespace end a URL, so nothing after them can turn
    // the text before the path into userinfo of another host.
    const docs = { '1': { n: 1, url: 'https://docs.example' }, '2': { n: 2, url: 'https://docs.example/a' } };
    const a = renderMarkdown('https://docs.example(@evil.example/x)', docs);
    expect(a).toContain('href="https://docs.example"');
    expect(a).not.toContain('evil.example/x"');
    const b = renderMarkdown('https://docs.example<@evil.example/x', docs);
    expect(b).toContain('href="https://docs.example"');
    expect(b).not.toMatch(/href="[^"]*evil/);
    const c = renderMarkdown('https://docs.example"@evil.example/x', docs);
    expect(c).not.toMatch(/href="[^"]*evil/);
    expect(renderMarkdown('See https://docs.example/a.', docs)).toMatch(/href="https:\/\/docs\.example\/a"[^>]*>https:\/\/docs\.example\/a<\/a>\.<\/p>/);
  });

  const cites = { '1': { n: 1, url: 'https://docs.example/a#part' } };

  it('links a URL only when it matches a citation of the same answer', () => {
    expect(renderMarkdown('See https://docs.example/a/ now', cites)).toContain('href="https://docs.example/a/"');
    expect(renderMarkdown('[guide](https://Docs.Example/a#other)', cites)).toContain('<a href="https://Docs.Example/a#other"');
    expect(renderMarkdown('[guide](https://docs.example/a?x=1)', cites)).toContain('<a href=');
  });

  it('never renders a non-citation https link as an anchor', () => {
    const md = renderMarkdown('Read [the guide](https://evil.example/a) or https://evil.example/b.', cites);
    expect(md).not.toContain('<a');
    expect(md).toBe('<p>Read the guide or https://evil.example/b.</p>');
    expect(renderMarkdown('[x](https://docs.example/other)', cites)).toBe('<p>x</p>');
    expect(renderMarkdown('https://evil.example/a', {})).not.toContain('<a');
  });

  it('does not link a URL that a stray backtick pairs with an inserted one', () => {
    // The chat function used to wrap foreign URLs in backticks; a stray
    // backtick then paired with the inserted one and left the URL outside code.
    for (const s of ['See ` `https://evil.com` for more', 'a `b` c ` `https://evil.com`', 'See ` https://evil.com for more', 'a `b` c ` https://evil.com']) {
      expect(renderMarkdown(s, cites)).not.toContain('<a');
    }
  });

  it('leaves a defanged URL as plain text', () => {
    expect(renderMarkdown('See https[:]//evil[.]com/x', cites)).toBe('<p>See https[:]//evil[.]com/x</p>');
  });
});
