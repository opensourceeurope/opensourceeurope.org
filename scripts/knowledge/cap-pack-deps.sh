#!/usr/bin/env bash
# Fix the dependencies of the package that `opencrane pack` generated, so a fresh
# `uvx ose-knowledge-mcp==<version>` resolves what our own runs use:
#   - copy the version caps in .opencrane/constraints.txt into them, and
#   - pin opencrane exactly to .opencrane/opencrane-version. `opencrane pack` writes
#     `opencrane>=<version>`, which lets users drift to newer opencrane releases than
#     the one that built and tested the bundled index.
# `opencrane pack` has no option for either. Running the script twice is harmless.
#
#   ./scripts/knowledge/cap-pack-deps.sh .opencrane/pack
#
# PACK_DIR resolves from the repo root (the script cds there first), not from the
# caller's directory. An absolute path works from anywhere.
#
# Run it after `opencrane pack` and before `uv build`. It fails if the generated
# pyproject.toml does not have the expected shape, or a cap or the opencrane pin is
# missing afterwards.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

PACK_DIR="${1:?usage: $0 <pack dir>}"
python3 - "$PACK_DIR/pyproject.toml" .opencrane/constraints.txt .opencrane/opencrane-version <<'PY'
import re, sys, tomllib
pyproject, constraints, version_file = sys.argv[1], sys.argv[2], sys.argv[3]
version = open(version_file).read().strip()
if not re.fullmatch(r"[0-9]+(\.[0-9]+)*", version):
    sys.exit(f"ERROR: {version_file} does not hold a plain version: {version!r}")
pin = f"opencrane=={version}"
caps = [l.strip() for l in open(constraints) if l.strip() and not l.lstrip().startswith("#")]
if not caps:
    sys.exit(f"ERROR: {constraints} has no cap lines; expected at least one, e.g. transformers<5.17")
bad = [c for c in caps if "#" in c or '"' in c or c.startswith("-")]
if bad:
    sys.exit(f"ERROR: {constraints} has cap lines that cannot go into pyproject.toml "
             f"(no inline comments, quotes or pip options): {bad}")
text = open(pyproject).read()
anchor = "dependencies = [\n"
if text.count(anchor) != 1:
    sys.exit(f"ERROR: expected one '{anchor.strip()}' line in {pyproject}")
current = tomllib.loads(text)["project"]["dependencies"]
missing = [c for c in caps if c not in current]
lines = "".join(f'    "{c}",\n' for c in missing)
text = text.replace(anchor, anchor + lines)
# Pin opencrane: replace whatever specifier pack wrote (">=X", or an earlier pin).
opencrane_dep = re.compile(r'"opencrane\s*(?:[<>=!~]=?[^"]*)?"')
found = opencrane_dep.findall(text)
if len(found) != 1:
    sys.exit(f"ERROR: expected one opencrane dependency in {pyproject}, found {found}")
text = opencrane_dep.sub(f'"{pin}"', text)
deps = tomllib.loads(text)["project"]["dependencies"]
absent = [c for c in caps if c not in deps]
if absent:
    sys.exit(f"ERROR: caps not applied to {pyproject}: {absent}")
opencrane_deps = [d for d in deps if re.match(r"opencrane\b(?![-_.\[])", d)]
if opencrane_deps != [pin]:
    sys.exit(f"ERROR: expected the single opencrane dependency {pin} in {pyproject}, got {opencrane_deps}")
open(pyproject, "w").write(text)
print(f"{pyproject} dependencies: {deps}")
PY
