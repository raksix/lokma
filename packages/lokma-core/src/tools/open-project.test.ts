/**
 * Live probe for the REQ-180 project tools (`open_project`, `list_projects`).
 *
 * Run standalone (full coverage — boots a throwaway instance):
 *   HOME=$(mktemp -d) LOKMA_PROBE_BOOT=1 bun src/tools/open-project.test.ts
 *
 * Under the shared `bun test` suite it degrades gracefully: `bun test`
 * shares ONE process HOME, and `roles.test.ts` owns the first-admin boot —
 * this file therefore NEVER boots the instance on its own (it would race
 * that boot and leave the sibling red). When the shared HOME is already
 * bootstrapped it adopts the existing superadmin; otherwise it runs the
 * fresh-instance legs only and says which legs were skipped.
 *
 * No test framework — plain asserts so the package stays dependency-free.
 * Real temp HOME on disk (startup env — bun snapshots HOME at boot; the
 * guard below refuses anything outside `/tmp/`). Covers: gate
 * classification + human sentences, derived name, `~` expansion, mkdir on
 * create, idempotency (sequential + parallel), the session opened in the
 * project cwd with its creator stamped (REQ-094), the emitted `ui_action`
 * frame, visibility-filtered listing, authority parity with REST
 * (superadmin / calisan under the default `members` policy / `open` policy
 * / no-user paths) and the jail claim: session file tools keep refusing
 * paths outside the session cwd even after a project opens elsewhere.
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import { stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  acceptInvite,
  inviteUser,
  listProjects,
  listUsers,
  registerFirstAdmin,
  saveAuthSettings,
  type User,
} from '../auth/store.js';
import { SessionStore } from '../session/store.js';
import { WorkspaceFiles } from '../files/files.js';
import { buildBuiltinTools } from './builtins.js';
import { decideToolCall, describeToolCall, READ_TOOLS, WRITE_TOOLS } from './gate.js';
import { buildUiControlTools, type UiActionPayload } from './ui-control.js';

const HOME = process.env.HOME ?? '';
if (!HOME.startsWith('/tmp/')) {
  throw new Error(`REFUSE: HOME=${HOME || '(empty)'} — rerun with HOME=$(mktemp -d) bun src/tools/open-project.test.ts`);
}

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

async function expectRejects(fn: () => Promise<unknown>, needle: string, label: string): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const err = e as { message?: string; code?: string };
    const text = `${err.message ?? ''} ${err.code ?? ''}`;
    if (!text.includes(needle)) throw new Error(`FAIL: ${label} — wrong error: ${text}`);
    passed += 1;
    console.log(`PASS: ${label}`);
    return;
  }
  throw new Error(`FAIL: ${label} — did not throw`);
}

const AUTO = { allow: [] as string[], deny: [] as string[], defaultMode: 'auto' as const };

type OpenResult = { ok: boolean; projectId: string; name: string; cwd: string; sessionId: string; created: boolean };
type ListResult = {
  projects: Array<{ id: string; name: string; cwd: string; visibility: string; sessionCount: number }>;
  count: number;
};

/** Adopt-or-boot the acting owner. Boot only on the explicit flag — the
 * suite-shared HOME is owned by roles.test.ts. */
async function resolveOwner(bootOk: boolean): Promise<{ owner: User | null; fresh: boolean }> {
  const users = await listUsers();
  if (users.length === 0) {
    if (!bootOk) return { owner: null, fresh: true };
    try {
      const { user } = await registerFirstAdmin({ email: 'openproject@x.com', name: 'OpenProject', password: 'password-123' });
      return { owner: user, fresh: true };
    } catch (e) {
      if ((e as { code?: string }).code !== 'auth_already_bootstrapped') throw e;
      // Another worker booted the shared HOME between our read and write.
      const again = await listUsers();
      return { owner: again.find((u) => u.role === 'superadmin') ?? again[0] ?? null, fresh: false };
    }
  }
  return { owner: users.find((u) => u.role === 'superadmin') ?? users[0], fresh: false };
}

