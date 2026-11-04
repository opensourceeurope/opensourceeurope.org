import { describe, expect, it } from 'vitest';
import { check, collect, isAllowed } from '../../scripts/check-licences.mjs';

const allow = ['MIT', 'ISC', 'Zlib', 'Apache-2.0'];

describe('isAllowed', () => {
  it('allows an AND expression when every part is allowed', () => {
    expect(isAllowed('(MIT AND Zlib)', allow)).toBe(true);
  });
  it('allows an OR expression when one part is allowed', () => {
    expect(isAllowed('MIT OR GPL-3.0', allow)).toBe(true);
  });
  it('rejects a licence that is not on the list', () => {
    expect(isAllowed('GPL-3.0', allow)).toBe(false);
  });
  it('rejects an AND expression with one disallowed part', () => {
    expect(isAllowed('(MIT AND GPL-3.0)', allow)).toBe(false);
  });
  it('rejects SEE LICENSE IN as unknown', () => {
    expect(isAllowed('SEE LICENSE IN x', allow)).toBe(false);
  });
});

describe('collect and check', () => {
  const tree = {
    dependencies: {
      a: { name: 'a', version: '1.0.0', license: 'MIT' },
      gone: { missing: true },
      left: { name: 'left', version: '1.0.0', license: 'GPL-3.0', extraneous: true },
    },
  };
  it('skips missing and extraneous nodes', () => {
    expect(collect(tree).map((p: { name: string }) => p.name)).toEqual(['a']);
  });
  it('matches an exception by package glob and declared licence', () => {
    const pkg = { name: 'old', version: '1.0.0', licence: 'BSD' };
    const ex = [{ package: 'old', licence: 'BSD-3-Clause (declared as legacy "BSD")', reason: 'x' }];
    expect(check([pkg], ex).failures).toEqual([]);
    expect(check([pkg], []).failures).toHaveLength(1);
  });
});
