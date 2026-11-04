// Checks the licence of every installed package against an allowlist.
// Exceptions live in licence-exceptions.json and need a reason each.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ALLOWED = [
  'MIT',
  'MIT-0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'CC0-1.0',
  'CC-BY-4.0',
  'OFL-1.1',
  'BlueOak-1.0.0',
  'Unlicense',
  'Python-2.0',
  'MPL-2.0',
  'Zlib',
];

// Parses an SPDX expression: ids, AND, OR and parentheses. AND binds tighter
// than OR. Anything that does not parse is treated as not allowed.
export function isAllowed(expr, allow) {
  if (typeof expr !== 'string' || /^SEE LICEN[CS]E IN/i.test(expr.trim())) return false;
  const tokens = expr.match(/\(|\)|[^\s()]+/g);
  if (!tokens) return false;
  let pos = 0;
  const parseOr = () => {
    let ok = parseAnd();
    while (tokens[pos] === 'OR') {
      pos++;
      const rhs = parseAnd();
      ok = ok || rhs;
    }
    return ok;
  };
  const parseAnd = () => {
    let ok = parseAtom();
    while (tokens[pos] === 'AND') {
      pos++;
      const rhs = parseAtom();
      ok = ok && rhs;
    }
    return ok;
  };
  const parseAtom = () => {
    const t = tokens[pos++];
    if (t === '(') {
      const ok = parseOr();
      if (tokens[pos++] !== ')') throw new Error('unbalanced');
      return ok;
    }
    if (t === undefined || t === ')' || t === 'AND' || t === 'OR') throw new Error('unexpected');
    return allow.includes(t);
  };
  try {
    const ok = parseOr();
    return pos === tokens.length && ok;
  } catch {
    return false;
  }
}

function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

// The licence text of a node: `license` (string or { type }), or the legacy `licenses[]`.
function licenceOf(node) {
  const one = (l) => (typeof l === 'string' ? l : l && l.type);
  if (node.license) return one(node.license);
  if (Array.isArray(node.licenses) && node.licenses.length) {
    const parts = node.licenses.map(one);
    return parts.every(Boolean) ? parts.join(' OR ') : undefined;
  }
  return undefined;
}

// Nodes that are missing or extraneous (left in node_modules but not required by
// the lockfile tree, so `npm ci` does not install them) are skipped.
export function collect(tree) {
  const found = new Map();
  (function walk(deps) {
    for (const [key, node] of Object.entries(deps || {})) {
      if (node && !node.missing && !node.extraneous && node.version) {
        const name = node.name || key;
        const id = `${name}@${node.version}`;
        if (!found.has(id)) found.set(id, { name, version: node.version, licence: licenceOf(node) });
      }
      if (node) walk(node.dependencies);
    }
  })(tree.dependencies);
  return [...found.values()];
}

export function check(packages, exceptions) {
  const matchers = exceptions.map((e) => ({ ...e, re: globToRegExp(e.package) }));
  const failures = [];
  const excepted = [];
  for (const pkg of packages) {
    if (pkg.licence && isAllowed(pkg.licence, ALLOWED)) continue;
    // A package with no licence field matches an exception whose licence is "unknown".
    const lic = pkg.licence ?? 'unknown';
    const ex = matchers.find((m) => m.re.test(pkg.name) && (m.licence === lic || m.licence.includes(`"${lic}"`)));
    if (ex) excepted.push(pkg);
    else failures.push(pkg);
  }
  return { failures, excepted };
}

// Folders with their own package.json and lockfile. Each one is checked on its own.
export const PROJECTS = ['.', 'functions/chat'];

function listPackages(dir) {
  let out;
  try {
    out = execFileSync('npm', ['ls', '--all', '--json', '--long'], {
      cwd: dir,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (err) {
    // npm ls exits non-zero for problems such as missing optional packages but still prints the tree.
    out = err.stdout;
    if (!out) throw err;
  }
  return collect(JSON.parse(out));
}

function main() {
  const root = new URL('..', import.meta.url);
  const exceptions = JSON.parse(readFileSync(new URL('licence-exceptions.json', root), 'utf8'));
  let failed = false;
  for (const project of PROJECTS) {
    const dir = fileURLToPath(new URL(project === '.' ? '.' : `${project}/`, root));
    const packages = listPackages(dir);
    if (packages.length === 0) {
      console.error(`${project}: no installed packages found. Run npm ci${project === '.' ? '' : ` --prefix ${project}`} first.`);
      failed = true;
      continue;
    }
    const { failures, excepted } = check(packages, exceptions);
    for (const p of excepted) console.log(`exception: ${p.name}@${p.version} (${p.licence ?? 'unknown'})`);
    for (const p of failures) console.error(`not allowed in ${project}: ${p.name}@${p.version} licence: ${p.licence ?? 'unknown'}`);
    if (failures.length) failed = true;
    else console.log(`${project}: ${packages.length} packages checked, ${excepted.length} covered by licence-exceptions.json`);
  }
  if (failed) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
