#!/usr/bin/env bash
# REQ-201 kapsam 4 — proven-to-fail for the loop tool family.
#
# Each mutation must turn the probe RED, then the tree is restored byte for byte
# and verified with `md5sum -c`. Three infrastructure rules learned the hard way
# in this repo (see the REQ progress log):
#
#  * every mutation PROVES it applied (marker file) — a python subprocess does
#    NOT inherit a bash variable, and a stale anchor that silently no-ops makes
#    the script report "red as required" for a rule it never tested;
#  * every exit path restores, and `verify_restore` runs at the END too;
#  * `expect_red` must call restore with the file it MUTATED — calling it with
#    the mutated file left a broken tree behind.
set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
PROBE="$REPO_ROOT/packages/lokma-core/src/tools/loops-tools.test.ts"
CORE="$REPO_ROOT/packages/lokma-core/src/tools/loops-tools.ts"
STORE="$REPO_ROOT/packages/lokma-core/src/loops/store.ts"
SHARED="$REPO_ROOT/packages/lokma-shared/src/surfaces.ts"
MARKERS="$(mktemp -d)"
BACKUP="$(mktemp -d)"

if [ ! -f "$PROBE" ]; then
  echo "PROBE MISSING: $PROBE — script cannot verify anything" >&2
  exit 2
fi

# Byte-exact copies, NOT git: `loops-tools.ts` and its probe are untracked at
# the time this script runs, so `git checkout --` cannot restore them, and a
# shared repo makes `git checkout --` on a tracked file dangerous (it wipes a
# sibling's uncommitted work). Copying is the only restore that works for both.
cp "$PROBE" "$BACKUP/probe"
cp "$CORE" "$BACKUP/core"
cp "$STORE" "$BACKUP/store"
cp "$SHARED" "$BACKUP/shared"

ORIG_SUMS="$BACKUP/sums"
md5sum "$PROBE" "$CORE" "$STORE" "$SHARED" > "$ORIG_SUMS"

restore() {
  # One argument: the file that was mutated. Maps a real path to its backup.
  local target="$1" src=""
  case "$target" in
    "$PROBE") src="$BACKUP/probe" ;;
    "$CORE") src="$BACKUP/core" ;;
    "$STORE") src="$BACKUP/store" ;;
    "$SHARED") src="$BACKUP/shared" ;;
    *) echo "RESTORE FAILED: unknown target $target" >&2; return 1 ;;
  esac
  cat "$src" > "$target"
  local want have
  want="$(grep -F " $target" "$ORIG_SUMS" | awk '{print $1}')"
  have="$(md5sum "$target" | awk '{print $1}')"
  [ "$want" = "$have" ]
}

verify_restore() {
  local rc=0
  for f in "$PROBE" "$CORE" "$STORE" "$SHARED"; do
    if ! restore "$f"; then
      echo "RESTORE FAILED: $f differs from its pre-run bytes" >&2
      rc=1
    fi
  done
  md5sum -c --status "$ORIG_SUMS" || { echo "RESTORE VERIFY FAILED" >&2; rc=1; }
  rm -rf "$MARKERS" "$BACKUP"
  return $rc
}

run_probe() {
  ( cd "$REPO_ROOT/packages/lokma-core" && HOME="$(mktemp -d)" bun src/tools/loops-tools.test.ts )
}

expect_red() {
  local label="$1" target="$2"
  local log; log="$(mktemp)"
  run_probe > "$log" 2>&1
  local rc=$?
  if [ ! -f "$MARKERS/marker" ]; then
    echo "INFRA: mutation '$label' did not prove it applied — not evidence" >&2
    sed -n '1,20p' "$log" >&2
    restore "$target" >/dev/null 2>&1 || true
    rm -f "$log"
    return 2
  fi
  rm -f "$MARKERS/marker"
  if [ "$rc" -eq 0 ]; then
    echo "PTF FAILED (stayed green): $label — the rule is untested" >&2
    sed -n '1,20p' "$log" >&2
    restore "$target" >/dev/null 2>&1 || true
    rm -f "$log"
    return 1
  fi
  if grep -q 'ReferenceError\|SyntaxError\|TypeError: .* is not a function' "$log"; then
    echo "PTF FAILED (died on an unrelated error, not the rule): $label" >&2
    sed -n '1,20p' "$log" >&2
    restore "$target" >/dev/null 2>&1 || true
    rm -f "$log"
    return 1
  fi
  echo "ok (red): $label"
  restore "$target" >/dev/null 2>&1 || true
  rm -f "$log"
  return 0
}

fails=0

# 1. Un-gate loop_create: flip the catalog gate to read. The probe asserts
#    WRITE_TOOLS membership + plan-deny, so this MUST go red.
python3 - "$SHARED" "$MARKERS/marker" <<'PY'
import sys
path, marker = sys.argv[1], sys.argv[2]
src = open(path).read()
old = "{ name: 'loop_create', summary: 'Create a repeating loop (approval-gated) with a prompt, cwd and trigger', gate: 'write' }"
new = "{ name: 'loop_create', summary: 'Create a repeating loop (approval-gated) with a prompt, cwd and trigger', gate: 'read' }"
assert old in src, 'anchor missing — gate row moved'
open(path, 'w').write(src.replace(old, new, 1))
open(marker, 'w').write('applied')
PY
expect_red "loop_create gate downgraded to read" "$SHARED" || fails=$((fails + 1))

