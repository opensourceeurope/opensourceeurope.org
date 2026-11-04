import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { INTEREST_OPTIONS } from '../../functions/contact/src/fields';

// The form text is edited in contact.yaml, while the function validates against its own list.
// A rename in one place alone makes the function reject every post that picks that option.
const yaml = readFileSync('src/content/pages/contact.yaml', 'utf8');

function interestBlock(): { options: string[]; other: string } {
  const lines = yaml.split('\n');
  const start = lines.findIndex((l) => l.trim() === 'options:');
  expect(start, 'options: not found in contact.yaml').toBeGreaterThan(-1);
  const options: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const m = line.match(/^\s+- (.+)$/);
    if (!m) break;
    options.push(m[1].trim());
  }
  const other = lines.find((l) => l.trim().startsWith('other:'))?.split(':')[1].trim() ?? '';
  return { options, other };
}

describe('contact form options', () => {
  it('reads a non-empty option list from contact.yaml', () => {
    expect(interestBlock().options.length).toBeGreaterThan(0);
  });

  it('match the options the function accepts', () => {
    expect(interestBlock().options).toEqual([...INTEREST_OPTIONS]);
  });

  it('name the free-text option as the last, "Other", option', () => {
    const { options, other } = interestBlock();
    expect(other).toBe('Other');
    expect(options.at(-1)).toBe(other);
  });
});
