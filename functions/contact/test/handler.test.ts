import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/send', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/send')>()),
  sendEmail: vi.fn(async () => 'sent'),
}));
import { MailConfigError, sendEmail } from '../src/send';
import { createHandler, handle } from '../src/handler';

const SITE = 'https://opensourceeurope.org';
const valid = {
  name: 'Ada',
  email: 'ada@example.org',
  interest: 'Founding a project',
  message: 'Hello',
};
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const post = (body: string, headers: Record<string, string>, extra: object = {}) =>
  handle({ httpMethod: 'POST', headers, body, ...extra }, {});
const json = { 'Content-Type': 'application/json', Origin: SITE };
const urlenc = { 'content-type': 'application/x-www-form-urlencoded', origin: SITE };

beforeEach(() => {
  vi.stubEnv('ALLOWED_ORIGINS', SITE);
  vi.stubEnv('SITE_URL', SITE);
  vi.stubEnv('MAIL_FROM', 'noreply@x.org');
  vi.stubEnv('MAIL_TO', 'to@x.org');
  vi.mocked(sendEmail).mockReset();
  vi.mocked(sendEmail).mockResolvedValue('sent');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe('handle', () => {
  it('answers OPTIONS with 204 and CORS headers', async () => {
    const r = await handle({ httpMethod: 'OPTIONS', headers: { Origin: SITE }, body: '' }, {});
    expect(r.statusCode).toBe(204);
    expect(r.headers['Access-Control-Allow-Origin']).toBe(SITE);
    expect(r.headers['Access-Control-Allow-Methods']).toBe('POST');
    expect(r.headers['Access-Control-Allow-Headers']).toBe('content-type');
  });
  it('rejects other methods with 405', async () => {
    expect((await handle({ httpMethod: 'GET', headers: {}, body: '' }, {})).statusCode).toBe(405);
  });
  it('rejects a foreign Origin with 403', async () => {
    const r = await post(JSON.stringify(valid), { ...json, Origin: 'https://evil.com' });
    expect(r.statusCode).toBe(403);
    expect(r.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
  it('rejects a lookalike Referer when Origin is missing', async () => {
    const r = await post(form(valid), {
      'content-type': 'application/x-www-form-urlencoded',
      referer: 'https://opensourceeurope.org.evil.com/contact/',
    });
    expect(r.statusCode).toBe(403);
  });
  it('accepts the real Referer when Origin is missing', async () => {
    const r = await post(form(valid), {
      'content-type': 'application/x-www-form-urlencoded',
      referer: `${SITE}/contact/`,
    });
    expect(r.statusCode).toBe(303);
  });
  it('rejects a JSON post without Origin', async () => {
    const r = await post(JSON.stringify(valid), {
      'content-type': 'application/json',
      referer: `${SITE}/contact/`,
    });
    expect(r.statusCode).toBe(403);
  });
  it('rejects a JSON body over 256 KB with 413', async () => {
    const r = await post(JSON.stringify({ ...valid, message: 'a'.repeat(300_000) }), json);
    expect(r.statusCode).toBe(413);
  });
  it('redirects a urlencoded body over 256 KB to #form-invalid', async () => {
    const r = await post(form({ ...valid, message: 'a'.repeat(300_000) }), urlenc);
    expect(r.statusCode).toBe(303);
    expect(r.headers.Location).toBe(`${SITE}/contact/#form-invalid`);
  });
  it('accepts a urlencoded message of 10 000 four-byte characters', async () => {
    const r = await post(form({ ...valid, message: '😀'.repeat(5_000) }), urlenc);
    expect(r.statusCode).toBe(303);
    expect(r.headers.Location).toBe(`${SITE}/contact/#form-sent`);
  });
  it('accepts a base64 JSON body', async () => {
    const body = Buffer.from(JSON.stringify(valid)).toString('base64');
    const r = await post(body, { 'Content-Type': 'application/json', origin: SITE }, { isBase64Encoded: true });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ ok: true });
    expect(r.headers['Access-Control-Allow-Origin']).toBe(SITE);
    expect(r.headers.Vary).toBe('Origin');
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
  it('answers 422 with field-named errors', async () => {
    const r = await post(JSON.stringify({ ...valid, interest: 'Other', email: 'x' }), json);
    expect(r.statusCode).toBe(422);
    const b = JSON.parse(r.body);
    expect(b.ok).toBe(false);
    expect(Object.keys(b.errors).sort()).toEqual(['email', 'interest_other']);
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('redirects a valid urlencoded post to #form-sent', async () => {
    const r = await post(form(valid), urlenc);
    expect(r.statusCode).toBe(303);
    expect(r.headers.Location).toBe(`${SITE}/contact/#form-sent`);
  });
  it('redirects an invalid urlencoded post to #form-invalid', async () => {
    const r = await post(form({ ...valid, email: 'x' }), urlenc);
    expect(r.headers.Location).toBe(`${SITE}/contact/#form-invalid`);
  });
  it('answers spam with the success response and sends nothing', async () => {
    const f = await post(form({ ...valid, website: 'http://spam' }), urlenc);
    expect(f.statusCode).toBe(303);
    expect(f.headers.Location).toBe(`${SITE}/contact/#form-sent`);
    const j = await post(JSON.stringify({ ...valid, website: 'x' }), json);
    expect(JSON.parse(j.body)).toEqual({ ok: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('ignores MIN_DELAY_MS in the deployed handler', async () => {
    vi.stubEnv('MIN_DELAY_MS', '0');
    const r = await post(JSON.stringify({ ...valid, ts: String(Date.now()) }), json);
    expect(r.statusCode).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('lets createHandler set the delay explicitly', async () => {
    const h = createHandler({ minDelayMs: 0 });
    const r = await h({ httpMethod: 'POST', headers: json, body: JSON.stringify({ ...valid, ts: String(Date.now()) }) }, {});
    expect(r.statusCode).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
  it('answers 502 when no token and no outbox are configured', async () => {
    vi.mocked(sendEmail).mockRejectedValue(new MailConfigError('no token'));
    expect((await post(JSON.stringify(valid), json)).statusCode).toBe(502);
    expect(console.error).toHaveBeenCalledWith('contact: config error', 'no token');
  });
  it('passes the SMTP settings from the environment, with the visitor as Reply-To', async () => {
    vi.stubEnv('SMTP_USER', 'home@x.org');
    vi.stubEnv('SMTP_TOKEN', 'tok');
    vi.stubEnv('MAIL_FROM', '');
    await post(JSON.stringify(valid), json);
    const [msg, cfg] = vi.mocked(sendEmail).mock.calls[0];
    expect(msg.replyTo).toBe('ada@example.org');
    expect(cfg).toMatchObject({ host: 'smtp.protonmail.ch', port: 587, user: 'home@x.org', token: 'tok', from: 'home@x.org', to: 'to@x.org' });
  });
  it('treats a too-fast post as spam', async () => {
    const r = await post(JSON.stringify({ ...valid, ts: String(Date.now()) }), json);
    expect(r.statusCode).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it('answers 502 when the send misses its deadline', async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error('SMTP send took longer than the deadline'));
    expect((await post(JSON.stringify(valid), json)).statusCode).toBe(502);
  });
  it('answers 502 when sending fails', async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error('boom'));
    const r = await post(JSON.stringify(valid), json);
    expect(r.statusCode).toBe(502);
    expect(JSON.parse(r.body)).toEqual({ ok: false, error: 'server' });
    const f = await post(form(valid), urlenc);
    expect(f.headers.Location).toBe(`${SITE}/contact/#form-error`);
  });
});
