/**
 * REQ-181 wave-4 surface-tool probe — Cron + Plugins + Observability tool
 * families against REAL stores. Same isolated-HOME child pattern as the
 * wave-1/3 probes: bun snapshots `os.homedir()` at startup, so the cron
 * job store, the plugin registry and the agent registry need a child
 * process with HOME moved. Provider env keys are stripped so no tool can
 * reach a real upstream; nothing here touches the network.
 * Run: `bun src/tools/surface-tools-wave4.test.ts` from `packages/lokma-core`.
 */
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { READ_TOOLS, WRITE_TOOLS, decideToolCall } from './gate';
import { CRON_TOOL_NAMES, buildCronTools } from './cron-tools';
import { PLUGIN_TOOL_NAMES, buildPluginTools } from './plugin-tools';
import { OBSERVABILITY_TOOL_NAMES, buildObservabilityTools } from './observability-tools';
import { createAgent } from '../agents/registry';
import type { ToolDefinition } from './registry';

const CHILD_ENV = 'LOKMA_SURFACE_WAVE4_TEST_CHILD';
if (process.env[CHILD_ENV] !== '1') {
  const tmpHome = mkdtempSync(join(tmpdir(), 'lokma-wave4-home-'));
  const env: Record<string, string | undefined> = { ...process.env, HOME: tmpHome, [CHILD_ENV]: '1' };
  // No provider credentials leak into the child — no tool here may reach a
  // real upstream (this probe touches no network at all).
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

// ── Gate classification: the catalog drives these sets (no second list) ──
const AUTO = { allow: [] as string[], deny: [] as string[], defaultMode: 'auto' as const };
const PLAN = { allow: [] as string[], deny: [] as string[], defaultMode: 'plan' as const };

check(READ_TOOLS.has('cron_list') && !WRITE_TOOLS.has('cron_list'), 'cron_list derives as a read');
check(WRITE_TOOLS.has('cron_create') && !READ_TOOLS.has('cron_create'), 'cron_create derives as a write');
check(READ_TOOLS.has('plugin_list') && !WRITE_TOOLS.has('plugin_list'), 'plugin_list derives as a read');
check(WRITE_TOOLS.has('plugin_install') && !READ_TOOLS.has('plugin_install'), 'plugin_install derives as a write');
check(READ_TOOLS.has('trace_list') && !WRITE_TOOLS.has('trace_list'), 'trace_list derives as a read');
check(READ_TOOLS.has('trace_get') && !WRITE_TOOLS.has('trace_get'), 'trace_get derives as a read');

check(decideToolCall(AUTO, 'cron_list') === 'allow', 'auto: cron_list runs');
check(decideToolCall(AUTO, 'cron_create') === 'ask', 'auto: cron_create asks');
check(decideToolCall(AUTO, 'plugin_list') === 'allow', 'auto: plugin_list runs');
check(decideToolCall(AUTO, 'plugin_install') === 'ask', 'auto: plugin_install asks');
check(decideToolCall(AUTO, 'trace_get') === 'allow', 'auto: trace_get runs');
check(decideToolCall(PLAN, 'cron_create') === 'deny', 'plan: cron_create refused');
check(decideToolCall(PLAN, 'plugin_install') === 'deny', 'plan: plugin_install refused');
check(decideToolCall(PLAN, 'trace_list') === 'allow', 'plan: trace_list allowed');

// ── Builders expose exactly the catalog names, in order ──────────────────
const cronTools = buildCronTools();
const pluginTools = buildPluginTools();
const traceTools = buildObservabilityTools();
check(cronTools.map((t) => t.name).join(',') === CRON_TOOL_NAMES.join(','), 'cron builder exposes the catalog names in order');
check(
  pluginTools.map((t) => t.name).join(',') === PLUGIN_TOOL_NAMES.join(','),
  'plugin builder exposes the catalog names in order',
);
check(
  traceTools.map((t) => t.name).join(',') === OBSERVABILITY_TOOL_NAMES.join(','),
  'observability builder exposes the catalog names in order',
);
const cronByName = new Map(cronTools.map((t) => [t.name, t]));
const pluginByName = new Map(pluginTools.map((t) => [t.name, t]));
const traceByName = new Map(traceTools.map((t) => [t.name, t]));
check(cronByName.get('cron_list')?.readOnly === true, 'cron_list is readOnly');
check(cronByName.get('cron_create')?.readOnly !== true, 'cron_create is not readOnly');
check(pluginByName.get('plugin_list')?.readOnly === true, 'plugin_list is readOnly');
check(pluginByName.get('plugin_install')?.readOnly !== true, 'plugin_install is not readOnly');
check(traceByName.get('trace_list')?.readOnly === true, 'trace_list is readOnly');
check(traceByName.get('trace_get')?.readOnly === true, 'trace_get is readOnly');
for (const tool of [...cronTools, ...pluginTools, ...traceTools]) {
  check(
    typeof tool.description === 'string' && tool.description.trim().length >= 20,
    `description is a real sentence: ${tool.name}`,
  );
}

// ── Cron: a REAL agent, real validation errors, real job store ───────────
const agent = await createAgent({ name: 'Wave4 Probe', persona: 'tester', model: 'probe/model-a' });
const cronList = cronByName.get('cron_list') as ToolDefinition;
const cronCreate = cronByName.get('cron_create') as ToolDefinition;

const empty = await run(cronList, {});
check(empty.ok === true && empty.count === 0, 'cron_list starts empty in a fresh HOME');

const badSchedule = await run(cronCreate, { agentId: agent.id, schedule: '99 99 * * *', task: 'nope' });
check(badSchedule.ok === false && badSchedule.code === 'bad_schedule', 'cron_create rejects an out-of-range schedule');

const unknownAgent = await run(cronCreate, { agentId: 'no-such-agent', schedule: '0 3 * * *', task: 'nope' });
check(unknownAgent.ok === false && unknownAgent.code === 'agent_not_found', 'cron_create refuses an unknown agent');

const created = await run(cronCreate, { agentId: agent.id, schedule: '0 3 * * *', task: 'wave4 probe daily task' });
check(created.ok === true, 'cron_create lands a real job');
const job = created.job as Record<string, unknown>;
check(typeof job.id === 'string' && (job.id as string).startsWith('c_'), 'the job id is server-minted (c_ prefix)');
check(job.schedule === '0 3 * * *' && job.task === 'wave4 probe daily task', 'the stored schedule/task round-trip');
check(job.enabled === true, 'the job is enabled by default');
check(typeof job.nextRunAt === 'string' && (job.nextRunAt as string).length > 0, 'the view carries the next run time');

const parked = await run(cronCreate, { agentId: agent.id, schedule: '*/5 * * * *', task: 'parked probe task', enabled: false });
check(parked.ok === true && (parked.job as Record<string, unknown>).enabled === false, 'cron_create honours enabled:false');

const list2 = await run(cronList, {});
check(list2.ok === true && list2.count === 2, 'cron_list now shows both jobs');
const jobs = list2.jobs as Array<Record<string, unknown>>;
check(jobs.some((j) => j.id === job.id), 'the created job round-trips through cron_list');

// Disk is the truth: the job store file carries the same ids.
const jobsFile = JSON.parse(readFileSync(join(process.env.HOME as string, '.lokma', 'cron', 'jobs.json'), 'utf-8')) as Record<string, unknown>;
check(Object.keys(jobsFile).includes(job.id as string), 'the job is on disk in ~/.lokma/cron/jobs.json');

// ── Plugins: the real registry + strict URL validation ───────────────────
const pluginList = pluginByName.get('plugin_list') as ToolDefinition;
const pluginInstall = pluginByName.get('plugin_install') as ToolDefinition;

const bundled = await run(pluginList, {});
check(bundled.ok === true, 'plugin_list answers');
const rows = bundled.plugins as Array<Record<string, unknown>>;
check(Array.isArray(rows) && rows.length >= 5, 'the bundled plugins are listed');
check(rows.some((p) => p.id === '@lokma/plugin-archify'), 'a bundled plugin row is present (archify)');
check(rows.every((p) => p.installed === true), 'every listed row is installed');

const httpInstall = await run(pluginInstall, { url: 'http://plugins.example.com/x' });
check(httpInstall.ok === false && httpInstall.code === 'bad_url', 'plugin_install refuses plain http');
const credInstall = await run(pluginInstall, { url: 'https://user:pass@plugins.example.com/x' });
check(credInstall.ok === false && credInstall.code === 'bad_url', 'plugin_install refuses credential URLs');
const localInstall = await run(pluginInstall, { url: 'https://localhost/manifest' });
check(localInstall.ok === false && localInstall.code === 'bad_url', 'plugin_install refuses private hosts');

const installed = await run(pluginInstall, { url: 'https://github.com/example/lokma-plugin-wave4' });
check(installed.ok === true, 'plugin_install lands a real suspended record');
const plugin = installed.plugin as Record<string, unknown>;
check(plugin.id === 'lokma-plugin-wave4', 'the plugin id derives from the URL path');
check(plugin.source === 'url' && plugin.enabled === false, 'the record is a suspended url plugin');

const list3 = await run(pluginList, {});
check(
  (list3.plugins as Array<Record<string, unknown>>).some((p) => p.id === 'lokma-plugin-wave4' && p.enabled === false),
  'the installed plugin round-trips through plugin_list',
);
const dupe = await run(pluginInstall, { url: 'https://github.com/example/lokma-plugin-wave4' });
check(dupe.ok === false && dupe.code === 'plugin_exists', 're-installing the same plugin id is refused');

// ── Observability: the agent registry drives the trace pair ──────────────
const traceList = traceByName.get('trace_list') as ToolDefinition;
const traceGet = traceByName.get('trace_get') as ToolDefinition;

const listed = await run(traceList, {});
check(listed.ok === true && listed.count === 1, 'trace_list shows exactly the probe agent (fresh HOME)');
const agents = listed.agents as Array<Record<string, unknown>>;
check(agents[0]?.id === agent.id && agents[0]?.state === 'idle', 'the listed agent carries id + state');

const missing = await run(traceGet, { agentId: 'no-such-agent' });
check(missing.ok === false && missing.code === 'agent_not_found', 'trace_get answers agent_not_found honestly');
const malformed = await run(traceGet, { agentId: '../escape' });
check(malformed.ok === false && malformed.code === 'bad_agent_id', 'trace_get refuses a malformed id');

const got = await run(traceGet, { agentId: agent.id });
check(got.ok === true, 'trace_get answers for a real agent');
const trace = got.trace as Record<string, unknown>;
check((trace.agent as Record<string, unknown>).id === agent.id, 'the trace belongs to the requested agent');
const events = trace.events as Array<Record<string, unknown>>;
check(events.some((ev) => ev.kind === 'agent_created'), 'the timeline carries the agent_created event');
check((trace.docs as Record<string, Record<string, unknown>>).soul.exists === true, 'the SOUL doc is reported present');

console.log(`\nsurface-tools wave-4 probe: ${passed} checks passed`);
