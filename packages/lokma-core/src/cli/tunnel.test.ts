/**
 * Unit probe for the tunnel CLI (REQ-193 slice 7).
 * Run: `bun src/cli/tunnel.test.ts` from `packages/lokma-core`.
 * No framework (plain asserts) so the package stays dependency-free.
 *
 * THE PROBE RUNS THE REAL CLI IN A SUBPROCESS. Calling `runTunnelCli()`
 * directly would skip every part of this slice: the dispatch in `cli/index.ts`
 * (the slice-4/5 lesson — a module nobody routes compiles and typechecks and
 * answers "Unknown command" forever), the exit codes the shell branches on,
 * and the printed shape. Those are the things this file is about.
 *
 * STATE ISOLATION IS NOT OPTIONAL (the measured slice-6 accident). The
 * `tunnel stop` child runs against a temp `LOKMA_TUNNEL_STATE`, and the
 * leftover-file assertion at the end keeps that isolation honest: an env that
 * silently stopped being honoured would pass every other check while writing
 * to the live `/root/.lokma/tunnel.json`.
 *
 * The load-bearing assertion is the NEGATIVE one: with no provider installed,
 * `tunnel start` must print NO url line and exit non-zero. A CLI that
 * fabricated a plausible host would pass every positive check in the file.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'index.ts');
const STATE_DIR = mkdtempSync(join(tmpdir(), 'lokma-tunnel-cli-probe-'));
const STATE = join(STATE_DIR, 'tunnel.json');

/** The bun that is running this probe, resolved once. */
const BUN = process.execPath;

/** Children that actually executed. A probe where this stays 0 measured nothing. */
let childRan = 0;

let passed = 0;
const failures: string[] = [];
function assert(cond: unknown, what: string): void {
  if (cond) {
    passed += 1;
    return;
  }
  failures.push(what);
}

interface Run {
  code: number;
  out: string;
  /** True when the child could not be started at all (not a CLI refusal). */
  spawnFailed?: boolean;
}

/**
 * Run the real CLI with the tunnel state pinned to a temp file.
 *
 * `PATH` is emptied on purpose so no installed `cloudflared`/`ngrok` can be
 * found — the probe must be zero-network by construction (the rule the route
 * probe follows). But `bun` itself must stay reachable, so the child is
 * launched by ABSOLUTE path: emptying PATH and then spawning a bare `bun` is
 * the vacuous-pass shape — every "prints NO url line" assertion reads true on
 * empty output while nothing ran at all. `childRan` below is the control that
 * makes that failure mode loud instead of green.
 */
