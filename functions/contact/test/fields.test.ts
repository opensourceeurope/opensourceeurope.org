import { describe, expect, it } from 'vitest';
import { parseBody, validate } from '../src/fields';

const now = 1_000_000;
const good = {
  name: 'Ada',
  email: 'ada@example.org',
  interest: 'Founding a project',
  message: 'Hello',
};

describe('parseBody', () => {
  it('reads JSON and urlencoded bodies', () => {
    expect(parseBody('{"a":"1"}', 'application/json; charset=utf-8')).toEqual({ a: '1' });
    expect(parseBody('a=1&b=x%20y', 'application/x-www-form-urlencoded')).toEqual({ a: '1', b: 'x y' });
  });
  it('returns no fields for broken or unknown bodies', () => {
    expect(parseBody('{', 'application/json')).toEqual({});
    expect(parseBody('[1]', 'application/json')).toEqual({});
    expect(parseBody('a=1', 'text/plain')).toEqual({});
  });
});

describe('validate', () => {
  it('accepts a good submission', () => {
    expect(validate(good, now)).toEqual({ kind: 'ok', data: good });
  });
  it('flags the honeypot', () => {
    expect(validate({ ...good, website: 'x' }, now)).toEqual({ kind: 'spam', reason: 'honeypot' });
  });
  it('flags a fast submission and passes a slow one', () => {
    expect(validate({ ...good, ts: String(now - 1000) }, now)).toEqual({ kind: 'spam', reason: 'too-fast' });
    expect(validate({ ...good, ts: String(now - 5000) }, now).kind).toBe('ok');
  });
  it('ignores a missing or non-numeric ts', () => {
    expect(validate(good, now).kind).toBe('ok');
    expect(validate({ ...good, ts: 'abc' }, now).kind).toBe('ok');
  });
  it('ignores a ts in the future (client clock ahead)', () => {
    expect(validate({ ...good, ts: String(now + 500) }, now).kind).toBe('ok');
    expect(validate({ ...good, ts: String(now + 60_000) }, now).kind).toBe('ok');
  });
  it('flags ts equal to now as too fast', () => {
    expect(validate({ ...good, ts: String(now) }, now)).toEqual({ kind: 'spam', reason: 'too-fast' });
  });
  it('requires the main fields', () => {
    const r = validate({}, now);
    expect(r.kind).toBe('invalid');
    if (r.kind === 'invalid') {
      expect(Object.keys(r.errors).sort()).toEqual(['email', 'interest', 'message', 'name']);
    }
  });
  it('rejects a missing interest', () => {
    const { interest: _i, ...rest } = good;
    const r = validate(rest, now);
    expect(r.kind === 'invalid' && r.errors.interest).toBeTruthy();
  });
  it('rejects a bad email and an unknown interest', () => {
    const r = validate({ ...good, email: 'nope', interest: 'Spam me' }, now);
    expect(r.kind === 'invalid' && r.errors.email && r.errors.interest).toBeTruthy();
  });
  it('rejects an email that could add a header or a second address', () => {
    for (const email of [
      'a@x.org\r\nBcc: v@x.org',
      'a@x.org\nCc: v@x.org',
      'a,b@x.org',
      'a;b@x.org',
      'A <a@x.org>',
      '"a"@x.org',
      'a\u0000b@x.org',
      '=?utf-8?b?ZXZl?=@x.org',
      'a@x.org=?utf-8?q?x?=',
    ]) {
      const r = validate({ ...good, email }, now);
      expect(r.kind === 'invalid' && r.errors.email, JSON.stringify(email)).toBeTruthy();
    }
    expect(validate({ ...good, email: 'first.last+tag@sub.example.co' }, now).kind).toBe('ok');
  });
  it('needs interest_other when interest is Other', () => {
    const r = validate({ ...good, interest: 'Other' }, now);
    expect(r.kind === 'invalid' && r.errors.interestOther).toBeTruthy();
    const ok = validate({ ...good, interest: 'Other', interest_other: 'Hosting' }, now);
    expect(ok.kind === 'ok' && ok.data.interestOther).toBe('Hosting');
  });
  it('rejects a link that is not http(s)', () => {
    for (const link of ['javascript:alert(1)', 'ftp://x.org/a', '/relative', 'data:text/html,x']) {
      const r = validate({ ...good, link }, now);
      expect(r.kind === 'invalid' && r.errors.link, link).toBeTruthy();
    }
    expect(validate({ ...good, link: 'https://x.org/f' }, now).kind).toBe('ok');
  });
  it('enforces length caps', () => {
    for (const [k, n] of [['name', 201], ['message', 10_001]] as const) {
      const r = validate({ ...good, [k]: 'a'.repeat(n) }, now);
      expect(r.kind === 'invalid' && r.errors[k], k).toBeTruthy();
    }
    const email = 'a'.repeat(250) + '@b.co';
    expect(validate({ ...good, email }, now).kind).toBe('invalid');
    expect(validate({ ...good, link: 'https://x.org/' + 'a'.repeat(2000) }, now).kind).toBe('invalid');
  });
});
