#!/usr/bin/env bash
# Proven-to-fail for loop STOP / ABORT / BOOT RECOVERY (REQ-201 slice 5).
#
# Each case below mutates ONE load-bearing behaviour, re-runs the probe, and
# requires the probe to FAIL — then restores the file byte-for-byte (md5
# verified). A mutation that leaves the probe green means the rule it targeted
# was never the load-bearing cause.
#
# Usage: bash src/loops/stop-abort-proven-to-fail.sh
set -uo pipefail
# The script lives at packages/lokma-web/server/src/loops/, so the REPO root is
# FIVE levels up (`loops` -> `src` -> `server` -> `lokma-web` -> `packages` ->
# `lokma`). Getting this wrong makes every mutation "pass" for the wrong reason.
REPO_ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$REPO_ROOT" || exit 2
if [ ! -f packages/lokma-web/server/src/loops/stop-abort.test.ts ]; then
  echo "REPO_ROOT is wrong: $REPO_ROOT" >&2
  exit 2
fi

STORE="packages/lokma-core/src/loops/store.ts"
FSUTIL="packages/lokma-core/src/utils/fs.ts"
PROBE="packages/lokma-web/server/src/loops/stop-abort.test.ts"
ROUTES="packages/lokma-web/server/src/routes/loops.ts"

BACKUP_DIR="$(mktemp -d)"
trap 'rm -rf "$BACKUP_DIR"' EXIT

snapshot() {
  for f in "$STORE" "$FSUTIL" "$PROBE" "$ROUTES"; do
    md5sum "$f"
  done > "$BACKUP_DIR/md5.orig"
  for f in "$STORE" "$FSUTIL" "$PROBE" "$ROUTES"; do
    cp "$f" "$BACKUP_DIR/$(basename "$f")"
  done
}

restore() {
  cp "$BACKUP_DIR/$1" "$2"
}

verify_restore() {
  md5sum -c "$BACKUP_DIR/md5.orig" > /dev/null 2>&1 \
    && echo "  restored byte-for-byte OK" \
    || { echo "  RESTORE FAILED"; md5sum -c "$BACKUP_DIR/md5.orig"; exit 1; }
}

run_probe() {
  ( cd packages/lokma-web/server && HOME="$(mktemp -d)" bun src/loops/stop-abort.test.ts 2>&1 )
}

# A mutation must PROVE it applied, or the run below measures nothing.
MARKER=""
expect_red() {
  local label="$1"
  if [ ! -f "$MARKER" ]; then
    echo "MUTATION NEVER APPLIED: $label"
    FAILED=1
    return
  fi
  rm -f "$MARKER"
  local out rc
  out="$(run_probe)"
  rc=$?
  if [ "$rc" -eq 0 ]; then
    echo "NOT RED (probe still green): $label"
    echo "$out" | tail -3
    FAILED=1
  else
    echo "red as required: $label  [$(echo "$out" | grep -c '^FAIL:') failing assert(s)]"
  fi
}

FAILED=0
snapshot

echo "# PTF 1: the deferred stop is applied immediately, cutting the turn in flight"
MARKER="$BACKUP_DIR/marker"
python3 - "$STORE" "$MARKER" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1]); marker = Path(sys.argv[2])
s = p.read_text()
old = """  if (current.inFlightSince !== null) {
    await persist({"""
new = """  if (false) {
    await persist({"""
assert s.count(old) == 1, 'anchor missing (defer branch)'
p.write_text(s.replace(old, new))
marker.write_text('ok')
print('MUTATED')
PY
expect_red "stop no longer defers" || FAILED=1
restore store.ts "$STORE"

echo "# PTF 2: the in-flight stamp is never cleared, so every loop looks busy"
MARKER="$BACKUP_DIR/marker"
python3 - "$STORE" "$MARKER" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1]); marker = Path(sys.argv[2])
s = p.read_text()
old = """    lastRunStartedAt: opts.startedAt,
    inFlightSince: null,"""
new = """    lastRunStartedAt: opts.startedAt,
    inFlightSince: current.inFlightSince,"""
assert s.count(old) == 1, 'anchor missing (clear in-flight)'
p.write_text(s.replace(old, new))
marker.write_text('ok')
print('MUTATED')
PY
expect_red "in-flight stamp never cleared" || FAILED=1
restore store.ts "$STORE"

