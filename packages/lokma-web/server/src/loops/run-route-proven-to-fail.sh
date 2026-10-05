#!/usr/bin/env bash
# Proven-to-fail for the loop RUN ROUTE (REQ-201 slice 3).
#
# A 26-assertion suite proves nothing unless each rule under test is the ONLY
# reason its negative assertions go red. Each case below mutates ONE load-bearing
# behaviour, re-runs the probe, and requires the probe to FAIL — then restores
# the file byte-for-byte (md5 verified).
#
# Usage: bash src/loops/run-route-proven-to-fail.sh
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$REPO_ROOT" || exit 2
if [ ! -f packages/lokma-web/server/src/loops/run-route.test.ts ]; then
  echo "REPO_ROOT is wrong: $REPO_ROOT" >&2
  exit 2
fi

ROUTE="packages/lokma-web/server/src/routes/loops.ts"
WS="packages/lokma-web/server/src/routes/ws.ts"
PROBE="packages/lokma-web/server/src/loops/run-route.test.ts"

BACKUP_DIR="$(mktemp -d)"
trap 'rm -rf "$BACKUP_DIR"' EXIT

# ONE argument: the repo-relative path. The backup name is derived from it, so
# a caller can never pair the wrong backup with a file (the earlier two-argument
# form took `$1`=backup, `$2`=target and every call site passed only one, so
# `set -u` killed the script and NOTHING was restored — a failing PTF run left
# the product files mutated on disk).
restore() {
  local target="$1"
  cp "$BACKUP_DIR/$(basename "$target")" "$target"
}

snapshot() {
  for f in "$ROUTE" "$WS" "$PROBE"; do md5sum "$f"; done > "$BACKUP_DIR/md5.orig"
  for f in "$ROUTE" "$WS" "$PROBE"; do cp "$f" "$BACKUP_DIR/$(basename "$f")"; done
}

verify_restore() {
  md5sum -c "$BACKUP_DIR/md5.orig" > /dev/null 2>&1 \
    && echo "  restored byte-for-byte OK" \
    || { echo "  RESTORE FAILED"; md5sum -c "$BACKUP_DIR/md5.orig"; exit 1; }
}

run_probe() {
  ( cd packages/lokma-web/server && HOME="$(mktemp -d)" timeout 180 bun src/loops/run-route.test.ts 2>&1 )
}

# Expect the probe to FAIL (rc 1). A mutation that leaves it green means the
# rule it targeted was never load-bearing. A mutation must PROVE it applied,
# or the run below measures nothing.
MARKER=""
# `$1` label, `$2` the file to restore if this case goes wrong.
# `local` assignments are SEPARATE from the expansion on purpose: `set -u` +
# `local x="$2"` expands `$2` where it does not exist yet (measured: "unbound
# variable" on the first case). Two statements, no cleverness.
expect_red() {
  local label="$1"
  local restore_target
  restore_target="${2:-}"
  # Every exit path restores: a failed mutation, a probe that stayed green and
  # a success all leave the tree byte-identical. The measured bug was a restore
  # keyed on a DOUBLE basename (`restore` already basenames its first arg), so
  # it silently copied nothing and a failing case left `routes/loops.ts`
  # mutated for the rest of the run.
  if [ ! -f "$MARKER" ]; then
    echo "  MUTATION DID NOT APPLY: '$label' — treating as FAILURE, not as a red"
    [ -n "$restore_target" ] && restore "$restore_target"
    FAILED=1
    return 1
  fi
  rm -f "$MARKER"
  local out rc
  out="$(run_probe)"; rc=$?
  local last
  last="$(printf '%s' "$out" | grep -E '^[0-9]+/[0-9]+ passed' | tail -1)"
  [ -n "$restore_target" ] && restore "$restore_target"
  if [ "$rc" -eq 0 ]; then
    echo "PROVEN-TO-FAIL BROKEN: '$label' left the probe GREEN ($last)"
    return 1
  fi
  echo "  red as required: $label ($last)"
  return 0
}

FAILED=0
export MARKER="$BACKUP_DIR/mutated"
snapshot

echo "# PTF 1: the background dispatch is removed — 202 with nothing behind it"
python3 - <<'PY'
from pathlib import Path
import os
MARKER = os.environ['MARKER']
p = Path('packages/lokma-web/server/src/routes/loops.ts')
s = p.read_text()
old = "    void runLoopTurn(id, {"
assert s.count(old) == 1, 'anchor missing'
s = s.replace(old, "    if (false) await runLoopTurn(id, {")
p.write_text(s)
Path(MARKER).write_text('ok')
print('MUTATED')
PY
expect_red "background dispatch" "$ROUTE" || FAILED=1

