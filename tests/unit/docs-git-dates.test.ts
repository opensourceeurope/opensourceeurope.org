import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { docsCommitDates, newestContentCommit } from '../../src/lib/docs-git-dates.mjs';

// A throwaway repository: a page added on day 1, moved without a change on day 2, edited on day 3.
const repo = mkdtempSync(join(tmpdir(), 'docs-git-dates-'));
const git = (args: string[], day?: number) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.org', ...args], {
    cwd: repo,
    env: day ? { ...process.env, GIT_AUTHOR_DATE: `2026-01-0${day}T12:00:00Z`, GIT_COMMITTER_DATE: `2026-01-0${day}T12:00:00Z` } : process.env,
  });
const day = (n: number) => Date.parse(`2026-01-0${n}T12:00:00Z`);

git(['init', '-q']);
mkdirSync(join(repo, 'old'));
writeFileSync(join(repo, 'old/page.md'), '# Page\n');
git(['add', '.']);
git(['commit', '-q', '-m', 'add'], 1);
mkdirSync(join(repo, 'docs'));
git(['mv', 'old/page.md', 'docs/page.md']);
git(['commit', '-q', '-m', 'move'], 2);

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe('docs "Last updated" dates', () => {
  it('skips a commit that only moved the page', () => {
    expect(newestContentCommit('docs/page.md', repo)).toBe(day(1));
    expect(docsCommitDates('docs', repo)).toEqual([['docs/page.md', day(1)]]);
  });

  it('uses the newest commit that changed the page', () => {
    writeFileSync(join(repo, 'docs/page.md'), '# Page\n\nMore.\n');
    git(['commit', '-q', '-am', 'edit'], 3);
    expect(newestContentCommit('docs/page.md', repo)).toBe(day(3));
  });

  it('gives every page in this repository a date', () => {
    expect(docsCommitDates().map(([file]) => file)).toContain('docs/faq/general-faqs.md');
  });
});
