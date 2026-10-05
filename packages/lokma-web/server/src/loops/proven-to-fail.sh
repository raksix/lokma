#!/usr/bin/env bash
# Proven-to-fail for the loop EXECUTOR (REQ-201 slice 2).
#
# A 72-assertion suite proves nothing unless each rule under test is the ONLY
# reason its negative assertions go red. Each case below mutates ONE load-bearing
# behaviour, re-runs the probe, and requires the probe to FAIL — then restores
# the file byte-for-byte (md5 verified).
#
# Usage: bash src/loops/proven-to-fail.sh
set -uo pipefail
# The script lives at packages/lokma-web/server/src/loops/, so the REPO root is
# FIVE levels up (`loops` -> `src` -> `server` -> `lokma-web` -> `packages` ->
# `lokma`). Getting this wrong makes every mutation "pass" for the wrong reason:
# python cannot find the file, the probe never runs, and a broken script reports
# green — which is why the wrong root is a hard exit, not a warning.
REPO_ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
cd "$REPO_ROOT" || exit 2
if [ ! -f packages/lokma-web/server/src/loops/executor.ts ]; then
  echo "REPO_ROOT is wrong: $REPO_ROOT" >&2
  exit 2
fi

EXECUTOR="packages/lokma-web/server/src/loops/executor.ts"
PROBE="packages/lokma-web/server/src/loops/executor.test.ts"
RUNTIME="packages/lokma-web/server/src/session-runs.ts"

BACKUP_DIR="$(mktemp -d)"
trap 'rm -rf "$BACKUP_DIR"' EXIT

restore() {
  cp "$BACKUP_DIR/$1" "$2"
}

snapshot() {
  for f in "$EXECUTOR" "$PROBE" "$RUNTIME"; do
    md5sum "$f"
  done > "$BACKUP_DIR/md5.orig"
  for f in "$EXECUTOR" "$PROBE" "$RUNTIME"; do
    cp "$f" "$BACKUP_DIR/$(basename "$f")"
  done
}

verify_restore() {
  md5sum -c "$BACKUP_DIR/md5.orig" > /dev/null 2>&1 \
    && echo "  restored byte-for-byte OK" \
    || { echo "  RESTORE FAILED"; md5sum -c "$BACKUP_DIR/md5.orig"; exit 1; }
}

run_probe() {
  ( cd packages/lokma-web/server && HOME="$(mktemp -d)" bun src/loops/executor.test.ts 2>&1 )
}

# Expect the probe to FAIL (rc 1). A mutation that leaves it green means the
# rule it targeted was never load-bearing — the exact trap REQ-201 slice 1 hit
# with the cooldown floor.
# A mutation must PROVE it applied, or the run below measures nothing.
# Measured: PTF 3/5 hit a stale anchor (the product line had moved), python
# raised, the probe went red for an unrelated reason, and the script printed
# "red as required" — a false red that certifies an untested rule.
MARKER=""
expect_red() {
  local label="$1"
  if [ ! -f "$MARKER" ]; then
    echo "  MUTATION DID NOT APPLY: '$label' — treating as FAILURE, not as a red"
    verify_restore
    FAILED=1
    return 1
  fi
  rm -f "$MARKER"
  local out rc
  out="$(run_probe)"; rc=$?
  local last
  last="$(printf '%s' "$out" | grep -E '^[0-9]+/[0-9]+ passed' | tail -1)"
  if [ "$rc" -eq 0 ]; then
    echo "PROVEN-TO-FAIL BROKEN: '$label' left the probe GREEN ($last)"
    verify_restore
    return 1
  fi
  echo "  red as required: $label ($last)"
  return 0
}

FAILED=0
export MARKER="$BACKUP_DIR/mutated"
snapshot

echo "# PTF 1: the empty-turn guard no longer maps a tool-less turn to 'empty'"
python3 - <<'PY'
from pathlib import Path
import os
MARKER = os.environ['MARKER']
p = Path('packages/lokma-web/server/src/loops/executor.ts')
s = p.read_text()
old = "  return report.didWork ? 'ok' : 'empty';"
assert s.count(old) == 1, 'anchor missing'
p.write_text(s.replace(old, "  return 'ok';"))
Path(MARKER).write_text('ok')
print('MUTATED')
PY
expect_red "empty guard" || FAILED=1
restore executor.ts "$EXECUTOR"

