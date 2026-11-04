import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SMTPServer } from 'smtp-server';

export type Received = { from: string; to: string[]; raw: string; user?: string };

/** A self-signed certificate for localhost, made fresh for each test run. */
export function makeCert(): { key: string; cert: string; certFile: string } {
  const dir = mkdtempSync(join(tmpdir(), 'smtp-cert-'));
  const keyFile = join(dir, 'key.pem');
  const certFile = join(dir, 'cert.pem');
  execFileSync(
    'openssl',
    [
      'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes',
      '-keyout', keyFile, '-out', certFile, '-days', '1', '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=DNS:localhost',
    ],
    { stdio: 'ignore' },
  );
  return { key: readFileSync(keyFile, 'utf8'), cert: readFileSync(certFile, 'utf8'), certFile };
}

/**
 * An in-process SMTP server on localhost that offers STARTTLS, accepts one
 * user and token, and keeps every message it receives.
 */
export async function startFakeSmtp(
  opts: { user: string; token: string; key: string; cert: string; noSTARTTLS?: boolean },
): Promise<{ port: number; received: Received[]; close: () => Promise<void> }> {
  const received: Received[] = [];
  const server = new SMTPServer({
    key: opts.key,
    cert: opts.cert,
    disabledCommands: opts.noSTARTTLS ? ['STARTTLS'] : [],
    allowInsecureAuth: opts.noSTARTTLS ?? false,
    authMethods: ['PLAIN', 'LOGIN'],
    logger: false,
    onAuth(auth, _session, cb) {
      if (auth.username === opts.user && auth.password === opts.token) cb(null, { user: auth.username });
      else cb(new Error('Invalid username or password'));
    },
    onData(stream, session, cb) {
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => {
        received.push({
          from: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
          to: session.envelope.rcptTo.map((r) => r.address),
          raw: Buffer.concat(chunks).toString('utf8'),
          user: session.user as string | undefined,
        });
        cb();
      });
    },
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.server.address() as AddressInfo;
  return {
    port,
    received,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** The unfolded value of each header in a raw message, keyed by lower-case name. */
export function headersOf(raw: string): Record<string, string[]> {
  const head = raw.split(/\r\n\r\n/)[0].replace(/\r\n[ \t]+/g, ' ');
  const out: Record<string, string[]> = {};
  for (const line of head.split('\r\n')) {
    const i = line.indexOf(':');
    if (i < 1) continue;
    const name = line.slice(0, i).toLowerCase();
    (out[name] ??= []).push(line.slice(i + 1).trim());
  }
  return out;
}

/** The decoded text/html part of a raw message. */
export function htmlPartOf(raw: string): string {
  const m = raw.match(/Content-Type: text\/html[^\r\n]*\r\nContent-Transfer-Encoding: ([^\r\n]+)\r\n\r\n([\s\S]*?)\r\n--/);
  if (!m) throw new Error('no text/html part');
  const [, encoding, body] = m;
  if (encoding === 'quoted-printable') {
    return Buffer.from(
      body.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))),
      'latin1',
    ).toString('utf8');
  }
  if (encoding === 'base64') return Buffer.from(body, 'base64').toString('utf8');
  return body;
}
