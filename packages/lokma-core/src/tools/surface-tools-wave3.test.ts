/**
 * REQ-181 wave-3 surface-tool probe — Git + Providers/Models + Usage tool
 * families against REAL stores. Same isolated-HOME child pattern as
 * surface-tools.test.ts: bun snapshots `os.homedir()` at startup, so the
 * global config + credentials + usage ledger need a child process with HOME
 * moved. Provider env keys are stripped in the child so `model_probe` can
 * never reach a real upstream; the probe runs against a local SSE stub.
 * Run: `bun src/tools/surface-tools-wave3.test.ts` from `packages/lokma-core`.
 */
import { strict as assert } from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { READ_TOOLS, WRITE_TOOLS, decideToolCall } from './gate';
import { GIT_TOOL_NAMES, buildGitTools } from './git-tools';
import { PROVIDER_TOOL_NAMES, buildProviderTools } from './provider-tools';
import { USAGE_TOOL_NAMES, buildUsageTools } from './usage-tools';
import { UsageLedger } from '../usage/ledger';
import type { ToolDefinition } from './registry';

const CHILD_ENV = 'LOKMA_SURFACE_WAVE3_TEST_CHILD';
if (process.env[CHILD_ENV] !== '1') {
  const tmpHome = mkdtempSync(join(tmpdir(), 'lokma-wave3-home-'));
  const env: Record<string, string | undefined> = { ...process.env, HOME: tmpHome, [CHILD_ENV]: '1' };
  // No provider credentials leak into the child — the probe path must not
  // be able to reach a real upstream (stub server only).
  const STRIP = /_API_KEY$|^(ANTHROPIC|OPENAI|DEEPSEEK|OPENROUTER|OPENCODE|GEMINI)_/;
  for (const k of Object.keys(env)) {
    if (STRIP.test(k)) delete env[k];
  }
  const res = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env, stdio: 'inherit' });
  rmSync(tmpHome, { recursive: true, force: true });
  // NOTE: this Bun fills `res.error` even when the child merely exits
  // non-zero — never throw it; the child's status is the verdict.
  process.exit(res.status ?? 1);
}