echo "# PTF 3: boot recovery re-arms a loop whose turn died mid-process"
MARKER="$BACKUP_DIR/marker"
python3 - "$STORE" "$MARKER" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1]); marker = Path(sys.argv[2])
s = p.read_text()
old = "    if (loop.inFlightSince === null) {"
new = "    if (loop.inFlightSince !== null) {"
assert s.count(old) == 1, 'anchor missing (recovery branch)'
p.write_text(s.replace(old, new))
marker.write_text('ok')
print('MUTATED')
PY
expect_red "recovery skips the interrupted case" || FAILED=1
restore store.ts "$STORE"

echo "# PTF 4: recovery ignores the zero-cost off switch"
MARKER="$BACKUP_DIR/marker"
python3 - "$STORE" "$MARKER" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1]); marker = Path(sys.argv[2])
s = p.read_text()
old = "    if (loop.budget.maxUsd === 0) {"
new = "    if (false) {"
assert s.count(old) == 1, 'anchor missing (zero-cost guard)'
p.write_text(s.replace(old, new))
marker.write_text('ok')
print('MUTATED')
PY
expect_red "zero-cost loop is resumed" || FAILED=1
restore store.ts "$STORE"

echo "# PTF 5: resuming no longer clears a pending stop request"
MARKER="$BACKUP_DIR/marker"
python3 - "$STORE" "$MARKER" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1]); marker = Path(sys.argv[2])
s = p.read_text()
old = "    stopRequested: to === 'running' ? false : current.stopRequested,"
new = "    stopRequested: current.stopRequested,"
assert s.count(old) == 1, 'anchor missing (resume clears flag)'
p.write_text(s.replace(old, new))
marker.write_text('ok')
print('MUTATED')
PY
expect_red "resumed loop inherits the stop request" || FAILED=1
restore store.ts "$STORE"

echo "# PTF 6: writes are no longer serialized per loop (concurrent writers race)"
MARKER="$BACKUP_DIR/marker"
python3 - "$STORE" "$MARKER" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1]); marker = Path(sys.argv[2])
s = p.read_text()
old = """    if (!held) {
      const token = Symbol('loop-write');
      return writeContext.run({ token }, () => enqueueLoopWrite(loopId, token, fn));
    }"""
new = """    if (!held) {
      const token = Symbol('loop-write');
      return fn();
    }"""
assert s.count(old) == 1, 'anchor missing (queue entry)'
p.write_text(s.replace(old, new))
marker.write_text('ok')
print('MUTATED')
PY
expect_red "the Stop clobbers the turn's measurement" || FAILED=1
restore store.ts "$STORE"

echo "# PTF 7: the abort route no longer cuts the in-flight turn"
MARKER="$BACKUP_DIR/marker"
python3 - "$ROUTES" "$MARKER" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1]); marker = Path(sys.argv[2])
s = p.read_text()
old = """        const state = getRunState(loopSessionId(id));
        state.abort?.abort();"""
new = """        const state = getRunState(loopSessionId(id));
        void state;"""
assert s.count(old) == 1, 'anchor missing (abort route cut)'
p.write_text(s.replace(old, new))
marker.write_text('ok')
print('MUTATED')
PY
expect_red "the real turn controller is never aborted" || FAILED=1
restore loops.ts "$ROUTES"

echo "# PTF 8: the atomic write reuses one temp name per process"
MARKER="$BACKUP_DIR/marker"
python3 - "$FSUTIL" "$MARKER" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1]); marker = Path(sys.argv[2])
s = p.read_text()
old = "  const tmp = `${full}.tmp.${process.pid}.${randomBytes(6).toString('hex')}`;"
new = "  const tmp = `${full}.tmp.${process.pid}`;"
assert s.count(old) == 1, 'anchor missing (unique temp name)'
p.write_text(s.replace(old, new))
marker.write_text('ok')
print('MUTATED')
PY
expect_red "concurrent writes collide on one temp file" || FAILED=1
restore fs.ts "$FSUTIL"

echo ""
verify_restore
if [ "$FAILED" -ne 0 ]; then
  echo "PROVEN-TO-FAIL: at least one mutation stayed green — an UNTESTED rule"
  exit 1
fi
echo "PROVEN-TO-FAIL: every mutation turned the probe red (rc=1)"
exit 0