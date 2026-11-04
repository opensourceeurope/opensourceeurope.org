import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { MailConfigError, mailConfigFromEnv, sendEmail, type MailConfig } from '../src/send';

const msg = { subject: 's', text: 't', html: 'h', replyTo: 'visitor@example.org' };
const smtp: MailConfig = {
  host: 'smtp.protonmail.ch',
  port: 587,
  user: 'home@x.org',
  token: 'tok',
  from: 'home@x.org',
  to: 'inbox@x.org',
};

function fakeTransport(sendMail = vi.fn(async (_mail: Record<string, unknown>): Promise<unknown> => ({}))) {
  const close = vi.fn();
  const create = vi.fn(() => ({ sendMail, close }));
  return { create, sendMail, close };
}

describe('sendEmail without a token', () => {
  it('logs to the outbox and never opens a connection', async () => {
    const outbox = join(mkdtempSync(join(tmpdir(), 'outbox-')), 'sub', 'out.jsonl');
    const t = fakeTransport();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = await sendEmail(msg, { host: 'h', port: 587, from: 'a@x.org', to: 'b@x.org', outbox }, t.create);
    expect(r).toBe('logged');
    expect(t.create).not.toHaveBeenCalled();
    const lines = readFileSync(outbox, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ subject: 's', replyTo: 'visitor@example.org' });
  });

  it('rejects without an outbox, instead of dropping the message', async () => {
    const t = fakeTransport();
    await expect(sendEmail(msg, { host: 'h', port: 587, from: 'a@x.org', to: 'b@x.org' }, t.create)).rejects.toThrow(
      MailConfigError,
    );
    expect(t.create).not.toHaveBeenCalled();
  });

  it('keeps personal data out of the fallback log line', async () => {
    const outbox = join(mkdtempSync(join(tmpdir(), 'outbox-')), 'out.jsonl');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await sendEmail({ ...msg, subject: 'Website contact: Other - Secret Name' }, { host: 'h', port: 587, from: 'a', to: 'b', outbox });
    expect(JSON.stringify(log.mock.calls)).not.toContain('Secret Name');
  });
});

describe('sendEmail with a token', () => {
  it('sends one message as SMTP_USER, to MAIL_TO, with the visitor in Reply-To and no CC', async () => {
    const t = fakeTransport();
    expect(await sendEmail(msg, smtp, t.create)).toBe('sent');
    expect(t.sendMail).toHaveBeenCalledTimes(1);
    const mail = t.sendMail.mock.calls[0][0];
    expect(mail.from).toEqual({ name: 'Open Source Europe website', address: 'home@x.org' });
    expect(mail.to).toBe('inbox@x.org');
    expect(mail.replyTo).toBe('visitor@example.org');
    expect(mail.subject).toBe('s');
    expect(mail.cc).toBeUndefined();
    expect(mail.bcc).toBeUndefined();
    expect(t.close).toHaveBeenCalledTimes(1);
  });

  it('requires TLS, verifies certificates, uses short timeouts and no pool', async () => {
    const t = fakeTransport();
    await sendEmail(msg, smtp, t.create);
    const opts = (t.create.mock.calls[0] as unknown[])[0] as Record<string, any>;
    expect(opts).toMatchObject({
      host: 'smtp.protonmail.ch',
      port: 587,
      secure: false,
      requireTLS: true,
      pool: false,
      auth: { user: 'home@x.org', pass: 'tok' },
      connectionTimeout: 10_000,
      socketTimeout: 15_000,
    });
    expect(opts.tls.rejectUnauthorized).toBe(true);
    expect(opts.tls.minVersion).toBe('TLSv1.2');
    expect(opts.ignoreTLS).toBeUndefined();
  });

  it('uses implicit TLS on port 465', async () => {
    const t = fakeTransport();
    await sendEmail(msg, { ...smtp, port: 465 }, t.create);
    expect(((t.create.mock.calls[0] as unknown[])[0] as Record<string, unknown>).secure).toBe(true);
  });

  it('closes the connection and rejects when the server refuses the message', async () => {
    const t = fakeTransport(vi.fn(async (_mail: Record<string, unknown>): Promise<unknown> => Promise.reject(new Error('550 no'))));
    await expect(sendEmail(msg, smtp, t.create)).rejects.toThrow('550 no');
    expect(t.close).toHaveBeenCalledTimes(1);
  });

  it('gives up at the deadline, closes the connection and rejects', async () => {
    const t = fakeTransport(vi.fn((_mail: Record<string, unknown>): Promise<unknown> => new Promise(() => {})));
    await expect(sendEmail(msg, { ...smtp, deadlineMs: 50 }, t.create)).rejects.toThrow('deadline');
    expect(t.close).toHaveBeenCalledTimes(1);
  });

  it('refuses to send as an address other than SMTP_USER', async () => {
    const t = fakeTransport();
    await expect(sendEmail(msg, { ...smtp, from: 'someone@else.org' }, t.create)).rejects.toThrow(MailConfigError);
    expect(t.create).not.toHaveBeenCalled();
  });

  it('refuses without SMTP_USER or MAIL_TO, or with a bad port', async () => {
    const t = fakeTransport();
    await expect(sendEmail(msg, { ...smtp, user: undefined }, t.create)).rejects.toThrow(MailConfigError);
    await expect(sendEmail(msg, { ...smtp, to: '' }, t.create)).rejects.toThrow(MailConfigError);
    await expect(sendEmail(msg, { ...smtp, port: Number('x') }, t.create)).rejects.toThrow(MailConfigError);
    expect(t.create).not.toHaveBeenCalled();
  });
});

describe('mailConfigFromEnv', () => {
  it('defaults to Proton on port 587', () => {
    const c = mailConfigFromEnv({ SMTP_USER: 'home@x.org', SMTP_TOKEN: 't', MAIL_TO: 'in@x.org' });
    expect(c).toMatchObject({ host: 'smtp.protonmail.ch', port: 587, user: 'home@x.org', token: 't', to: 'in@x.org' });
  });
  it('uses SMTP_USER as the sender when MAIL_FROM is empty', () => {
    expect(mailConfigFromEnv({ SMTP_USER: 'home@x.org', MAIL_FROM: '' }).from).toBe('home@x.org');
  });
  it('reads the host, port and outbox', () => {
    const c = mailConfigFromEnv({ SMTP_HOST: 'mail.local', SMTP_PORT: '2525', OUTBOX_FILE: 'o.jsonl' });
    expect(c).toMatchObject({ host: 'mail.local', port: 2525, outbox: 'o.jsonl', token: undefined });
  });
});