let passed = 0;
function check(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

type ToolResult = Record<string, unknown> & { ok: boolean; code?: string };

async function run(tool: ToolDefinition, input: unknown): Promise<ToolResult> {
  return (await tool.handler(input, undefined)) as ToolResult;
}

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

// ── Gate classification: the catalog drives these sets (no second list) ──
const AUTO = { allow: [] as string[], deny: [] as string[], defaultMode: 'auto' as const };
const PLAN = { allow: [] as string[], deny: [] as string[], defaultMode: 'plan' as const };

check(READ_TOOLS.has('git_status') && !WRITE_TOOLS.has('git_status'), 'git_status derives as a read');
check(READ_TOOLS.has('git_diff') && !WRITE_TOOLS.has('git_diff'), 'git_diff derives as a read');
check(WRITE_TOOLS.has('git_commit') && !READ_TOOLS.has('git_commit'), 'git_commit derives as a write');
check(WRITE_TOOLS.has('provider_add') && !READ_TOOLS.has('provider_add'), 'provider_add derives as a write');
check(READ_TOOLS.has('model_probe') && !WRITE_TOOLS.has('model_probe'), 'model_probe derives as a read');
check(READ_TOOLS.has('usage_report') && !WRITE_TOOLS.has('usage_report'), 'usage_report derives as a read');

check(decideToolCall(AUTO, 'git_status') === 'allow', 'auto: git_status runs');
check(decideToolCall(AUTO, 'git_diff') === 'allow', 'auto: git_diff runs');
check(decideToolCall(AUTO, 'git_commit') === 'ask', 'auto: git_commit asks');
check(decideToolCall(AUTO, 'provider_add') === 'ask', 'auto: provider_add asks');
check(decideToolCall(AUTO, 'model_probe') === 'allow', 'auto: model_probe runs');
check(decideToolCall(AUTO, 'usage_report') === 'allow', 'auto: usage_report runs');
check(decideToolCall(PLAN, 'git_commit') === 'deny', 'plan: git_commit refused');
check(decideToolCall(PLAN, 'provider_add') === 'deny', 'plan: provider_add refused');
check(decideToolCall(PLAN, 'git_diff') === 'allow', 'plan: git_diff allowed');

// ── Builders expose exactly the catalog names, in order ──────────────────
const gitTools = buildGitTools('/tmp');
const providerTools = buildProviderTools();
const usageTools = buildUsageTools('/tmp');
check(gitTools.map((t) => t.name).join(',') === GIT_TOOL_NAMES.join(','), 'git builder exposes the catalog names in order');
check(
  providerTools.map((t) => t.name).join(',') === PROVIDER_TOOL_NAMES.join(','),
  'provider builder exposes the catalog names in order',
);
check(usageTools.map((t) => t.name).join(',') === USAGE_TOOL_NAMES.join(','), 'usage builder exposes the catalog names in order');
const gitByName = new Map(gitTools.map((t) => [t.name, t]));
const provByName = new Map(providerTools.map((t) => [t.name, t]));
const usageByName = new Map(usageTools.map((t) => [t.name, t]));
check(gitByName.get('git_status')?.readOnly === true, 'git_status is readOnly');
check(gitByName.get('git_commit')?.readOnly !== true, 'git_commit is not readOnly');
check(provByName.get('model_probe')?.readOnly === true, 'model_probe is readOnly');
check(provByName.get('provider_add')?.readOnly !== true, 'provider_add is not readOnly');

// ── Git: a REAL temp repository, status → diff → commit ──────────────────
const repoDir = mkdtempSync(join(tmpdir(), 'lokma-wave3-repo-'));
git(repoDir, ['init']);
git(repoDir, ['config', 'user.email', 'wave3@probe.local']);
git(repoDir, ['config', 'user.name', 'Wave3 Probe']);
writeFileSync(join(repoDir, 'app.txt'), 'WAVE3-GIT-MARKER line one\n', 'utf-8');

const repoGit = new Map(buildGitTools(repoDir).map((t) => [t.name, t]));
const gStatus = repoGit.get('git_status') as ToolDefinition;
const gDiff = repoGit.get('git_diff') as ToolDefinition;
const gCommit = repoGit.get('git_commit') as ToolDefinition;

const s1 = await run(gStatus, {});
check(s1.ok === true && s1.repo === true, 'git_status answers repo:true in a real repository');
check(typeof s1.branch === 'string' && (s1.branch as string).length > 0, 'git_status carries the branch name');
check(((s1.counts as { changed: number }).changed ?? 0) === 1, 'git_status counts the new file');
const fileList = s1.files as { path: string; worktree: string | null }[];
check(fileList[0]?.path === 'app.txt', 'git_status lists the untracked file');

const emptyDiff = await run(gDiff, {});
check(emptyDiff.ok === true && emptyDiff.patch === '', 'git_diff of an untracked-only tree is an honest empty patch');

const c1 = await run(gCommit, { message: 'wave3 initial commit' });
check(c1.ok === true && typeof c1.hash === 'string' && (c1.hash as string).length === 40, 'git_commit lands a real commit hash');
check((c1.short as string).length === 7, 'git_commit reports the short hash');

writeFileSync(join(repoDir, 'app.txt'), 'WAVE3-GIT-MARKER line one\nWAVE3-GIT-CHANGE line two\n', 'utf-8');
const d2 = await run(gDiff, {});
check(d2.ok === true && String(d2.patch).includes('WAVE3-GIT-CHANGE'), 'git_diff carries the worktree change');
check(d2.truncated === false, 'git_diff reports its truncation state honestly');

const dPath = await run(gDiff, { path: 'app.txt' });
check(dPath.ok === true && String(dPath.patch).includes('WAVE3-GIT-CHANGE'), 'git_diff narrows to one path');
check(dPath.path === 'app.txt', 'git_diff echoes the narrowed path');

const dClean = await run(gDiff, { path: 'app.txt', staged: true });
check(dClean.ok === true && dClean.patch === '', 'staged diff before staging is empty (index == HEAD)');

const dBad = await run(gDiff, { path: '--weird' });
check(dBad.ok === false && dBad.code === 'bad_path', 'git_diff refuses a dash-leading path');

const c2 = await run(gCommit, { message: 'wave3 change commit' });
check(c2.ok === true, 'second git_commit lands');
const c3 = await run(gCommit, { message: 'wave3 nothing left' });
check(c3.ok === false && c3.code === 'nothing_to_commit', 'git_commit on a clean tree answers nothing_to_commit');

const s2 = await run(gStatus, {});
check(((s2.counts as { changed: number }).changed ?? -1) === 0, 'git_status is clean after the commits');

const notRepoDir = mkdtempSync(join(tmpdir(), 'lokma-wave3-norepo-'));
const notRepo = new Map(buildGitTools(notRepoDir).map((t) => [t.name, t]));
const sNo = await run(notRepo.get('git_status') as ToolDefinition, {});
check(sNo.ok === false && sNo.code === 'not_a_repo', 'git_status outside a repo answers not_a_repo');
const dNo = await run(notRepo.get('git_diff') as ToolDefinition, {});
check(dNo.ok === false && dNo.code === 'not_a_repo', 'git_diff outside a repo answers not_a_repo');

// ── Providers/Models: a local SSE stub stands in for the upstream ────────
const seen: { path: string; auth: string | null; body: string }[] = [];
const srv = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    seen.push({ path: req.url ?? '', auth: (req.headers.authorization as string | undefined) ?? null, body });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    res.write('data: {"choices":[{"delta":{"role":"assistant","content":"pong"}}]}\n\n');
    res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n');
    res.write('data: [DONE]\n\n');
    res.end();
  });
});
await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
const port = (srv.address() as { port: number }).port;
const stubBase = `http://127.0.0.1:${port}/v1`;

