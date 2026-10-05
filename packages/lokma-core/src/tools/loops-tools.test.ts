/**
 * REQ-201 kapsam 4 probe — the `loop_list` / `loop_create` agent tools against
 * the REAL loop store. Run: `bun src/tools/loops-tools.test.ts` from
 * `packages/lokma-core`.
 *
 * Same isolated-HOME child pattern as the wave-1/3/4 probes: bun snapshots
 * `os.homedir()` at startup, so the loop store needs a child process with HOME
 * moved. The temp-HOME guard is load-bearing — with the real HOME this probe
 * writes loop records into the live `~/.lokma/loops/` and its cwd locks into
 * the real agents lock dir.
 *
 * The rules under test, and WHY each assertion exists (a check that cannot
 * fail is worse than no check):
 *
 *  1. Catalog registration — both names come from the surface catalog, so the
 *     gate sets derive them instead of accidentally falling into the
 *     non-read branch. `loop_create` MUST be `write`.
 *  2. `origin: 'agent'` is STAMPED, not defaulted — the console must be able
 *     to say whose loop this is without asking the model.
 *  3. Creating is NOT starting — a `draft` record, `startedAt: null`, and the
 *     cwd lock NOT held. An agent that creates a background loop must not
 *     silently start spending tokens.
 *  4. The return carries `nextStep` — a tool result that leaves the caller
 *     with nothing to do is the same hole as a refusal without a command.
 *  5. A second live loop in one cwd is refused BY NAME (kapsam 5) — the store
 *     only claims the lock at `draft → running`, so without this check two
 *     drafts would collide later at the worst moment with only a lock id.
 *  6. Terminal loops never block: a `done` loop keeps its history and a new
 *     run in the same directory is the normal way forward.
 *  7. A live AGENT lock in the cwd is also a refusal (name the holder) — the
 *     agent/loop collision is REQ-062's, not a second one.
 *  8. Path spelling is normalized: `~/x/` and `/root/x` are ONE directory.
 *  9. Failures are `{ ok: false, code, message }`, never a silent no-op, and
 *     the refusal message names the blocker plus what to do next.
 */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { READ_TOOLS, WRITE_TOOLS, decideToolCall } from './gate';
import { LOOP_TOOL_NAMES, buildLoopTools } from './loops-tools';
import { acquireLoopCwd, listLoops, releaseLoopCwd } from '../loops/index';
import { createAgent } from '../agents/registry';
import type { ToolDefinition } from './registry';

const CHILD_ENV = 'LOKMA_LOOP_TOOLS_TEST_CHILD';
if (process.env[CHILD_ENV] !== '1') {
  const tmpHome = mkdtempSync(join(tmpdir(), 'lokma-loop-tools-home-'));
  if (!tmpHome.startsWith('/tmp/')) {
    console.error('REFUSING: temp HOME is not under /tmp — this probe would write into the live ~/.lokma');
    process.exit(1);
  }
  const env: Record<string, string | undefined> = { ...process.env, HOME: tmpHome, [CHILD_ENV]: '1' };
  const STRIP = /_API_KEY$|^(ANTHROPIC|OPENAI|DEEPSEEK|OPENROUTER|OPENCODE|GEMINI)_/;
  for (const k of Object.keys(env)) {
    if (STRIP.test(k)) delete env[k];
  }
  const res = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env, stdio: 'inherit' });
  rmSync(tmpHome, { recursive: true, force: true });
  // NOTE: this Bun fills `res.error` even on a plain non-zero exit — never
  // throw it; the child's status is the verdict.
  process.exit(res.status ?? 1);
}

