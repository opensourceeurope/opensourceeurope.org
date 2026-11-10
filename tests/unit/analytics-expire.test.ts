import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const FILTER = 'analytics/expire.jq';
// 2026-11-10T03:00:00Z, when the job runs.
const NOW = 1794279600;

function keys(keep: number, window: number): string[] {
  const out = execFileSync(
    'jq',
    ['-cn', '--argjson', 'now', String(NOW), '--argjson', 'keep', String(keep), '--argjson', 'window', String(window), '-f', FILTER],
    { encoding: 'utf8' },
  );
  const request = JSON.parse(out) as { Objects: { Key: string }[]; Quiet: boolean };
  expect(request.Quiet).toBe(true);
  return request.Objects.map((o) => o.Key);
}

describe('analytics/expire.jq', () => {
  it('names the JSONL and CSV file of each day in the window', () => {
    expect(keys(356, 2)).toEqual([
      'analytics-2025-11-19.jsonl',
      'analytics-2025-11-19.csv',
      'analytics-2025-11-18.jsonl',
      'analytics-2025-11-18.csv',
    ]);
  });

  it('never names a file younger than the keep period', () => {
    const youngest = keys(356, 30).map((k) => k.slice(10, 20)).sort().at(-1);
    expect(youngest).toBe('2025-11-19');
  });

  it('names only chat analytics files, never the page-view totals', () => {
    expect(keys(356, 30).every((k) => /^analytics-\d{4}-\d{2}-\d{2}\.(jsonl|csv)$/.test(k))).toBe(true);
  });

  it('stays within the 1000 keys that one DeleteObjects call accepts', () => {
    expect(keys(356, 30)).toHaveLength(60);
  });
});