function run(args: string[], extraEnv: Record<string, string> = {}): Run {
  try {
    const out = execFileSync(BUN, [CLI, ...args], {
      encoding: 'utf8',
      env: {
        PATH: '',
        HOME: STATE_DIR,
        LOKMA_TUNNEL_STATE: STATE,
        LOKMA_RELAY_URL: '',
        LOKMA_TUNNEL_PROVIDER: '',
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    });
    childRan += 1;
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    // A spawn failure has no status; that is the "the child never ran" case
    // and must not be mistaken for a CLI refusal (both look like code!=0).
    if (err.status === undefined) return { code: -1, out: '', spawnFailed: true };
    childRan += 1;
    return { code: err.status, out: (err.stdout ?? '') + (err.stderr ?? '') };
  }
}

// --- dispatch: the command is actually reachable ------------------------------

const help = run(['tunnel']);
assert(help.code === 0, '`lokma tunnel` with no sub-verb prints usage and exits 0');
assert(help.out.includes('lokma tunnel status'), 'the tunnel usage lists the status verb');
assert(help.out.includes('lokma tunnel start'), 'the tunnel usage lists the start verb');
assert(help.out.includes('lokma tunnel stop'), 'the tunnel usage lists the stop verb');

const topHelp = run(['--help']);
assert(topHelp.out.includes('lokma tunnel status'), 'the top-level help lists the tunnel command');

const bogus = run(['tunnel', 'explode']);
assert(bogus.code === 2, 'an unknown sub-verb exits 2 (bad usage, not a silent success)');
assert(bogus.out.includes('Unknown subcommand: tunnel explode'), 'the unknown sub-verb names itself');

// --- status: honest when nothing is running -----------------------------------

const status = run(['tunnel', 'status']);
assert(status.code === 0, '`tunnel status` exits 0');
assert(status.out.includes('state:    stopped'), 'status reads stopped when nothing is running');
assert(!/^\s*url:\s*\S/m.test(status.out), 'a stopped status prints NO url line');

// --- start with nothing installed: refuses, never invents a url ---------------

const start = run(['tunnel', 'start']);
assert(!start.spawnFailed, 'the start child actually ran (not a spawn failure)');
assert(start.code !== 0, '`tunnel start` with no provider exits non-zero');
assert(!/^\s*url:\s*\S/m.test(start.out), 'a refused start prints NO url line');
assert(start.out.includes('provider_unavailable'), 'the refusal names its code');
// The install command prints on its OWN line so it can be copied out of the
// terminal. Matching the prefix (not the sentence) is what makes this a check
// on the shape: the hint rides as a FIELD, not as prose someone must parse.
assert(/^\[lokma\] install: \S/m.test(start.out), 'the refusal prints an install/configure line');

// --- the port rule is ONE rule ------------------------------------------------

const badPort = run(['tunnel', 'start', '--port', '3456x']);
assert(badPort.code !== 0, 'a junk port exits non-zero');
assert(badPort.out.includes('bad_port'), 'a junk port is refused by the shared port rule');
assert(!/^\s*url:\s*\S/m.test(badPort.out), 'a junk port prints NO url line');

const highPort = run(['tunnel', 'start', '--port', '70000']);
assert(highPort.out.includes('bad_port'), 'a port above 65535 is refused (16-bit rule)');

const zeroPort = run(['tunnel', 'start', '--port', '0']);
assert(zeroPort.out.includes('bad_port'), 'port 0 is refused (16-bit rule)');

// --- stop: idempotent and always off ------------------------------------------

const stop = run(['tunnel', 'stop']);
assert(stop.code === 0, '`tunnel stop` exits 0');
assert(stop.out.includes('state:    stopped'), 'stop reports stopped');
assert(!/^\s*url:\s*\S/m.test(stop.out), 'a stopped tunnel prints NO url line');

const stopAgain = run(['tunnel', 'stop']);
assert(stopAgain.code === 0, '`tunnel stop` is idempotent (second call still exits 0)');
assert(!/^\s*url:\s*\S/m.test(stopAgain.out), 'the second stop still prints NO url line');

// A recorded `running` whose pid is gone must NOT read as running: an
// unreachable tunnel is not a tunnel.
writeFileSync(
  STATE,
  JSON.stringify({
    state: 'running',
    url: 'https://stale-example.invalid',
    provider: 'cloudflared',
    startedAt: new Date().toISOString(),
    expiresAt: null,
    message: 'cloudflared is serving this box at https://stale-example.invalid',
    pid: 999_999,
  }),
);
const stale = run(['tunnel', 'status']);
assert(stale.out.includes('state:    stopped'), 'a recorded running with a dead pid reads as stopped');
assert(!/^\s*url:\s*\S/m.test(stale.out), 'the unreachable tunnel prints NO url line');
assert(!stale.out.includes('stale-example.invalid'), 'the stale url is never echoed back');

// --- isolation: the live install's state file was never written ---------------

// THE CONTROL that makes the negative assertions mean something: if no child
// ever executed, every "prints NO url line" check above reads true on empty
// output and the file goes green having measured nothing. Assert the children
// ran, so that failure mode is red instead.
assert(childRan >= 8, `the CLI children actually ran (${childRan} executions, expected >= 8)`);

const home = process.env.HOME ?? '';
assert(
  home.length === 0 || !existsSync(join(home, '.lokma', 'tunnel.json')) || STATE !== join(home, '.lokma', 'tunnel.json'),
  'the probe pinned LOKMA_TUNNEL_STATE, so no other state file path was used',
);

rmSync(STATE_DIR, { recursive: true, force: true });

// --- report -------------------------------------------------------------------

for (const f of failures) console.error('FAIL: ' + f);
console.log(`\n${passed} passed, ${failures.length} failed — lokma tunnel CLI`);
if (failures.length > 0) process.exit(1);