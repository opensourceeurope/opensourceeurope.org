import { parseBody, validate } from './fields';
import { buildEmail } from './email';
import { MailConfigError, mailConfigFromEnv, sendEmail } from './send';

type Event = {
  httpMethod: string;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded?: boolean;
};
type Result = { statusCode: number; headers: Record<string, string>; body: string };

// Validation keys are the Submission names; the form posts snake_case.
const FORM_NAME: Record<string, string> = { interestOther: 'interest_other' };

function sameOrigin(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

type Options = { minDelayMs: number };

/** The deployed handler uses the 3000 ms minimum; only dev and tests choose another. */
export function createHandler({ minDelayMs }: Options) {
  return (event: Event, _context?: unknown) => run(event, minDelayMs);
}

export const handle = createHandler({ minDelayMs: 3000 });

async function run(event: Event, minDelayMs: number): Promise<Result> {
  const env = process.env;
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(event.headers ?? {})) headers[k.toLowerCase()] = String(v);

  const plain = (statusCode: number, extra: Record<string, string> = {}): Result => ({
    statusCode,
    headers: extra,
    body: '',
  });

  if (event.httpMethod !== 'POST' && event.httpMethod !== 'OPTIONS') return plain(405);

  const allowedOrigins = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const siteUrl = (env.SITE_URL ?? '').replace(/\/$/, '');
  const origin = headers.origin;
  const contentType = headers['content-type'] ?? '';
  const isForm = contentType.toLowerCase().startsWith('application/x-www-form-urlencoded');

  let allowedOrigin: string | undefined;
  if (origin) {
    if (allowedOrigins.includes(origin)) allowedOrigin = origin;
  } else if (isForm && sameOrigin(headers.referer, siteUrl)) {
    allowedOrigin = new URL(siteUrl).origin;
  }

  const cors: Record<string, string> = allowedOrigin
    ? { 'Access-Control-Allow-Origin': allowedOrigin, Vary: 'Origin' }
    : {};

  if (event.httpMethod === 'OPTIONS') {
    if (!allowedOrigin) return plain(204);
    return plain(204, {
      ...cors,
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'content-type',
    });
  }

  const raw = event.body ?? '';
  const body = event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw;
  // Urlencoded non-ASCII text takes up to 12 bytes per character, so the cap
  // leaves room for every field at its maximum length.
  const tooLarge = Buffer.byteLength(body, 'utf8') > 262_144;
  if (tooLarge && !isForm) return plain(413, cors);
  if (!allowedOrigin) return plain(403);

  const json = (statusCode: number, payload: unknown): Result => ({
    statusCode,
    headers: { ...cors, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const redirect = (fragment: string): Result => ({
    statusCode: 303,
    headers: { ...cors, Location: `${siteUrl}/contact/#${fragment}` },
    body: '',
  });
  if (tooLarge) return redirect('form-invalid');
  const ok = () => (isForm ? redirect('form-sent') : json(200, { ok: true }));

  const result = validate(parseBody(body, contentType), Date.now(), minDelayMs);

  if (result.kind === 'spam') return ok();
  if (result.kind === 'invalid') {
    if (isForm) return redirect('form-invalid');
    const errors: Record<string, string> = {};
    for (const [k, v] of Object.entries(result.errors)) errors[FORM_NAME[k] ?? k] = v as string;
    return json(422, { ok: false, errors });
  }

  try {
    await sendEmail(buildEmail(result.data), mailConfigFromEnv(env));
  } catch (err) {
    const what = err instanceof MailConfigError ? 'config error' : 'sending failed';
    console.error(`contact: ${what}`, err instanceof Error ? err.message : err);
    return isForm ? redirect('form-error') : json(502, { ok: false, error: 'server' });
  }
  return ok();
}
