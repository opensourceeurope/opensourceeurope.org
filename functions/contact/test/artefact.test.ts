import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { unzipSync } from 'fflate';
import { beforeAll, expect, it } from 'vitest';
import { headersOf, makeCert, startFakeSmtp } from './fake-smtp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const zip = join(root, 'contact.zip');

function newestSource(dir: string): number {
  let newest = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    newest = Math.max(newest, e.isDirectory() ? newestSource(p) : statSync(p).mtimeMs);
  }
  return newest;
}

// Builds when the zip is missing or older than the sources, so a clean checkout passes.
beforeAll(() => {
  const stale = !existsSync(zip) || statSync(zip).mtimeMs < Math.max(newestSource(join(root, 'src')), statSync(join(root, 'build.mjs')).mtimeMs);
  if (stale) execFileSync('node', [join(root, 'build.mjs')], { stdio: 'inherit' });
}, 60_000);

function unpack(): string {
  const out = mkdtempSync(join(tmpdir(), 'contact-zip-'));
  const files = unzipSync(new Uint8Array(readFileSync(zip)));
  expect(Object.keys(files).sort()).toEqual(['handler.js', 'package.json']);
  for (const [name, data] of Object.entries(files)) {
    mkdirSync(dirname(join(out, name)), { recursive: true });
    writeFileSync(join(out, name), data);
  }
  return out;
}

it('ships a self-contained handler in contact.zip', async () => {
  const out = unpack();
  const code = readFileSync(join(out, 'handler.js'), 'utf8');
  expect(code).not.toMatch(/from ['"](?!node:)[^'"]+['"]/);
  const mod = await import(pathToFileURL(join(out, 'handler.js')).href);
  expect(typeof mod.handle).toBe('function');
});

// Runs the unpacked handler in a separate Node process, as Scaleway would, and
// lets it send through a local SMTP server. The process trusts the test
// certificate through NODE_EXTRA_CA_CERTS, so the handler needs no test hook.
it('sends a message from the zip through SMTP with STARTTLS', async () => {
  const out = unpack();
  const cert = makeCert();
  const user = 'home@opensourceeurope.org';
  const server = await startFakeSmtp({ user, token: 'zip-token', ...cert });
  try {
    const script = `
      const { handle } = await import(${JSON.stringify(pathToFileURL(join(out, 'handler.js')).href)});
      const r = await handle({
        httpMethod: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://opensourceeurope.org' },
        body: JSON.stringify({ name: 'Zip Test', email: 'zip@example.org', interest: 'Becoming a partner', message: '<i>hi</i>' }),
      });
      process.stdout.write(JSON.stringify(r));
    `;
    const env = { PATH: process.env.PATH ?? '', NODE_EXTRA_CA_CERTS: cert.certFile, ALLOWED_ORIGINS: 'https://opensourceeurope.org', SITE_URL: 'https://opensourceeurope.org', SMTP_HOST: 'localhost', SMTP_PORT: String(server.port), SMTP_USER: user, SMTP_TOKEN: 'zip-token', MAIL_TO: 'inbox@opensourceeurope.org' };
    const stdout = await new Promise<string>((resolve, reject) =>
      execFile(process.execPath, ['--input-type=module', '-e', script], { cwd: out, env, timeout: 30_000 }, (err, so, se) =>
        err ? reject(new Error(`${err.message}\n${se}`)) : resolve(so),
      ),
    );
    expect(JSON.parse(stdout)).toMatchObject({ statusCode: 200, body: '{"ok":true}' });
    expect(server.received).toHaveLength(1);
    const got = server.received[0];
    expect(got.user).toBe(user);
    expect(got.to).toEqual(['inbox@opensourceeurope.org']);
    const h = headersOf(got.raw);
    expect(h.from).toEqual([`Open Source Europe website <${user}>`]);
    expect(h['reply-to']).toEqual(['zip@example.org']);
    expect(h.subject).toEqual(['Website contact: Becoming a partner - Zip Test']);
    expect(h.cc).toBeUndefined();
  } finally {
    await server.close();
  }
}, 60_000);
