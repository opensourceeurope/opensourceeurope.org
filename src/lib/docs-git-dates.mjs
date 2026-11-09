// "Last updated" dates for the docs pages in docs/.
//
// Starlight reads the dates from git only for files under src/content/docs/, so it
// finds no date for a page in docs/. docsGitInfo() replaces Starlight's
// virtual:starlight/git-info module with dates for docs/. Each date is the newest
// commit that changed the page, following renames and skipping a commit that only
// moved the file, so a page keeps its date when it moves.
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const GIT_INFO = 'virtual:starlight/git-info';
const RESOLVED = '\0ose:docs-git-info';

/** The newest commit time, in milliseconds, that changed the file other than by a pure rename. */
export function newestContentCommit(file, cwd = process.cwd()) {
  let out;
  try {
    out = execFileSync('git', ['log', '--follow', '--format=t:%ct', '--name-status', '--', file], { cwd, encoding: 'utf8' });
  } catch {
    return undefined;
  }
  let time;
  for (const line of out.split('\n')) {
    if (line.startsWith('t:')) time = Number(line.slice(2)) * 1000;
    else if (line && time !== undefined && !line.startsWith('R100\t')) return time;
  }
  return undefined;
}

/** [path, time] for every page in dir, with paths relative to cwd, as Starlight's entry.filePath. */
export function docsCommitDates(dir = 'docs', cwd = process.cwd()) {
  return readdirSync(join(cwd, dir), { recursive: true })
    .map((f) => join(dir, String(f)))
    .filter((f) => /\.mdx?$/.test(f))
    .map((f) => [f, newestContentCommit(f, cwd)])
    .filter(([, time]) => time !== undefined);
}

export const docsGitInfo = {
  name: 'ose:docs-git-info',
  enforce: 'pre',
  resolveId(id) {
    return id === GIT_INFO ? RESOLVED : undefined;
  },
  load(id) {
    if (id !== RESOLVED) return undefined;
    // A page that git does not know yet, such as a new file in dev, gets no date. Starlight catches the error.
    return `const dates = new Map(${JSON.stringify(docsCommitDates())});
export const getNewestCommitDate = (file) => {
  const time = dates.get(file);
  if (!time) throw new Error('No git history for ' + file);
  return new Date(time);
};`;
  },
};