echo "# PTF 2: the in-flight 409 refusal is dropped (the UI sees two accepted runs)"
python3 - <<'PY'
from pathlib import Path
import os
MARKER = os.environ['MARKER']
p = Path('packages/lokma-web/server/src/routes/loops.ts')
s = p.read_text()
old = """    if (loop.status === 'running') {
      return loopErr(reply, new LoopError('already_running', 'a turn is already in flight — wait for it to finish', 409));
    }"""
assert s.count(old) == 1, 'anchor missing'
s = s.replace(old, "    // mutated: no in-flight refusal")
p.write_text(s)
Path(MARKER).write_text('ok')
print('MUTATED')
PY
expect_red "in-flight 409" "$ROUTE" || FAILED=1

echo "# PTF 3: a terminal loop is accepted again (history silently overwritten)"
python3 - <<'PY'
from pathlib import Path
import os
MARKER = os.environ['MARKER']
p = Path('packages/lokma-web/server/src/routes/loops.ts')
s = p.read_text()
old = """    if (loop.status === 'done' || loop.status === 'error') {
      return loopErr(reply, new LoopError('loop_terminal', `loop is ${loop.status} — start a new run instead (history is kept)`));
    }"""
assert s.count(old) == 1, 'anchor missing'
s = s.replace(old, "    // mutated: terminal loops are re-runnable")
p.write_text(s)
Path(MARKER).write_text('ok')
print('MUTATED')
PY
expect_red "terminal refusal" "$ROUTE" || FAILED=1

echo "# PTF 4: the turn runs BEFORE the response is built (payload is post-turn)"
python3 - <<'PY'
from pathlib import Path
import os
MARKER = os.environ['MARKER']
p = Path('packages/lokma-web/server/src/routes/loops.ts')
s = p.read_text()
# Rebuild the response body from the record the TURN produced, not the one the
# route read. A caller that reads the 202 body immediately would see the
# already-booked outcome, i.e. it looks synchronous.
old = "return reply.status(202).send({ accepted: true, loop, sessionId: loopSessionId(id) });"
assert s.count(old) == 1, 'anchor missing'
new = """const settled = await getLoopDetail(id).then((d) => d.loop);
    return reply.status(202).send({ accepted: true, loop: settled, sessionId: loopSessionId(id) });"""
s = s.replace(old, new)
# And make the route await, so the re-read happens after the turn.
s = s.replace("    void runLoopTurn(id, {", "    await runLoopTurn(id, {")
p.write_text(s)
Path(MARKER).write_text('ok')
print('MUTATED')
PY
expect_red "post-turn payload" "$ROUTE" || FAILED=1

echo "# PTF 5: the route stops using the shared session id helper"
python3 - <<'PY'
from pathlib import Path
import os
MARKER = os.environ['MARKER']
p = Path('packages/lokma-web/server/src/routes/loops.ts')
s = p.read_text()
old = "sessionId: loopSessionId(id) }"
assert s.count(old) == 1, 'anchor missing'
s = s.replace(old, "sessionId: 'sess_loop_bogus' }")
p.write_text(s)
Path(MARKER).write_text('ok')
print('MUTATED')
PY
expect_red "shared session id" "$ROUTE" || FAILED=1

echo "# PTF 6: the loop pump is replaced with a no-op (a second queue appears)"
python3 - <<'PY'
from pathlib import Path
import os
MARKER = os.environ['MARKER']
p = Path('packages/lokma-web/server/src/routes/ws.ts')
s = p.read_text()
old = "export async function pumpSessionRun(app: FastifyInstance, sessionId: string, cwd: string): Promise<void> {"
assert s.count(old) == 1, 'anchor missing'
s = s.replace(old, "export async function pumpSessionRun(app: FastifyInstance, sessionId: string, cwd: string): Promise<void> {\n  if (sessionId) return;")
p.write_text(s)
Path(MARKER).write_text('ok')
print('MUTATED')
PY
expect_red "shared queue pump" "$WS" || FAILED=1

verify_restore
echo
if [ "$FAILED" -eq 0 ]; then
  echo "PROVEN-TO-FAIL: all 6 mutations turned the probe red"
  exit 0
fi
echo "PROVEN-TO-FAIL: at least one mutation stayed green — a rule is untested"
exit 1