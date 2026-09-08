/**
 * Live probe for the REQ-062/REQ-064 role matrix (`./auth` store).
 * Run: `HOME=$(mktemp -d) bun src/auth/roles.test.ts` from
 * `packages/lokma-core`. No test framework — plain asserts so the
 * package stays dependency-free. Real temp HOME on disk (startup env —
 * bun snapshots HOME at boot; the guard below refuses anything outside
 * `/tmp/`). Covers: first user becomes superadmin, legacy `member`
 * normalizes to `calisan`, oldest admin promotes to superadmin while
 * none exists, `can()` matrix (auth:manage superadmin-only,
 * project:create policy), superadmin edit guards, and `canViewSession`
 * isolation (calisan sees own + unattributed, never чужой).
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import {
  AuthError,
  addMember,
  can,
  canViewSession,
  createProject,
  getAuthSettings,
  inviteUser,
  listUsers,
  loginGateActive,
  patchUser,
  registerFirstAdmin,
  saveAuthSettings,
} from './store.js';

const HOME = process.env.HOME ?? '';
if (!HOME.startsWith('/tmp/')) {
  throw new Error(`REFUSE: HOME=${HOME || '(empty)'} — rerun with HOME=$(mktemp -d) bun ...`);
}

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

async function expectCode(fn: () => Promise<unknown>, code: string, label: string): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof AuthError && e.code === code) {
      passed += 1;
      console.log(`PASS: ${label}`);
      return;
    }
    throw new Error(`FAIL: ${label} — wrong error ${(e as Error)?.message}`);
  }
  throw new Error(`FAIL: ${label} — did not throw`);
}

// Gate starts off on a fresh instance.
assert((await loginGateActive()) === false, 'fresh instance has the gate off');
assert((await getAuthSettings()).requireLogin === false, 'requireLogin defaults false');

// First user becomes superadmin.
const { user: owner } = await registerFirstAdmin({ email: 'owner@x.com', name: 'Owner', password: 'password-123' });
assert(owner.role === 'superadmin', 'first user is superadmin');
assert((await loginGateActive()) === false, 'gate still off until flipped');

// Invite a calisan + a viewer; legacy `member` invite normalizes.
const inv = await inviteUser(owner, { email: 'calisan@x.com', role: 'member', projectIds: [] });
assert(inv.user.role === 'calisan', 'legacy member invite normalizes to calisan');
await inviteUser(owner, { email: 'viewer@x.com', role: 'viewer', projectIds: [] });
await expectCode(() => inviteUser(owner, { email: 'boss@x.com', role: 'admin', projectIds: [] }), 'bad_role', 'admin invites refused');

// can() matrix.
const superadmin = owner;
assert(superadmin.role === 'superadmin', 'owner reads back superadmin');
const calisan = (await listUsers()).find((u) => u.email === 'calisan@x.com')!;
const viewer = (await listUsers()).find((u) => u.email === 'viewer@x.com')!;
assert(await can(superadmin, 'auth:manage'), 'superadmin passes auth:manage');
assert(await can(superadmin, 'session:view-all'), 'superadmin passes session:view-all');
assert(!(await can(calisan, 'auth:manage')), 'calisan fails auth:manage');
assert(!(await can(calisan, 'project:create')), 'calisan cannot create under members policy');
assert(!(await can(viewer, 'project:create')), 'viewer cannot create');

// Promote calisan to admin, then verify the admin/superadmin split.
const promoted = await patchUser(calisan.id, superadmin, { role: 'admin', status: 'active' });
assert(promoted.role === 'admin', 'promotion to admin sticks');
assert(await can(promoted, 'project:create'), 'admin creates projects');
assert(!(await can(promoted, 'auth:manage')), 'admin fails auth:manage');

// Admin cannot touch the superadmin row.
await expectCode(() => patchUser(superadmin.id, promoted, { name: 'Hijack' }), 'superadmin_required', 'admin edit of superadmin 403s');
await expectCode(() => patchUser(calisan.id, promoted, { role: 'superadmin' }), 'superadmin_required', 'admin promote-to-superadmin 403s');

// Projects: owner membership is calisan-flavored, members added as calisan.
const project = await createProject(superadmin, { name: 'Probe Project' });
const added = await addMember(project.id, superadmin, { userId: calisan.id, role: 'member' });
assert(added.role === 'calisan', 'legacy member addMember normalizes to calisan');
assert(await can(calisan, 'session:view-own', project.id), 'calisan holds session:view-own');
assert(!(await can(viewer, 'session:view-own', project.id)), 'viewer lacks session:view-own');

// Session ownership isolation.
assert(canViewSession(superadmin, 'sess чужой'), 'superadmin sees every session');
assert(canViewSession(promoted, 'sess чужой'), 'admin sees every session');
assert(canViewSession(calisan, calisan.id), 'calisan sees own session');
assert(!canViewSession(calisan, 'sess чужой'), 'calisan never sees чужой session');
assert(canViewSession(calisan, null), 'calisan sees unattributed legacy sessions');

// Flipping requireLogin needs saveAuthSettings (route-gated to superadmin;
// the store persists whatever it is given — the gate reads it back).
await saveAuthSettings({ requireLogin: true });
assert((await loginGateActive()) === true, 'gate activates once flipped');
await saveAuthSettings({ requireLogin: false });
assert((await loginGateActive()) === false, 'gate deactivates when flipped back');

console.log(`\n${passed} checks passed`);
