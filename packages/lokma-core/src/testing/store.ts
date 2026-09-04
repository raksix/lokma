import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ensureDir, expandHome, writeAtomic } from '../utils/fs.js';
import {
  TestError,
  type ShannonFinding,
  type TestClassification,
  type TestPlanDoc,
  type TestReport,
  type TestResult,
  type TestSummary,
} from './types.js';

/**
 * Testing Lab store — the single DRY implementation behind `/api/tests/*`.
 * Root: `~/.lokma/test-runs/<id>/` (Docs/33 §7): `plan.json` (Plan stage
 * input) + `report.json` (Run + Classify output) + `junit.xml` (Report
 * stage download). Same store for CLI + web — one loop, like sessions.
 *
 * Each target path becomes exactly one `http` check (concept Inventory
 * parity: every entry gets one test). Checks run through the caller-supplied
 * `execute` callback — the route layer passes `app.inject`, so every check
 * exercises the REAL handler code (status + body), never a stub.
 * No Playwright/video/trace here (no headless browser dep) — the pane says
 * so in its footer instead of faking thumbnails.
 */

export const TESTS_DIR = '~/.lokma/test-runs';

/** Default inventory when the client sends no targets (core health first). */
export const DEFAULT_TARGETS = ['/health', '/api/health', '/api/models'];

export const TEST_PLAN_CAP = 120;
export const TEST_TARGETS_CAP = 20;
export const TEST_TARGET_LEN_CAP = 200;
export const TEST_TIMEOUT_CAP_MS = 30000;

/** Absolute tests root on this machine. */
export function testsRoot(): string {
  return expandHome(TESTS_DIR);
}

/**
 * Validate a run id (a single path segment — no traversal into the root).
 * Throws `bad_id` (shape) — unknown-but-valid ids throw `test_not_found`.
 */
export function assertRunId(raw: unknown): string {
  if (typeof raw !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(raw)) {
    throw new TestError('bad_id', 'run id must match [a-z0-9-]{2,64}', 400);
  }
  return raw;
}

function dirOf(id: string): string {
  return join(testsRoot(), id);
}

/** Plan headline — 1..120 chars, the concept run-card title. */
export function assertPlan(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new TestError('bad_plan', 'plan must be a non-empty string', 400);
  }
  if (raw.length > TEST_PLAN_CAP) {
    throw new TestError('bad_plan', `plan too long (${TEST_PLAN_CAP} max)`, 400);
  }
  return raw.trim();
}

/**
 * Target inventory — relative `GET` paths only (server-scoped, no SSRF
 * surface: absolute URLs, protocols, `..` and whitespace are rejected).
 * Empty/omitted falls back to DEFAULT_TARGETS (core health first).
 */
export function assertTargets(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [...DEFAULT_TARGETS];
  if (!Array.isArray(raw)) throw new TestError('bad_targets', 'targets must be an array of paths', 400);
  if (raw.length === 0) return [...DEFAULT_TARGETS];
  if (raw.length > TEST_TARGETS_CAP) {
    throw new TestError('bad_targets', `too many targets (${TEST_TARGETS_CAP} max)`, 400);
  }
  return raw.map((t) => assertTarget(t));
}

function assertTarget(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new TestError('bad_target', 'each target must be a non-empty path', 400);
  }
  const t = raw.trim();
  if (t.length > TEST_TARGET_LEN_CAP) {
    throw new TestError('bad_target', `target too long (${TEST_TARGET_LEN_CAP} max): ${t.slice(0, 60)}`, 400);
  }
  if (!t.startsWith('/')) throw new TestError('bad_target', `target must be a relative path starting with /: ${t}`, 400);
  if (/\s/.test(t)) throw new TestError('bad_target', `target must not contain whitespace: ${t}`, 400);
  if (t.includes('..') || t.includes('://')) {
    throw new TestError('bad_target', `target must stay inside this server: ${t}`, 400);
  }
  return t;
}

function assertTimeout(raw: unknown): number {
  if (raw === undefined || raw === null) return 10000;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    throw new TestError('bad_timeout', 'timeoutMs must be a positive number', 400);
  }
  return Math.min(Math.floor(raw), TEST_TIMEOUT_CAP_MS);
}

