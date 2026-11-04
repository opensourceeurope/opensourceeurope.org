import { describe, expect, it } from 'vitest';
import { buildEmail, escapeHtml } from '../src/email';

const base = { name: 'Ada', email: 'ada@example.org', interest: 'Becoming a partner', message: 'Hi' };

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });
});

describe('buildEmail', () => {
  it('builds the subject from interest and name', () => {
    expect(buildEmail(base).subject).toBe('Website contact: Becoming a partner - Ada');
  });
  it('escapes HTML and keeps CR/LF out of the subject', () => {
    const m = buildEmail({ ...base, name: '<b>x</b>\r\nBcc: a@b.c', message: '<script>1</script>' });
    expect(m.html).not.toContain('<b>');
    expect(m.html).not.toContain('<script>');
    expect(m.subject).not.toMatch(/[\r\n]/);
  });
  it('sets the visitor as Reply-To', () => {
    expect(buildEmail(base).replyTo).toBe('ada@example.org');
  });
  it('lists the optional fields only when present', () => {
    const m = buildEmail({ ...base, interest: 'Other', interestOther: 'Hosting', link: 'https://x.org' });
    expect(m.text).toContain('Other interest: Hosting');
    expect(m.text).toContain('Link: https://x.org');
    expect(buildEmail(base).text).not.toContain('Link:');
  });
});
