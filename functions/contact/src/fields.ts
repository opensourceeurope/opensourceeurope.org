export const INTEREST_OPTIONS = [
  'Founding a project',
  'Getting information on a project',
  'Becoming a partner',
  'Publish a project',
  'Other',
] as const;

export type Submission = {
  name: string;
  email: string;
  interest: string;
  interestOther?: string;
  message: string;
  link?: string;
};

export type ValidationResult =
  | { kind: 'ok'; data: Submission }
  | { kind: 'spam'; reason: 'honeypot' | 'too-fast' }
  | { kind: 'invalid'; errors: Partial<Record<keyof Submission, string>> };

/** Maximum length of each field, in UTF-16 code units. The form's maxlength attributes use it too. */
export const MAX = { name: 200, email: 254, interestOther: 200, message: 10_000, link: 2_000 };

/** Reads a JSON or urlencoded body into string values. Anything else yields no fields. */
export function parseBody(body: string, contentType: string): Record<string, string> {
  const type = contentType.split(';')[0].trim().toLowerCase();
  const out: Record<string, string> = {};
  if (type === 'application/json') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return out;
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') out[k] = v;
        else if (typeof v === 'number') out[k] = String(v);
      }
    }
    return out;
  }
  if (type === 'application/x-www-form-urlencoded') {
    for (const [k, v] of new URLSearchParams(body)) out[k] = v;
  }
  return out;
}

// One address, with no whitespace, control characters or the characters that
// separate or quote addresses in a mail header, and no "=?" that could start
// an encoded word. The address goes into Reply-To.
const ATOM = '[^\\s@<>()[\\]\\\\,;:"\\u0000-\\u001f\\u007f]+';
const EMAIL = new RegExp(`^${ATOM}@${ATOM}\\.${ATOM}$`);

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Checks spam signals first, then the fields. `ts` is the client's page-load
 * time, so a value ahead of the server clock (client clock skew) is ignored
 * like a missing one rather than counted as a fast post.
 */
export function validate(
  fields: Record<string, string>,
  now: number,
  minDelayMs = 3000,
): ValidationResult {
  if ((fields.website ?? '').trim() !== '') return { kind: 'spam', reason: 'honeypot' };

  const ts = fields.ts !== undefined && fields.ts.trim() !== '' ? Number(fields.ts) : NaN;
  if (Number.isFinite(ts) && now - ts >= 0 && now - ts < minDelayMs) {
    return { kind: 'spam', reason: 'too-fast' };
  }

  const name = (fields.name ?? '').trim();
  const email = (fields.email ?? '').trim();
  const interest = (fields.interest ?? '').trim();
  const interestOther = (fields.interest_other ?? '').trim();
  const message = (fields.message ?? '').trim();
  const link = (fields.link ?? '').trim();

  const errors: Partial<Record<keyof Submission, string>> = {};
  if (!name) errors.name = 'Enter your full name.';
  else if (name.length > MAX.name) errors.name = 'Use 200 characters or fewer.';

  if (!email) errors.email = 'Enter your email address.';
  else if (email.length > MAX.email) errors.email = 'Use 254 characters or fewer.';
  else if (!EMAIL.test(email) || email.includes('=?')) errors.email = 'Enter a valid email address.';

  if (!interest) errors.interest = 'Choose what you are interested in.';
  else if (!(INTEREST_OPTIONS as readonly string[]).includes(interest)) {
    errors.interest = 'Choose one of the listed options.';
  } else if (interest === 'Other') {
    if (!interestOther) errors.interestOther = 'Tell us what you are interested in.';
    else if (interestOther.length > MAX.interestOther) {
      errors.interestOther = 'Use 200 characters or fewer.';
    }
  }

  if (!message) errors.message = 'Enter your message.';
  else if (message.length > MAX.message) errors.message = 'Use 10,000 characters or fewer.';

  if (link) {
    if (link.length > MAX.link) errors.link = 'Use 2,000 characters or fewer.';
    else if (!isHttpUrl(link)) errors.link = 'Enter a full link starting with http:// or https://.';
  }

  if (Object.keys(errors).length > 0) return { kind: 'invalid', errors };

  const data: Submission = { name, email, interest, message };
  if (interest === 'Other') data.interestOther = interestOther;
  if (link) data.link = link;
  return { kind: 'ok', data };
}