async function main(): Promise<void> {
  // --- pure gate classification (REQ-180) ---
  assert(WRITE_TOOLS.has('open_project'), 'gate: open_project classified as a write');
  assert(READ_TOOLS.has('list_projects'), 'gate: list_projects classified as a read');
  assert(decideToolCall(AUTO, 'open_project') === 'ask', 'gate auto: open_project asks');
  assert(decideToolCall(AUTO, 'list_projects') === 'allow', 'gate auto: list_projects allowed');
  assert(
    decideToolCall({ allow: [], deny: [], defaultMode: 'plan' }, 'open_project') === 'deny',
    'gate plan: open_project denied',
  );
  assert(
    describeToolCall('open_project', { name: 'fermag', cwd: '/root/fermag' }) === 'Open project "fermag" at /root/fermag',
    'describe: open_project names the project and path',
  );
  assert(describeToolCall('list_projects', {}) === 'List projects', 'describe: list_projects sentence');

  const workspaceCwd = join(HOME, 'ws');
  const bootOk = process.env.LOKMA_PROBE_BOOT === '1';

  // --- un-bootstrapped instance: honest paths, no records invented ---
  // This block must run BEFORE the owner is resolved: on the standalone
  // flag the resolve step itself creates the first admin.
  const anonTools = buildUiControlTools(workspaceCwd, { sessionId: 'sess_anon', emit: () => {} });
  const anonOpen = anonTools.find((t) => t.name === 'open_project');
  const anonList = anonTools.find((t) => t.name === 'list_projects');
  assert(anonOpen !== undefined && anonList !== undefined, 'tools: both project tools register without a user');
  if (!anonOpen || !anonList) throw new Error('unreachable');
  if ((await listUsers()).length === 0) {
    await expectRejects(
      () => anonOpen.handler({ cwd: join(HOME, 'work', 'early') }, undefined),
      'first admin',
      'anon: un-bootstrapped instance refuses with not_bootstrapped',
    );
    const anonEarly = (await anonList.handler({}, undefined)) as ListResult;
    assert(anonEarly.count === 0 && anonEarly.projects.length === 0, 'anon: un-bootstrapped list reads the store (empty)');
  }

  const { owner, fresh } = await resolveOwner(bootOk);
  if (!owner) {
    console.log('SKIP: user-dependent legs need a bootstrapped instance — rerun standalone: HOME=$(mktemp -d) LOKMA_PROBE_BOOT=1 bun src/tools/open-project.test.ts');
    console.log(`\nopen-project probe: ${passed} passed (fresh-state legs only, shared HOME left untouched)`);
    return;
  }
  if (!fresh) {
    console.log(`NOTE: shared HOME already bootstrapped — adopting ${owner.email} as the acting user.`);
  }

  // --- bootstrapped without a user: honest refusal ---
  await expectRejects(
    () => anonOpen.handler({ cwd: join(HOME, 'work', 'early') }, undefined),
    'sign in required',
    'anon: bootstrapped instance requires a signed-in user',
  );
  await expectRejects(
    () => anonList.handler({}, undefined),
    'sign in required',
    'anon: bootstrapped list requires a signed-in user',
  );

  const frames: UiActionPayload[] = [];
  const tools = buildUiControlTools(workspaceCwd, {
    sessionId: 'sess_runner',
    userId: owner.id,
    emit: (payload) => frames.push(payload),
  });
  const openTool = tools.find((t) => t.name === 'open_project');
  const listTool = tools.find((t) => t.name === 'list_projects');
  assert(openTool !== undefined && listTool !== undefined, 'tools: open_project + list_projects registered');
  if (!openTool || !listTool) throw new Error('unreachable');

  // --- first open: record + directory + session + frame ---
  const projectDir = join(HOME, 'work', 'fermag');
  const first = (await openTool.handler({ cwd: projectDir }, undefined)) as OpenResult;
  assert(first.ok === true && first.created === true, 'open: first call creates the record');
  assert(first.name === 'fermag', 'open: name derives from the cwd last segment');
  assert(first.cwd === projectDir, 'open: cwd comes back resolved');
  assert(first.projectId.startsWith('p_'), 'open: project id has the store shape');
  assert((await stat(projectDir)).isDirectory(), 'open: directory exists on disk (mkdir -p)');
  const store = new SessionStore(first.cwd);
  const meta = await store.readMeta(first.sessionId);
  assert(meta?.ownerId === owner.id, 'open: fresh session is stamped with its creator (REQ-094)');
  assert((await store.read(first.sessionId)).length === 1, 'open: session transcript has the creation marker');
  assert(frames.length === 1 && frames[0].action === 'open_project', 'open: exactly one ui_action frame');
  assert(
    frames[0].projectId === first.projectId && frames[0].cwd === projectDir && frames[0].targetSessionId === first.sessionId,
    'open: the frame carries projectId + cwd + the new session',
  );

  // --- idempotency: same cwd again ---
  const second = (await openTool.handler({ cwd: projectDir }, undefined)) as OpenResult;
  assert(second.created === false && second.projectId === first.projectId, 'idempotent: second call reuses the record');
  assert((await listProjects()).filter((p) => p.cwd === projectDir).length === 1, 'idempotent: exactly one record for the cwd');

  // --- idempotency under parallel calls (the lock) ---
  const parallelCwd = join(HOME, 'work', 'parallel-app');
  const [par1, par2] = (await Promise.all([
    openTool.handler({ cwd: parallelCwd }, undefined),
    openTool.handler({ cwd: parallelCwd }, undefined),
  ])) as [OpenResult, OpenResult];
  assert(par1.projectId === par2.projectId, 'parallel: both calls land on one record');
  assert(par1.created !== par2.created, 'parallel: exactly one call created the record');
  assert((await listProjects()).filter((p) => p.cwd === parallelCwd).length === 1, 'parallel: one row in the store');

  // --- `~` expansion + explicit name ---
  const tilde = (await openTool.handler({ cwd: '~/tilde-app' }, undefined)) as OpenResult;
  assert(tilde.cwd === join(HOME, 'tilde-app') && tilde.name === 'tilde-app', 'open: `~` expands to the server home');
  const named = (await openTool.handler({ cwd: join(HOME, 'work', 'named-dir'), name: 'Custom Name' }, undefined)) as OpenResult;
  assert(named.name === 'Custom Name', 'open: an explicit name wins over the derived one');

  // --- pre-assigned session id: honoured, and validated before any write ---
  const pref = (await openTool.handler({ cwd: join(HOME, 'work', 'pref-app'), sessionId: 'sess_pref_1' }, undefined)) as OpenResult;
  assert(pref.sessionId === 'sess_pref_1', 'open: a free pre-assigned session id is honoured');
  const prefDir2 = join(HOME, 'work', 'pref-app-2');
  await expectRejects(
    () => openTool.handler({ cwd: prefDir2, sessionId: 'sess_pref_1' }, undefined),
    'already exists',
    'open: a taken session id is refused',
  );
  assert((await listProjects()).every((p) => p.cwd !== prefDir2), 'open: the refused call left no project behind');

  // --- list: visibility filter + session count ---
  const publicDir = join(HOME, 'work', 'public-app');
  await openTool.handler({ cwd: publicDir, visibility: 'public' }, undefined);
  const all = (await listTool.handler({}, undefined)) as ListResult;
  assert(all.count === (await listProjects()).length, 'list: superadmin sees every record');
  const prefRow = all.projects.find((p) => p.cwd === join(HOME, 'work', 'pref-app'));
  assert(prefRow !== undefined && prefRow.sessionCount === 1, 'list: sessionCount counts the project sessions');

  const invite = await inviteUser(owner, { email: 'worker@x.com', role: 'calisan' });
  const { user: calisan } = await acceptInvite({
    token: invite.inviteLink.split('token=')[1],
    name: 'Worker',
    password: 'password-123',
  });
  const calisanTools = buildUiControlTools(workspaceCwd, { sessionId: 'sess_worker', userId: calisan.id, emit: () => {} });
  const calisanOpen = calisanTools.find((t) => t.name === 'open_project');
  const calisanList = calisanTools.find((t) => t.name === 'list_projects');
  if (!calisanOpen || !calisanList) throw new Error('unreachable');
  const calisanRows = (await calisanList.handler({}, undefined)) as ListResult;
  assert(
    calisanRows.projects.every((p) => p.visibility === 'public') && calisanRows.projects.some((p) => p.cwd === publicDir),
    'list: a calisan sees the public project and no private ones',
  );
  assert(calisanRows.projects.every((p) => p.cwd !== projectDir), 'list: the private project stays hidden from a calisan');

  // --- authority parity: default `members` policy refuses ---
  const calisanDir = join(HOME, 'work', 'calisan-app');
  await expectRejects(
    () => calisanOpen.handler({ cwd: calisanDir }, undefined),
    'forbidden',
    'authority: calisan refused under the default members policy',
  );
  assert((await listProjects()).every((p) => p.cwd !== calisanDir), 'authority: the refusal left no record');

  // --- `open` policy allows (standalone runs own the settings flip; the
  // shared-suite HOME is left untouched) ---
  if (fresh) {
    await saveAuthSettings({ projectCreation: 'open' });
    const calisanMade = (await calisanOpen.handler({ cwd: calisanDir }, undefined)) as OpenResult;
    assert(calisanMade.created === true, 'authority: the open policy lets a calisan create');
    await saveAuthSettings({ projectCreation: 'members' });
  }

  // --- jail: opening a project elsewhere never widens the session tools ---
  await writeFile(join(projectDir, 'note.txt'), 'x', 'utf-8');
  const readTool = buildBuiltinTools(workspaceCwd).find((t) => t.name === 'read_file');
  assert(readTool !== undefined, 'jail: read_file builtin present');
  if (readTool) {
    await expectRejects(
      () => readTool.handler({ path: join(projectDir, 'note.txt') }, undefined),
      'outside_root',
      'jail: read_file still refuses a path outside the session cwd',
    );
  }
  await expectRejects(
    () => new WorkspaceFiles(workspaceCwd).list(projectDir),
    'outside_root',
    'jail: WorkspaceFiles keeps its root after the project opened elsewhere',
  );

  console.log(`\nopen-project probe: ${passed} passed`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
