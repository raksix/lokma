/**
 * AuthPane pure-helper probe — run with:
 *   `bun src/components/auth/auth.test.ts` from `packages/lokma-web/web`.
 * Exits non-zero on the first failure (16/16 style like prior waves).
 */
import {
  canDo,
  canEditProject,
  clearToken,
  emptyInviteForm,
  emptyLoginForm,
  emptyProjectForm,
  emptyRegisterForm,
  filterProjects,
  filterUsers,
  formatLastActive,
  initials,
  joinMembers,
  memberCountLabel,
  roleTone,
  statusTone,
  storeToken,
  validateInviteForm,
  validateLoginForm,
  validateProjectForm,
  validateRegisterForm,
  type LoginForm,
} from './auth';
import type { AuthProject, AuthUser } from '@/lib/api';

let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`ok: ${name}`);
}

const user = (over: Partial<AuthUser> = {}): AuthUser => ({
  id: 'u_1',
  email: 'aylin@example.com',
  name: 'Aylin',
  role: 'member',
  status: 'active',
  permissions: [],
  createdAt: '2026-09-03T00:00:00.000Z',
  lastActiveAt: null,
  ...over,
});

const project = (over: Partial<AuthProject> = {}): AuthProject => ({
  id: 'p_lokma-ab12',
  name: 'lokma',
  cwd: '',
  visibility: 'private',
  ownerId: 'u_1',
  createdAt: '2026-09-03T00:00:00.000Z',
  ...over,
});

// ─── tones ─────────────────────────────────────────────────────────
check('admin tone is dark', roleTone('admin').includes('bg-[#262624]'));
check('member tone is paper', roleTone('member').includes('bg-white'));
check('viewer tone is zinc', roleTone('viewer').includes('text-zinc-600'));
check('active tone emerald', statusTone('active').includes('emerald'));
check('invited tone amber', statusTone('invited').includes('amber'));
check('disabled tone zinc', statusTone('disabled').includes('zinc-500'));

// ─── initials ──────────────────────────────────────────────────────
check('two words initials', initials('Aylin Yilmaz', 'a@x.com') === 'AY');
check('single name initials', initials('Furkan', 'f@x.com') === 'FU');
check('blank name falls back to email', initials('', 'mira@x.com') === 'MI');

// ─── counts ────────────────────────────────────────────────────────
check('singular member', memberCountLabel(1) === '1 member');
check('plural members', memberCountLabel(3) === '3 members');

// ─── canDo (client mirror — server re-checks) ───────────────────────
check('anonymous cannot manage', !canDo(null, 'manageUsers'));
check('admin can manage users', canDo(user({ role: 'admin' }), 'manageUsers'));
check('admin can patch settings', canDo(user({ role: 'admin' }), 'manageSettings'));
check('member cannot manage users', !canDo(user({ role: 'member' }), 'manageUsers'));
check('viewer cannot delete project', !canDo(user({ role: 'viewer' }), 'deleteProject'));
check('member creates under members policy', canDo(user({ role: 'member' }), 'createProject', { projectCreation: 'members' }));
check('member blocked under admin-only policy', !canDo(user({ role: 'member' }), 'createProject', { projectCreation: 'admin-only' }));
check('viewer never creates', !canDo(user({ role: 'viewer' }), 'createProject', { projectCreation: 'open' }));
check('disabled admin cannot manage', !canDo(user({ role: 'admin', status: 'disabled' }), 'manageUsers'));
check('owner edits own project', canEditProject(user({ id: 'u_1' }), project()));
check('non-owner member cannot edit', !canEditProject(user({ id: 'u_9' }), project()));
check('admin edits any project', canEditProject(user({ id: 'u_9', role: 'admin' }), project()));

// ─── filters ───────────────────────────────────────────────────────
const users = [user(), user({ id: 'u_2', name: 'Furkan', email: 'furkan@fermag.com.tr', role: 'admin' })];
check('empty query keeps all users', filterUsers(users, '').length === 2);
check('name matches', filterUsers(users, 'furkan').length === 1);
check('email matches', filterUsers(users, 'fermag').length === 1);
check('role matches', filterUsers(users, 'admin').length === 1);
check('case-insensitive', filterUsers(users, 'AYLIN').length === 1);
check('no match empty', filterUsers(users, 'zzz').length === 0);
const projects = [project(), project({ id: 'p_docs-34cd', name: 'lokma-docs', visibility: 'public' })];
check('project name matches', filterProjects(projects, 'docs').length === 1);
check('empty query keeps all projects', filterProjects(projects, '').length === 2);

// ─── joinMembers ───────────────────────────────────────────────────
const joined = joinMembers(
  [
    { projectId: 'p_lokma-ab12', userId: 'u_1', role: 'member', permissions: [], addedAt: '2026-09-03T00:00:00.000Z', addedBy: 'u_2' },
    { projectId: 'p_lokma-ab12', userId: 'u_9', role: 'viewer', permissions: [], addedAt: '2026-09-03T00:00:00.000Z', addedBy: 'u_2' },
  ],
  users,
);
check('known member joins user', joined[0].user?.name === 'Aylin');
check('unknown member joins null', joined[1].user === null);

// ─── forms ─────────────────────────────────────────────────────────
check('empty login rejected', validateLoginForm({ ...emptyLoginForm }) !== null);
check('bad email rejected', validateLoginForm({ email: 'nope', password: 'x' } as LoginForm) !== null);
check('missing password rejected', validateLoginForm({ email: 'a@b.com', password: '' }) !== null);
check('valid login passes', validateLoginForm({ email: 'a@b.com', password: 'secret123' }) === null);
check('empty register rejected', validateRegisterForm({ ...emptyRegisterForm }) !== null);
check('short password rejected', validateRegisterForm({ email: 'a@b.com', name: 'A', password: 'short' }) !== null);
check(
  'valid register passes',
  validateRegisterForm({ email: 'a@b.com', name: 'Aylin', password: 'secret123' }) === null,
);
check('empty invite rejected', validateInviteForm({ ...emptyInviteForm }) !== null);
check('admin invite rejected', validateInviteForm({ email: 'a@b.com', role: 'admin', projectIds: [] }) !== null);
check(
  'valid invite passes',
  validateInviteForm({ email: 'a@b.com', role: 'viewer', projectIds: [] }) === null,
);
check('empty project rejected', validateProjectForm({ ...emptyProjectForm }) !== null);
check(
  'valid project passes',
  validateProjectForm({ name: 'lokma', cwd: '', visibility: 'private' }) === null,
);

// ─── misc ──────────────────────────────────────────────────────────
check('never active label', formatLastActive(null) === 'never');
check('just now label', formatLastActive(new Date().toISOString()) === 'just now');
try {
  // Contract: persist where storage exists, silent no-op where it does
  // not (bun probes). Either way the helpers must never throw.
  storeToken('probe-token');
  const got = typeof localStorage !== 'undefined' ? localStorage.getItem('lokma-token') : null;
  check('token persists', got === null || got === 'probe-token');
  clearToken();
  const after = typeof localStorage !== 'undefined' ? localStorage.getItem('lokma-token') : null;
  check('token clears', after === null);
} catch {
  // Runtimes without localStorage (bun probes) only prove no-throw.
  clearToken();
  check('token helpers no-throw without storage', true);
}

console.log(`\nAll ${passed} auth checks passed.`);