const pAdd = provByName.get('provider_add') as ToolDefinition;
const pProbe = provByName.get('model_probe') as ToolDefinition;

const added = await run(pAdd, { id: 'wave3-stub', name: 'Wave3 Stub', baseUrl: `${stubBase}/`, apiKey: 'wave3-key' });
check(added.ok === true, 'provider_add accepts a valid provider');
check((added.provider as { id: string } | null)?.id === 'wave3-stub', 'provider_add returns the created view');
check((added.provider as { baseUrl: string }).baseUrl === stubBase, 'provider_add normalizes the trailing slash');

const dup = await run(pAdd, { id: 'wave3-stub', name: 'Again', baseUrl: stubBase });
check(dup.ok === false && dup.code === 'duplicate_id', 'provider_add refuses a duplicate id');

const badId = await run(pAdd, { id: 'NOPE!', name: 'Bad', baseUrl: stubBase });
check(badId.ok === false && badId.code === 'bad_id', 'provider_add refuses a bad id slug');

const badUrl = await run(pAdd, { id: 'wave3-bad', name: 'Bad', baseUrl: 'not-a-url' });
check(badUrl.ok === false && badUrl.code === 'bad_url', 'provider_add refuses a non-http base URL');

const probed = await run(pProbe, { model: 'wave3-stub/wave3-model' });
check(probed.ok === true, 'model_probe answers ok against the live stub');
check(String(probed.reply).includes('pong'), 'model_probe carries the streamed reply sample');
check(probed.provider === 'wave3-stub', 'model_probe reports the resolved provider');
check(typeof probed.firstTokenMs === 'number', 'model_probe reports time-to-first-token');
check(seen.length >= 1 && seen[0].path === '/v1/chat/completions', 'the upstream saw the real chat-completions call');
check(seen[0].auth === 'Bearer wave3-key', 'the upstream saw the stored credential');
check(String(seen[0].body).includes('"model":"wave3-model"'), 'the upstream saw the short model id');

const unknown = await run(pProbe, { model: 'wave3nope/x' });
check(unknown.ok === false && unknown.code === 'provider_not_wired', 'model_probe refuses an unwired provider honestly');

const keyless = await run(pProbe, { model: 'plain-model' });
check(keyless.ok === false && keyless.code === 'missing_api_key', 'model_probe without a key answers missing_api_key');

await new Promise<void>((resolve) => srv.close(() => resolve()));

// ── Usage: record a run in the ledger, read it back through the tool ─────
const projDir = mkdtempSync(join(tmpdir(), 'lokma-wave3-usage-'));
const ledger = new UsageLedger(projDir);
await ledger.record({
  sessionId: 'wave3-s1',
  provider: 'wave3-stub',
  model: 'wave3-stub/wave3-model',
  inputTokens: 120,
  outputTokens: 80,
  costUsd: 0.012,
  priced: true,
});

const uRep = new Map(buildUsageTools(projDir).map((t) => [t.name, t])).get('usage_report') as ToolDefinition;
const u1 = await run(uRep, {});
check(u1.ok === true && u1.rangeDays === 7, 'usage_report defaults to a 7-day window');
check(u1.runs === 1 && u1.tokens === 200, 'usage_report totals the recorded run');
check(u1.inputTokens === 120 && u1.outputTokens === 80, 'usage_report keeps input/output split');
check(Math.abs((u1.costUsd as number) - 0.012) < 1e-9, 'usage_report carries the recorded cost');
const rows = u1.byModel as { model: string; tokens: number }[];
check(rows.length === 1 && rows[0].model === 'wave3-stub/wave3-model', 'usage_report groups by model');
const u3 = await run(uRep, { days: 3 });
check(u3.ok === true && u3.rangeDays === 3, 'usage_report honours the days argument');

console.log(`\nREQ-181 wave-3 surface tools: ${passed}/${passed} checks passed`);