let passed = 0;
let failed = 0;
function check(cond: boolean, label: string): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${label}`);
  }
}

type ToolResult = Record<string, unknown>;
const AUTO = { allow: [], deny: [], defaultMode: 'auto' as const };
const PLAN = { allow: [], deny: [], defaultMode: 'plan' as const };

// Real directories under the temp HOME, so cwd validation has something to
// validate (the store requires an existing absolute directory).
const WORK = join(process.env.HOME ?? '', 'work');
const OTHER = join(process.env.HOME ?? '', 'other');
await mkdir(WORK, { recursive: true });
await mkdir(OTHER, { recursive: true });

// ── Gate + catalog ────────────────────────────────────────────────────────
check(READ_TOOLS.has('loop_list'), 'loop_list is in READ_TOOLS (auto-runs, allowed in plan)');
check(WRITE_TOOLS.has('loop_create'), 'loop_create is in WRITE_TOOLS (asks in auto)');
check(!READ_TOOLS.has('loop_create'), 'loop_create is NOT a read');
check(decideToolCall(AUTO, 'loop_list') === 'allow', 'auto: loop_list runs');
check(decideToolCall(AUTO, 'loop_create') === 'ask', 'auto: loop_create asks first');
check(decideToolCall(PLAN, 'loop_create') === 'deny', 'plan: loop_create refused outright');
check(decideToolCall(PLAN, 'loop_list') === 'allow', 'plan: loop_list still allowed');

const tools = buildLoopTools();
check(tools.map((t) => t.name).join(',') === LOOP_TOOL_NAMES.join(','), 'builder exposes the catalog names in order');
const byName = new Map(tools.map((t) => [t.name, t]));
check(byName.get('loop_list')?.readOnly === true, 'loop_list is readOnly');
check(byName.get('loop_create')?.readOnly !== true, 'loop_create is not readOnly');
check((byName.get('loop_create')?.maxResultSizeChars ?? 0) > 0, 'loop_create declares its output budget');
for (const tool of tools) {
  check(typeof tool.description === 'string' && tool.description.length > 40, `description is a real sentence: ${tool.name}`);
  check(
    !tool.description.includes('loop_list') && !tool.description.includes('loop_create'),
    `no cross-tool reference in schema: ${tool.name}`,
  );
}

async function call(name: string, input: unknown): Promise<ToolResult> {
  const tool = byName.get(name) as ToolDefinition;
  const result = await tool.handler(input, {} as never);
  return result as ToolResult;
}

// ── 2/3/4: an agent-made loop is a draft, stamped, with a next step ───────
const emitted: Array<{ action: string; loopId?: string; loopName?: string }> = [];
const withEmit = buildLoopTools({ emit: (p) => emitted.push(p) });
const emitByName = new Map(withEmit.map((t) => [t.name, t]));
const createInput = { name: 'Lint sweep', cwd: WORK, prompt: 'Run the linter and fix what it reports.' };
const created = (await (emitByName.get('loop_create') as ToolDefinition).handler(createInput, {} as never)) as ToolResult;

check(created.ok === true, 'loop_create succeeds on a free directory');
check(typeof created.loopId === 'string' && String(created.loopId).startsWith('l_'), 'the loop id is server-minted');
check(created.status === 'draft', `creating is not starting (status=${String(created.status)})`);
check(typeof created.nextStep === 'string' && String(created.nextStep).length > 0, 'the answer carries a next step');
const loopId = String(created.loopId);
const record = (await listLoops()).find((l) => l.id === loopId);
check(record !== undefined, 'the record exists in the store');
check(record?.origin === 'agent', `origin is stamped as agent (got ${String(record?.origin)})`);
check(record?.startedAt === null, 'a draft has never started');
check(record?.spent.iters === 0 && record?.spent.usd === 0, 'a draft spent nothing');
check(emitted.length === 1 && emitted[0]?.action === 'open_loop' && emitted[0].loopId === loopId, 'exactly one open_loop frame carrying the id');

const summary = (created.loop ?? {}) as Record<string, unknown>;
check(summary.origin === 'agent', 'the returned summary reports the agent origin');
check(summary.name === 'Lint sweep', 'the returned summary carries the name');

// 3: creating must NOT claim the cwd — the lock belongs to the first RUN.
const liveLock = (await acquireLoopCwd('l_probe', WORK)).ok;
check(liveLock === true, 'probe can take the lock, so the free check below is meaningful');
await releaseLoopCwd('l_probe', WORK);
check(record?.cwd === WORK, 'the record stores the resolved cwd');

// ── 5: a second live loop in one cwd is refused BY NAME ───────────────────
const second = (await (emitByName.get('loop_create') as ToolDefinition).handler(
  { ...createInput, name: 'Second sweep' },
  {} as never,
)) as ToolResult;
check(second.ok === false, 'a second live loop in the same cwd is refused');
check(second.code === 'cwd_locked', `the refusal is cwd_locked (got ${String(second.code)})`);
check(String(second.message).includes('Lint sweep'), 'the refusal NAMES the loop that already works there');
check(String(second.message).includes('l_probe') === false, 'the refusal does not leak an unrelated id');
check(emitted.length === 1, 'a refused create emits no frame (the loop was never made)');
check((await listLoops()).length === 1, 'the refused create wrote no second record');

// ── 6: a TERMINAL loop does not block the directory ───────────────────────
const terminal = (await (emitByName.get('loop_create') as ToolDefinition).handler(
  { name: 'Lapsed', cwd: OTHER, prompt: 'Old work.' },
  {} as never,
)) as ToolResult;
const terminalId = String(terminal.loopId);
await call('loop_list', {}) as ToolResult;
// Flip the first loop to `done` through the store's own status path — NOT by
// editing state.json, so the fixture stays honest about what the runtime writes.
const { setLoopStatus } = await import('../loops/store');
await setLoopStatus(loopId, 'running');
await setLoopStatus(loopId, 'done');
const afterDone = (await (emitByName.get('loop_create') as ToolDefinition).handler(
  { name: 'Fresh start', cwd: WORK, prompt: 'New work in the same directory.' },
  {} as never,
)) as ToolResult;
check(afterDone.ok === true, `a done loop does not block its directory (got ${String(afterDone.code ?? 'ok')}: ${String(afterDone.message ?? '')})`);
check(afterDone.loopId !== loopId, 'the new loop is a NEW record, not the terminal one resurrected');
const afterDoneId = String(afterDone.loopId);
await setLoopStatus(terminalId, 'running');
await setLoopStatus(terminalId, 'done');
const secondLapsed = (await (emitByName.get('loop_create') as ToolDefinition).handler(
  { name: 'Second lapsed', cwd: OTHER, prompt: 'More old work.' },
  {} as never,
)) as ToolResult;
check(secondLapsed.ok === true, `a done loop in the second directory does not block either (got ${String(secondLapsed.code ?? 'ok')})`);

// ── 7: a live AGENT lock is a refusal too, named ──────────────────────────
const AGENT_CWD = join(process.env.HOME ?? '', 'agent-owned');
await mkdir(AGENT_CWD, { recursive: true });
const agent = await createAgent({ name: 'loop-probe-agent', cwd: AGENT_CWD } as never);
const { acquire, release } = await import('../agents/locks');
const agentLock = await acquire(AGENT_CWD, agent.id, 10 * 60_000, 'probe');
check(agentLock.ok === true, 'probe could take the agent lock, so the refusal below is real');
const agentBlocked = (await (emitByName.get('loop_create') as ToolDefinition).handler(
  { name: 'Trespass', cwd: AGENT_CWD, prompt: 'Work in a busy directory.' },
  {} as never,
)) as ToolResult;
check(agentBlocked.ok === false && agentBlocked.code === 'cwd_locked', 'an agent-held directory refuses a new loop');
check(String(agentBlocked.message).includes(agent.id), 'the refusal names the holding agent');
await release(AGENT_CWD, agent.id);
const afterRelease = (await (emitByName.get('loop_create') as ToolDefinition).handler(
  { name: 'Free again', cwd: AGENT_CWD, prompt: 'Work after the agent left.' },
  {} as never,
)) as ToolResult;
check(afterRelease.ok === true, `a released lock unblocks the directory (got ${String(afterRelease.message ?? '')})`);

// ── 8: path spelling is normalized before comparing ───────────────────────
const TRAILING = WORK.endsWith('/') ? WORK : `${WORK}/`;
const spaced = (await (emitByName.get('loop_create') as ToolDefinition).handler(
  { name: 'Trailing slash', cwd: TRAILING, prompt: 'Same directory, different spelling.' },
  {} as never,
)) as ToolResult;
// `Lapsed`/`Fresh start` in OTHER are done; WORK holds one DONE loop (the
// first) and one live one (afterDoneId), so the trailing-slash spelling must
// collide with the live one — normalization is what makes it.
check(spaced.ok === false && spaced.code === 'cwd_locked', `a trailing slash is the SAME directory (got ok=${String(spaced.ok)})`);
const tildeSpelling = (await (emitByName.get('loop_create') as ToolDefinition).handler(
  { name: 'Tilde spelling', cwd: `~/${WORK.replace(`${process.env.HOME ?? ''}/`, '')}`, prompt: 'Home-relative spelling.' },
  {} as never,
)) as ToolResult;
check(tildeSpelling.ok === false && tildeSpelling.code === 'cwd_locked', 'a `~`-relative spelling is the SAME directory');

// ── 9: failures are typed refusals, never silent no-ops ───────────────────
// `createLoop` deliberately does NOT require the directory to exist — the cwd
// is validated for shape/absolute-ness and the lock layer normalises it, so a
// project-scoped loop can be drafted for a directory the user has not created
// yet. Measured, not assumed: this asserts the record IS created, so the
// earlier version of this check (asserting a refusal) was a red that read as a
// product defect while the product was right.
const notThere = join(process.env.HOME ?? '', 'not-created-yet');
const draftsFirst = (await (emitByName.get('loop_create') as ToolDefinition).handler(
  { name: 'Drafts ahead of the directory', cwd: notThere, prompt: 'Work in a directory that does not exist yet.' },
  {} as never,
)) as ToolResult;
check(draftsFirst.ok === true, `a not-yet-created cwd still drafts (got ${String(draftsFirst.code ?? 'ok')})`);
check((await listLoops()).some((l) => l.id === draftsFirst.loopId), 'that draft is on disk');
// The refusal the tool DOES owe: a cwd that is not a usable path at all.
// `bad_cwd`, not `bad_input`: whitespace survives Zod's `min(1)` and the
// store's own shape guard is the authority on paths, so the typed code the
// caller sees is the specific one.
const badCwd = (await (emitByName.get('loop_create') as ToolDefinition).handler(
  { name: 'Nowhere', cwd: '   ', prompt: 'A blank directory.' },
  {} as never,
)) as ToolResult;
check(badCwd.ok === false, 'a blank cwd is refused, not created');
check(badCwd.code === 'bad_cwd', `the blank cwd is a bad_cwd (got ${String(badCwd.code)})`);
check(typeof badCwd.message === 'string' && String(badCwd.message).length > 0, 'the refusal carries a message');

const badTrigger = (await (emitByName.get('loop_create') as ToolDefinition).handler(
  { ...createInput, cwd: OTHER, name: 'Bad trigger', trigger: { kind: 'interval' } },
  {} as never,
)) as ToolResult;
check(badTrigger.ok === false, 'an interval trigger with no number is refused (it would never repeat)');
check(String(badTrigger.code).length > 0, 'the bad trigger names a code');

const missingName = (await (emitByName.get('loop_create') as ToolDefinition).handler(
  { cwd: OTHER, prompt: 'No name given.' },
  {} as never,
)) as ToolResult;
check(missingName.ok === false && missingName.code === 'bad_input', 'a missing name is a bad_input, not a crash');

// ── loop_list: shapes the agent can decide on ─────────────────────────────
const listed = (await call('loop_list', {})) as ToolResult;
check(listed.ok === true, 'loop_list succeeds');
const rows = (listed.loops ?? []) as Array<Record<string, unknown>>;
check(typeof listed.count === 'number' && listed.count === rows.length, 'count matches the row count');
check(rows.length >= 3, `loop_list actually returns rows (got ${rows.length})`);
const first = rows[0] as Record<string, unknown>;
for (const field of ['id', 'name', 'cwd', 'status', 'origin', 'trigger', 'iters', 'usd']) {
  check(Object.prototype.hasOwnProperty.call(first, field), `row carries ${field}`);
}
check(String(first.iters).includes('/'), 'iters is reported as spent/budget, not a bare number');
check(rows.every((r) => r.origin === 'agent' || r.origin === 'user'), 'every row reports its origin');

// Filtering: `-` means project-less (the route's spelling).
const projectless = (await call('loop_list', { projectId: '-' })) as ToolResult;
check(projectless.ok === true, 'loop_list accepts the project-less filter');
const scoped = (await call('loop_list', { projectId: 'no-such-project' })) as ToolResult;
check(scoped.ok === true && ((scoped.loops ?? []) as unknown[]).length === 0, 'an unknown project filters to zero, not an error');

// ── Emitting is OPTIONAL: a CLI host without a UI still answers ───────────
// A duplicate call on the same directory would prove nothing here (the refusal
// answers either way), so this uses a FRESH directory: the assertion has to
// distinguish "worked without a UI" from "refused", and only a free directory
// can tell them apart.
const noEmit = buildLoopTools();
const HEADLESS = join(process.env.HOME ?? '', 'headless');
await mkdir(HEADLESS, { recursive: true });
const headless = (await (noEmit.find((t) => t.name === 'loop_create') as ToolDefinition).handler(
  { name: 'Headless', cwd: HEADLESS, prompt: 'No UI attached.' },
  {} as never,
)) as ToolResult;
check(headless.ok === true, `a headless create works without a UI frame (got ${String(headless.message ?? '')})`);
check(headless.loopId !== undefined, 'the headless answer still carries the id the caller needs');
// Negative control: the SAME call DOES refuse a taken directory, so a pass
// above cannot be the "always ok" answer.
const headlessBlocked = (await (noEmit.find((t) => t.name === 'loop_create') as ToolDefinition).handler(
  { name: 'Headless two', cwd: HEADLESS, prompt: 'Same directory.' },
  {} as never,
)) as ToolResult;
check(headlessBlocked.ok === false && headlessBlocked.code === 'cwd_locked', 'the negative control really refuses');
void writeFile;

// ── Disk is the real store, not a fixture ────────────────────────────────
const onDisk = (await listLoops()).length;
check(onDisk === rows.length + 1, `the probe's creates are the rows the tool listed (disk=${onDisk}, listed=${rows.length})`);

console.log(`REQ-201 loop tools: ${passed}/${passed + failed} checks passed`);
if (failed > 0) process.exit(1);