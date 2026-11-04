import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildEmail } from '../src/email';
import { sendEmail, type MailConfig } from '../src/send';
import { headersOf, htmlPartOf, makeCert, startFakeSmtp } from './fake-smtp';

const USER = 'home@opensourceeurope.org';
const TOKEN = 'test-token';
const cert = makeCert();
let server: Awaited<ReturnType<typeof startFakeSmtp>>;
let plain: Awaited<ReturnType<typeof startFakeSmtp>>;

beforeAll(async () => {
  server = await startFakeSmtp({ user: USER, token: TOKEN, ...cert });
  plain = await startFakeSmtp({ user: USER, token: TOKEN, ...cert, noSTARTTLS: true });
});
afterAll(async () => {
  await server.close();
  await plain.close();
});

const cfg = (port: number, extra: Partial<MailConfig> = {}): MailConfig => ({
  host: 'localhost',
  port,
  user: USER,
  token: TOKEN,
  from: USER,
  to: 'inbox@opensourceeurope.org',
  ca: cert.cert,
  ...extra,
});

describe('sending through a local SMTP server', () => {
  it('delivers over STARTTLS with the expected headers and an escaped body', async () => {
    const msg = buildEmail({
      name: 'Ada <b>Lovelace</b>',
      email: 'ada@example.org',
      interest: 'Becoming a partner',
      message: '<script>alert(1)</script>',
    });
    expect(await sendEmail(msg, cfg(server.port))).toBe('sent');

    const got = server.received.at(-1)!;
    expect(got.user).toBe(USER);
    expect(got.from).toBe(USER);
    expect(got.to).toEqual(['inbox@opensourceeurope.org']);
    const h = headersOf(got.raw);
    expect(h.from).toEqual([`Open Source Europe website <${USER}>`]);
    expect(h.to).toEqual(['inbox@opensourceeurope.org']);
    expect(h['reply-to']).toEqual(['ada@example.org']);
    expect(h.subject).toEqual(['Website contact: Becoming a partner - Ada <b>Lovelace</b>']);
    expect(h.cc).toBeUndefined();
    expect(h.bcc).toBeUndefined();
    const html = htmlPartOf(got.raw);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Ada &lt;b&gt;Lovelace&lt;/b&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
  });

  it('keeps CR/LF in the name and email out of the headers', async () => {
    const before = server.received.length;
    const msg = buildEmail({
      name: 'Eve\r\nBcc: victim@example.org',
      email: 'eve@example.org',
      interest: 'Other',
      interestOther: 'x',
      message: 'hi',
    });
    await sendEmail({ ...msg, replyTo: 'eve@example.org\r\nCc: victim@example.org' }, cfg(server.port));
    const got = server.received[before];
    expect(got.to).toEqual(['inbox@opensourceeurope.org']);
    const h = headersOf(got.raw);
    expect(h.bcc).toBeUndefined();
    expect(h.cc).toBeUndefined();
    expect(h.subject).toHaveLength(1);
    expect(h['reply-to']).toHaveLength(1);
    expect(got.raw.split('\r\n\r\n')[0]).not.toMatch(/^(Bcc|Cc):/im);
  });

  it('rejects a certificate it does not trust', async () => {
    const before = server.received.length;
    await expect(sendEmail(buildEmailFor(), cfg(server.port, { ca: undefined }))).rejects.toThrow();
    expect(server.received.length).toBe(before);
  });

  it('refuses to send when the server offers no STARTTLS', async () => {
    await expect(sendEmail(buildEmailFor(), cfg(plain.port))).rejects.toThrow();
    expect(plain.received).toHaveLength(0);
  });

  it('rejects a wrong token', async () => {
    await expect(sendEmail(buildEmailFor(), cfg(server.port, { token: 'wrong' }))).rejects.toThrow();
  });
});

function buildEmailFor() {
  return buildEmail({ name: 'Ada', email: 'ada@example.org', interest: 'Becoming a partner', message: 'Hi' });
}
