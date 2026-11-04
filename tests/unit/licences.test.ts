import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { check, collect, isAllowed, licenceFromText } from '../../scripts/check-licences.mjs';

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
  it('reads the LICENSE file when package.json declares no licence', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lic-'));
    writeFileSync(join(dir, 'LICENSE'), '                Apache License\n          Version 2.0, January 2004\n');
    const found = collect({
      dependencies: { m: { name: 'm', version: '1.0.0', path: dir } },
    });
    expect(found[0].licence).toBe('Apache-2.0');
    expect(check(found, []).failures).toEqual([]);
  });
  it('reads the LICENSE file when package.json declares a non-SPDX licence', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lic-'));
    writeFileSync(
      join(dir, 'LICENSE'),
      'Redistribution and use in source and binary forms, with or without modification, are permitted provided that ...\nThe names of any contributors may not be used to endorse or promote products derived from this software ...',
    );
    const found = collect({
      dependencies: {
        p: { name: 'p', version: '1.0.0', license: 'BSD', path: dir },
      },
    });
    expect(found[0].licence).toBe('BSD-3-Clause');
  });
  it('never overrides a declared SPDX licence with the LICENSE file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lic-'));
    writeFileSync(join(dir, 'LICENSE'), 'Permission is hereby granted, free of charge, to any person');
    const found = collect({
      dependencies: {
        g: { name: 'g', version: '1.0.0', license: 'GPL-3.0', path: dir },
      },
    });
    expect(found[0].licence).toBe('GPL-3.0');
  });
  it('keeps a package with no licence field and no LICENSE file as unknown', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lic-'));
    const found = collect({
      dependencies: { n: { name: 'n', version: '1.0.0', path: dir } },
    });
    expect(found[0].licence).toBeUndefined();
    expect(check(found, []).failures).toHaveLength(1);
  });
  it('recognises the standard licence texts and nothing else', () => {
    expect(licenceFromText('MIT License\n\nPermission is hereby granted, free of charge, to any person')).toBe('MIT');
    expect(licenceFromText('Redistribution and use in source and binary forms ... are permitted')).toBe('BSD-2-Clause');
    expect(licenceFromText('GNU GENERAL PUBLIC LICENSE Version 3')).toBeUndefined();
    expect(licenceFromText('All rights reserved.')).toBeUndefined();
  });
  it('matches an exception by package glob and declared licence', () => {
    const pkg = { name: 'old', version: '1.0.0', licence: 'BSD' };
    const ex = [{ package: 'old', licence: 'BSD-3-Clause (declared as legacy "BSD")', reason: 'x' }];
    expect(check([pkg], ex).failures).toEqual([]);
    expect(check([pkg], []).failures).toHaveLength(1);
  });
});