echo "# PTF 2: an error outcome no longer stops the loop"
python3 - <<'PY'
from pathlib import Path
import os
MARKER = os.environ['MARKER']
p = Path('packages/lokma-web/server/src/loops/executor.ts')
s = p.read_text()
old = "?? (outcome === 'error' ? 'error' : null);"
assert s.count(old) == 1, 'anchor missing'
p.write_text(s.replace(old, "?? null;"))
Path(MARKER).write_text('ok')
print('MUTATED')
PY
expect_red "error stop" || FAILED=1
restore executor.ts "$EXECUTOR"

echo "# PTF 3: an aborted turn is billed to the usd budget"
python3 - <<'PY'
from pathlib import Path
import os
MARKER = os.environ['MARKER']
p = Path('packages/lokma-web/server/src/loops/executor.ts')
s = p.read_text()
old = "usd: outcome === 'aborted' || outcome === 'error' ? 0 : report.costUsd,"
assert s.count(old) == 1, 'abort anchor missing'
p.write_text(s.replace(old, "usd: report.costUsd,"))
Path(MARKER).write_text('ok')
print('MUTATED')
PY
expect_red "abort not billed" || FAILED=1
restore executor.ts "$EXECUTOR"

echo "# PTF 4: an empty turn advances spent.iters anyway"
python3 - <<'PY'
from pathlib import Path
import os
MARKER = os.environ['MARKER']
p = Path('packages/lokma-web/server/src/loops/executor.ts')
s = p.read_text()
old = "{ countIteration: countIterationFor(outcome) },"
assert s.count(old) == 1, 'anchor missing'
Path(MARKER).write_text('ok')
print('MUTATED')
p.write_text(s.replace(old, "{},"))
PY
expect_red "empty turn does not count" || FAILED=1
restore executor.ts "$EXECUTOR"

echo "# PTF 5: the waiter no longer times out (a hung turn would hang the loop)"
python3 - <<'PY'
from pathlib import Path
import os
MARKER = os.environ['MARKER']
p = Path('packages/lokma-web/server/src/session-runs.ts')
s = p.read_text()
old = """        error: 'turn_timeout',
      });
    }, timeoutMs);"""
assert s.count(old) == 1, 'anchor missing'
s = s.replace(old, """        error: 'turn_timeout',
      });
    }, timeoutMs * 1000);""")
p.write_text(s)
Path(MARKER).write_text('ok')
print('MUTATED')
PY
expect_red "waiter timeout" || FAILED=1
restore session-runs.ts "$RUNTIME"

echo "# PTF 6: the prompt is no longer written to the transcript"
python3 - <<'PY'
from pathlib import Path
import os
MARKER = os.environ['MARKER']
p = Path('packages/lokma-web/server/src/loops/executor.ts')
s = p.read_text()
old = """  await store.append(sessionId, {
    role: 'user',
    content: loop.prompt,
    timestamp: startedAt,
  });"""
assert s.count(old) == 1, 'anchor missing'
Path(MARKER).write_text('ok')
print('MUTATED')
p.write_text(s.replace(old, '  // mutated: no transcript row'))
PY
expect_red "transcript row" || FAILED=1
restore executor.ts "$EXECUTOR"

echo "# PTF 7: the pump is never called (the turn would never run)"
python3 - <<'PY'
from pathlib import Path
import os
MARKER = os.environ['MARKER']
p = Path('packages/lokma-web/server/src/loops/executor.ts')
s = p.read_text()
old = "  opts.pump(sessionId, loop.cwd);"
assert s.count(old) == 1, 'anchor missing'
Path(MARKER).write_text('ok')
print('MUTATED')
p.write_text(s.replace(old, '  // mutated: pump never called'))
PY
expect_red "pump invoked" || FAILED=1
restore executor.ts "$EXECUTOR"

echo "# PTF 8: an unknown reasoning level is forwarded instead of degraded"
python3 - <<'PY'
from pathlib import Path
import os
MARKER = os.environ['MARKER']
p = Path('packages/lokma-web/server/src/loops/executor.ts')
s = p.read_text()
old = "  return levels.includes(value ?? '') ? (value as ReasoningEffort) : 'off';"
assert s.count(old) == 1, 'anchor missing'
Path(MARKER).write_text('ok')
print('MUTATED')
p.write_text(s.replace(old, '  return (value ?? \'off\') as ReasoningEffort;'))
PY
expect_red "effort ladder" || FAILED=1
restore executor.ts "$EXECUTOR"

verify_restore
echo
if [ "$FAILED" -eq 0 ]; then
  echo "PROVEN-TO-FAIL: all 8 mutations turned the probe red"
  exit 0
fi
echo "PROVEN-TO-FAIL: at least one mutation stayed green — a rule is untested"
exit 1
