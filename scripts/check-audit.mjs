// Fails on a high or critical advisory in the production dependencies of the
// site and of functions/chat. npm audit has no way to skip an advisory, so an
// advisory with no patched release blocks every pull request until upstream
// ships one. Exceptions live in audit-exceptions.json, each with a reason and
// an `until` date. After that date the advisory blocks again, so an exception
// cannot outlive the review it needs.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PROJECTS = ['.', 'functions/chat'];
const BLOCKING = new Set(['high', 'critical']);

// Returns the advisories of an `npm audit --json` report, one per GHSA id.
// A `via` entry that is a string only names another vulnerable package.
export function advisories(report) {
  const found = new Map();
  for (const vuln of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vuln.via) {
      if (typeof via !== 'object') continue;
      const id = via.url?.match(/GHSA-[\w-]+$/)?.[0] ?? String(via.source);
      if (!found.has(id)) found.set(id, { id, name: via.name, title: via.title, severity: via.severity });
    }
  }
  return [...found.values()];
}

// Splits the blocking advisories into those an unexpired exception covers and the rest.
// `today` is an ISO date (YYYY-MM-DD); an exception holds through its `until` day.
export function check(found, exceptions, today) {
  const failures = [];
  const excepted = [];
  for (const a of found.filter((x) => BLOCKING.has(x.severity))) {
    const ex = exceptions.find((e) => e.advisory === a.id);
    if (ex && today <= ex.until) excepted.push({ ...a, until: ex.until });
    else failures.push({ ...a, expired: ex?.until });
  }
  return { failures, excepted };
}

function audit(dir) {
  // npm audit exits 1 when it finds anything, so read stdout from the error too.
  try {
    return JSON.parse(execFileSync('npm', ['audit', '--omit=dev', '--json'], { cwd: dir, encoding: 'utf8' }));
  } catch (err) {
    if (err.stdout) return JSON.parse(err.stdout);
    throw err;
  }
}

function main() {
  const root = new URL('..', import.meta.url);
  const exceptions = JSON.parse(readFileSync(new URL('audit-exceptions.json', root), 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  let failed = false;
  for (const project of PROJECTS) {
    const dir = fileURLToPath(new URL(project === '.' ? '.' : `${project}/`, root));
    const { failures, excepted } = check(advisories(audit(dir)), exceptions, today);
    for (const a of excepted) console.log(`${project}: exception until ${a.until}: ${a.id} ${a.name}: ${a.title}`);
    for (const a of failures) {
      const note = a.expired ? ` (exception expired ${a.expired})` : '';
      console.error(`${project}: ${a.severity} ${a.id} ${a.name}: ${a.title}${note}`);
    }
    if (failures.length) failed = true;
    else console.log(`${project}: no high or critical advisory outside audit-exceptions.json`);
  }
  if (failed) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