# 2. Stamp origin as 'user' instead of 'agent' — the probe asserts the STAMP.
python3 - "$CORE" "$MARKERS/marker" <<'PY'
import sys
path, marker = sys.argv[1], sys.argv[2]
src = open(path).read()
old = "origin: 'agent',"
new = "origin: 'user',"
assert old in src, 'anchor missing — origin stamp moved'
open(path, 'w').write(src.replace(old, new, 1))
open(marker, 'w').write('applied')
PY
expect_red "agent origin replaced by user" "$CORE" || fails=$((fails + 1))

# 3. Start the loop on create (draft -> running) — 'creating is not starting'.
python3 - "$CORE" "$MARKERS/marker" <<'PY'
import sys
path, marker = sys.argv[1], sys.argv[2]
src = open(path).read()
old = """          opts.emit?.({ action: 'open_loop', loopId: loop.id, loopName: loop.name });"""
new = """          await setLoopStatus(loop.id, 'running');
          opts.emit?.({ action: 'open_loop', loopId: loop.id, loopName: loop.name });"""
assert old in src, 'anchor missing — emit call moved'
src = src.replace(old, new, 1)
src = src.replace(
    "import { cwdLockConflict, createLoop, listLoops, LoopError, normalizeLoopCwd } from '../loops/index.js';",
    "import { cwdLockConflict, createLoop, listLoops, LoopError, normalizeLoopCwd, setLoopStatus } from '../loops/index.js';",
    1,
)
open(path, 'w').write(src)
open(marker, 'w').write('applied')
PY
expect_red "loop_create starts the loop instead of drafting it" "$CORE" || fails=$((fails + 1))

# 4. Drop the cwd refusal entirely — a second loop in one directory is kapsam 5.
python3 - "$CORE" "$MARKERS/marker" <<'PY'
import sys
path, marker = sys.argv[1], sys.argv[2]
src = open(path).read()
old = """          const occupant = await cwdOccupant(data.cwd);
          if (occupant) {"""
new = """          const occupant = null as Awaited<ReturnType<typeof cwdOccupant>>;
          if (occupant) {"""
assert old in src, 'anchor missing — occupant check moved'
open(path, 'w').write(src.replace(old, new, 1))
open(marker, 'w').write('applied')
PY
expect_red "the same-cwd refusal removed" "$CORE" || fails=$((fails + 1))

# 5. Stop releasing the cwd lock when a loop leaves `running` — the store fix.
python3 - "$STORE" "$MARKERS/marker" <<'PY'
import sys
path, marker = sys.argv[1], sys.argv[2]
src = open(path).read()
old = "  if (to !== 'running') await releaseLoopCwd(loopId, current.cwd);"
new = "  if (to === 'paused') await releaseLoopCwd(loopId, current.cwd);"
assert old in src, 'anchor missing — release line changed'
open(path, 'w').write(src.replace(old, new, 1))
open(marker, 'w').write('applied')
PY
expect_red "cwd lock not released on terminal status" "$STORE" || fails=$((fails + 1))

# 6. Stop normalizing the cwd — `~/x/` and `/root/x` must be ONE directory.
python3 - "$CORE" "$MARKERS/marker" <<'PY'
import sys
path, marker = sys.argv[1], sys.argv[2]
src = open(path).read()
old = "async function cwdOccupant(cwd: string)"
new = "async function cwdOccupant(cwd: string)"
assert old in src
# Replace every normalization call with the raw string.
count = src.count("normalizeLoopCwd(")
assert count >= 3, 'normalization call sites moved'
body = src.replace("normalizeLoopCwd(data.cwd)", "data.cwd").replace(
    "normalizeLoopCwd(cwd)", "cwd"
).replace("normalizeLoopCwd(loop.cwd)", "loop.cwd")
open(path, 'w').write(body)
open(marker, 'w').write('applied')
PY
expect_red "cwd spelling no longer normalized" "$CORE" || fails=$((fails + 1))

# 7. Drop nextStep — a tool answer that leaves the caller with nothing to do.
python3 - "$CORE" "$MARKERS/marker" <<'PY'
import sys
path, marker = sys.argv[1], sys.argv[2]
src = open(path).read()
start = src.index("            // Narrows on the discriminated union")
end = src.index("          };", start)
src = src[:start] + src[end:]
open(path, 'w').write(src)
open(marker, 'w').write('applied')
PY
expect_red "nextStep removed from the create answer" "$CORE" || fails=$((fails + 1))

echo "---"
if [ "$fails" -eq 0 ]; then
  echo "PTF: 7/7 red"
else
  echo "PTF: $fails mutation(s) did not fail as required"
fi

verify_restore || { echo "TREE NOT RESTORED" >&2; exit 1; }
[ "$fails" -eq 0 ] || exit 1
exit 0