/** Secret families for the Shannon suite — names only, never values. */
const SECRET_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'aws-access-key', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'private-key-block', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'bearer-token', re: /[Bb]earer\s+[A-Za-z0-9\-._~+/=]{16,}/g },
  { name: 'api-key-assignment', re: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[A-Za-z0-9\-._~+/=]{16,}['"]?/gi },
  { name: 'password-assignment', re: /(?:password|passwd|pwd)\s*[:=]\s*['"]?[^'"\s]{8,}['"]?/gi },
];

/**
 * Shannon scan over labelled texts — returns findings with pattern name +
 * source label only (matched secrets are counted, never echoed).
 */
export function scanSecrets(sources: { label: string; text: string }[]): ShannonFinding[] {
  const findings: ShannonFinding[] = [];
  for (const { label, text } of sources) {
    const sample = text.slice(0, 20000);
    for (const { name, re } of SECRET_PATTERNS) {
      re.lastIndex = 0;
      if (re.test(sample)) findings.push({ pattern: name, location: label });
    }
  }
  return findings;
}

/** Result of one injected check (route layer owns the transport). */
export type ExecuteCheck = (target: string) => Promise<{ status: number; body: string }>;

/** `18s`-style duration cell for list rows (concept card parity). */
export function formatDur(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  return s < 60 ? `${Math.round(s * 10) / 10}s` : `${Math.floor(s / 60)}m${Math.round(s % 60)}s`;
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** JUnit XML for the Report stage (`junit.xml` download). */
export function buildJunit(report: TestReport): string {
  const cases = report.tests
    .map((t) => {
      const body =
        t.status === 'fail'
          ? `\n    <failure message="${xmlEscape(t.detail)}" type="${xmlEscape(t.classification ?? 'contract')}"/>`
          : '';
      return `    <testcase classname="${xmlEscape(report.plan)}" name="${xmlEscape(t.name)}" time="${(t.ms / 1000).toFixed(3)}">${body}\n    </testcase>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${xmlEscape(report.plan)}" tests="${report.tests.length}" failures="${report.fail}" skipped="0" time="${(report.durationMs / 1000).toFixed(3)}">\n${cases}\n</testsuite>\n`;
}

function newRunId(): string {
  const stamp = Date.now().toString(36);
  const rand = randomBytes(3).toString('hex');
  return `run-${stamp}-${rand}`;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Execute a full Plan → Run → Classify cycle and persist it.
 * One `http` check per target (Inventory parity) + one `shannon` check
 * when `includeShannon` is set. Fails closed: a throwing transport marks
 * the check `env`, a timeout marks it `fragility`, a non-2xx marks it
 * `contract`. Never throws for check outcomes — only for bad input.
 */
export async function runTestRun(
  execute: ExecuteCheck,
  planRaw: unknown,
  targetsRaw: unknown,
  opts: { includeShannon?: unknown; timeoutMs?: unknown } = {},
): Promise<{ id: string; report: TestReport }> {
  const plan = assertPlan(planRaw);
  const targets = assertTargets(targetsRaw);
  const timeoutMs = assertTimeout(opts.timeoutMs);
  const includeShannon = opts.includeShannon === undefined ? true : opts.includeShannon === true;
  const id = newRunId();
  const createdAt = new Date().toISOString();
  const started = Date.now();
  const tests: TestResult[] = [];
  const scanSources: { label: string; text: string }[] = [{ label: 'plan', text: plan }];

  for (const target of targets) {
    const name = `GET ${target}`;
    const t0 = Date.now();
    try {
      const { status, body } = await withTimeout(execute(target), timeoutMs);
      const ms = Date.now() - t0;
      scanSources.push({ label: `${name} body`, text: body.slice(0, 20000) });
      if (status >= 200 && status < 300) {
        tests.push({ name, kind: 'http', status: 'pass', ms, detail: `HTTP ${status}` });
      } else {
        const classification: TestClassification = 'contract';
        tests.push({
          name,
          kind: 'http',
          status: 'fail',
          ms,
          detail: `HTTP ${status} (expected 2xx)`,
          classification,
        });
      }
    } catch (e) {
      const ms = Date.now() - t0;
      const timedOut = e instanceof Error && e.message === 'timed out';
      const classification: TestClassification = timedOut ? 'fragility' : 'env';
      tests.push({
        name,
        kind: 'http',
        status: 'fail',
        ms,
        detail: timedOut ? `timed out after ${timeoutMs}ms` : 'transport error (unreachable handler)',
        classification,
      });
    }
  }

  let shannon = 'clean';
  let shannonFindings: ShannonFinding[] = [];
  if (includeShannon) {
    const t0 = Date.now();
    shannonFindings = scanSecrets(scanSources);
    const ms = Date.now() - t0;
    shannon = shannonFindings.length === 0 ? 'clean' : `${shannonFindings.length} secret${shannonFindings.length === 1 ? '' : 's'}`;
    tests.push({
      name: 'shannon: secret scan',
      kind: 'shannon',
      status: shannonFindings.length === 0 ? 'pass' : 'fail',
      ms,
      detail:
        shannonFindings.length === 0
          ? 'no secret patterns in plan + response bodies'
          : `${shannonFindings.length} secret pattern(s) in plan + response bodies`,
      ...(shannonFindings.length === 0 ? {} : { classification: 'contract' as TestClassification }),
    });
  }

  const durationMs = Date.now() - started;
  const pass = tests.filter((t) => t.status === 'pass').length;
  const report: TestReport = {
    id,
    plan,
    createdAt,
    durationMs,
    tests,
    pass,
    fail: tests.length - pass,
    flaky: 0,
    shannon,
    shannonFindings,
  };
  const planDoc: TestPlanDoc = { id, plan, targets, includeShannon, createdAt };
  const dir = dirOf(id);
  await ensureDir(dir);
  await writeAtomic(join(dir, 'plan.json'), `${JSON.stringify(planDoc, null, 2)}\n`);
  await writeAtomic(join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeAtomic(join(dir, 'junit.xml'), `${buildJunit(report)}\n`);
  return { id, report };
}

async function readReport(id: string): Promise<TestReport> {
  let raw: string;
  try {
    raw = await readFile(join(dirOf(id), 'report.json'), 'utf-8');
  } catch {
    throw new TestError('test_not_found', `no test run: ${id}`, 404);
  }
  try {
    const parsed = JSON.parse(raw) as TestReport;
    if (!parsed || parsed.id !== id || !Array.isArray(parsed.tests)) throw new Error('bad report');
    return parsed;
  } catch (e) {
    if (e instanceof TestError) throw e;
    throw new TestError('test_not_found', `no test run: ${id}`, 404);
  }
}

function toSummary(report: TestReport): TestSummary {
  return {
    id: report.id,
    plan: report.plan,
    tests: report.tests.length,
    pass: report.pass,
    fail: report.fail,
    flaky: report.flaky,
    dur: formatDur(report.durationMs),
    shannon: report.shannon,
    createdAt: report.createdAt,
  };
}

/** Newest-first run list (concept Runs section parity). */
export async function listRuns(): Promise<{ items: TestSummary[]; count: number }> {
  let names: string[];
  try {
    await mkdir(testsRoot(), { recursive: true });
    names = await readdir(testsRoot());
  } catch {
    return { items: [], count: 0 };
  }
  const items: TestSummary[] = [];
  for (const name of names) {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(name)) continue;
    try {
      const s = await stat(join(testsRoot(), name, 'report.json'));
      if (!s.isFile()) continue;
      items.push(toSummary(await readReport(name)));
    } catch {
      // Skip half-written run dirs — a run is listed only with a report.
    }
  }
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { items: items.slice(0, 100), count: items.length };
}

/** Full run detail — plan input + classified report. */
export async function getRun(idRaw: unknown): Promise<{ plan: TestPlanDoc | null; report: TestReport }> {
  const id = assertRunId(idRaw);
  const report = await readReport(id);
  let plan: TestPlanDoc | null = null;
  try {
    plan = JSON.parse(await readFile(join(dirOf(id), 'plan.json'), 'utf-8')) as TestPlanDoc;
  } catch {
    plan = null;
  }
  return { plan, report };
}

/** Raw `junit.xml` bytes for the Report-stage download. */
export async function readJunit(idRaw: unknown): Promise<{ filename: string; xml: string }> {
  const id = assertRunId(idRaw);
  try {
    const xml = await readFile(join(dirOf(id), 'junit.xml'), 'utf-8');
    return { filename: `${id}.junit.xml`, xml };
  } catch {
    throw new TestError('test_not_found', `no test run: ${id}`, 404);
  }
}

/**
 * Delete a run — removes its whole on-disk dir (`plan.json` +
 * `report.json` + `junit.xml`). Unknown ids 404 via `readReport`
 * before anything is touched; bad shapes 400 via `assertRunId`.
 * The id is validated to a single path segment so `rm` can never
 * escape the test-runs root.
 */
export async function deleteRun(idRaw: unknown): Promise<{ id: string }> {
  const id = assertRunId(idRaw);
  await readReport(id); // 404 on unknown before touching disk.
  await rm(dirOf(id), { recursive: true, force: true });
  return { id };
}
