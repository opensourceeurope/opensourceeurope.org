import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { makeCert, startFakeSmtp } from './fake-smtp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

async function freePort(): Promise<number> {
  const srv = createServer();
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address() as { port: number };
  await new Promise<void>((r) => srv.close(() => r()));
  return port;
}

// A developer may export real SMTP credentials in their shell. The dev server
// must still write to the outbox and never connect to the SMTP server.
it('the dev server ignores exported SMTP credentials', async () => {
  const cert = makeCert();
  const user = 'home@opensourceeurope.org';
  const smtp = await startFakeSmtp({ user, token: 'real-token', ...cert });
  const port = await freePort();
  const outbox = join(mkdtempSync(join(tmpdir(), 'dev-outbox-')), 'out.jsonl');
  const child = spawn(process.execPath, [join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'functions/contact/src/dev.ts'], {
    cwd: root,
    env: {
      PATH: process.env.PATH ?? '',
      PORT: String(port),
      MIN_DELAY_MS: '0',
      OUTBOX_FILE: outbox,
      NODE_EXTRA_CA_CERTS: cert.certFile,
      SMTP_HOST: 'localhost',
      SMTP_PORT: String(smtp.port),
      SMTP_USER: user,
      SMTP_TOKEN: 'real-token',
      MAIL_FROM: user,
      MAIL_TO: 'inbox@opensourceeurope.org',
    },
    stdio: 'ignore',
  });
  try {
    let res: Response | undefined;
    for (let i = 0; i < 100 && !res; i++) {
      try {
        res = await fetch(`http://127.0.0.1:${port}/`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: 'http://localhost:4321' },
          body: JSON.stringify({ name: 'Dev Guard', email: 'dev@example.org', interest: 'Becoming a partner', message: 'hi' }),
        });
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    expect(res?.status).toBe(200);
    expect(readFileSync(outbox, 'utf8')).toContain('Dev Guard');
    expect(smtp.received).toHaveLength(0);
  } finally {
    child.kill();
    await smtp.close();
  }
}, 60_000);
