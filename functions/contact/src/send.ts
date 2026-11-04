import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import nodemailer from 'nodemailer';

export type MailConfig = {
  host: string;
  port: number;
  user?: string;
  token?: string;
  from: string;
  to: string;
  outbox?: string;
  /** Extra trusted CA certificates in PEM. Tests use it for a local server. Never set from the environment. */
  ca?: string;
  /** Time limit for one whole send, in milliseconds. Tests shorten it. Never set from the environment. */
  deadlineMs?: number;
};

export type Message = { subject: string; text: string; html: string; replyTo: string };

type Transport = { sendMail(mail: Record<string, unknown>): Promise<unknown>; close(): void };
export type CreateTransport = (options: Record<string, unknown>) => Transport;

/** A setting that can never send. The handler logs it and answers 502. */
export class MailConfigError extends Error {}

export const DEFAULT_SMTP_HOST = 'smtp.protonmail.ch';
export const DEFAULT_SMTP_PORT = 587;
/** The function's own limit is 5 minutes. A send that takes longer than this fails with 502. */
export const SEND_DEADLINE_MS = 30_000;

/**
 * Reads the mail settings from the function's environment. A Proton SMTP
 * token sends as its own address only, so MAIL_FROM falls back to SMTP_USER,
 * and a MAIL_FROM that names another address is a config error.
 */
export function mailConfigFromEnv(env: Record<string, string | undefined>): MailConfig {
  const portText = env.SMTP_PORT?.trim();
  const port = portText ? Number(portText) : DEFAULT_SMTP_PORT;
  const user = env.SMTP_USER?.trim() || undefined;
  return {
    host: env.SMTP_HOST?.trim() || DEFAULT_SMTP_HOST,
    port,
    user,
    token: env.SMTP_TOKEN || undefined,
    from: env.MAIL_FROM?.trim() || user || '',
    to: env.MAIL_TO?.trim() ?? '',
    outbox: env.OUTBOX_FILE || undefined,
  };
}

function checkFrom(cfg: MailConfig): void {
  if (cfg.user && cfg.from.toLowerCase() !== cfg.user.toLowerCase()) {
    throw new MailConfigError('MAIL_FROM differs from SMTP_USER. A Proton token sends as its own address only');
  }
}

function checkSmtpConfig(cfg: MailConfig): void {
  if (!cfg.user) throw new MailConfigError('SMTP_USER is not set');
  if (!cfg.to) throw new MailConfigError('MAIL_TO is not set');
  if (!Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65_535) {
    throw new MailConfigError('SMTP_PORT is not a valid port');
  }
}

/**
 * Sends through an SMTP relay (Proton Mail in production). Without a token the
 * message is appended to `cfg.outbox` as one JSON line instead (local dev and
 * end-to-end tests only). With neither token nor outbox it throws, so a
 * misconfigured deploy never reports success for a dropped message.
 */
export async function sendEmail(
  msg: Message,
  cfg: MailConfig,
  createTransport: CreateTransport = nodemailer.createTransport as unknown as CreateTransport,
): Promise<'sent' | 'logged'> {
  checkFrom(cfg);
  if (!cfg.token) {
    if (!cfg.outbox) throw new MailConfigError('SMTP_TOKEN is not set and no outbox is configured');
    await mkdir(dirname(cfg.outbox), { recursive: true });
    await appendFile(cfg.outbox, JSON.stringify({ to: cfg.to, from: cfg.from, ...msg }) + '\n');
    console.log('contact: message written to outbox');
    return 'logged';
  }
  checkSmtpConfig(cfg);

  // One connection per message: a serverless function keeps no pool. Port 465
  // is implicit TLS. Any other port must upgrade with STARTTLS, or the send
  // fails. Certificates are always verified, and the short timeouts keep a
  // stuck server from holding the function until its own time limit.
  const transport = createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    requireTLS: true,
    pool: false,
    auth: { user: cfg.user, pass: cfg.token },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    dnsTimeout: 10_000,
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      ...(cfg.ca ? { ca: cfg.ca } : {}),
    },
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('SMTP send took longer than the deadline')),
      cfg.deadlineMs ?? SEND_DEADLINE_MS,
    );
  });
  try {
    const sending = transport.sendMail({
      from: { name: 'Open Source Europe website', address: cfg.from },
      to: cfg.to,
      replyTo: msg.replyTo,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    // A late rejection after the deadline must not become an unhandled rejection.
    sending.catch(() => {});
    await Promise.race([sending, deadline]);
  } finally {
    clearTimeout(timer);
    transport.close();
  }
  return 'sent';
}
