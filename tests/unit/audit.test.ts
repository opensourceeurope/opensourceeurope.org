import { describe, expect, it } from 'vitest';
import { advisories, check } from '../../scripts/check-audit.mjs';

const advisory = (name: string, ghsa: string, severity = 'high') => ({
  source: 1,
  name,
  title: `${name} issue`,
  url: `https://github.com/advisories/${ghsa}`,
  severity,
});

const report = {
  vulnerabilities: {
    picomatch: { via: [advisory('picomatch', 'GHSA-aaaa-bbbb-cccc')] },
    vite: { via: ['picomatch', advisory('vite', 'GHSA-dddd-eeee-ffff', 'moderate')] },
    tinyglobby: { via: ['picomatch'] },
  },
};

describe('advisories', () => {
  it('lists each advisory once and skips the package-name entries', () => {
    expect(advisories(report).map((a) => a.id)).toEqual(['GHSA-aaaa-bbbb-cccc', 'GHSA-dddd-eeee-ffff']);
  });
});

describe('check', () => {
  const found = advisories(report);
  const exception = { advisory: 'GHSA-aaaa-bbbb-cccc', reason: 'x', until: '2027-01-15' };

  it('fails a high advisory with no exception and ignores a moderate one', () => {
    const { failures, excepted } = check(found, [], '2026-11-18');
    expect(failures.map((a) => a.id)).toEqual(['GHSA-aaaa-bbbb-cccc']);
    expect(excepted).toEqual([]);
  });
  it('passes an advisory with an exception through its until date', () => {
    expect(check(found, [exception], '2027-01-15').failures).toEqual([]);
  });
  it('fails again the day after the until date', () => {
    const { failures } = check(found, [exception], '2027-01-16');
    expect(failures).toMatchObject([{ id: 'GHSA-aaaa-bbbb-cccc', expired: '2027-01-15' }]);
  });
});
