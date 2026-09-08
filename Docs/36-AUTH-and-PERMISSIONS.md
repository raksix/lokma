# Auth & Permissions — RBAC + Project-Scoped Sessions

> **Status:** Design doc · 2026-08-31
> **Language:** English (docs & code English, chat Turkish)
> **Related:** `02-TEKNIK-KARARLAR.md` · `26-CONFIG-and-CREDENTIALS.md` · `30-AGENT-SYSTEM-personality-memory-orchestration-collision.md` · `20-WEB-HARNESS-overview.md` · `22-WEB-FEATURES-provider-model-session.md` · `24-WEB-PANE-SYSTEM-and-orchestration.md`
> **Stack:** NextAuth / Better-Auth or custom JWT (see §7) · `lokma-shared` Zod · Fastify `preHandler` · `~/.lokma/auth.json` (local) / Postgres `users` + `projects` + `project_members` (cloud)

---

## 1. Goals

Lokma is single-tenant by default (your machine, your files). **Auth** adds multi-user when you host `lokma.fermag.com.tr` for a team:

- **One admin** seeds the instance, invites others, owns global config.
- **Users** have **roles** (global) + **project-scoped permissions** (per repo).
- **Projects** are the permission boundary: if you can't see the project, you can't list/open its sessions, files, terminals, or browser.
- **Sessions** inherit the project's ACL — no session-level sharing beyond the project (keeps the model simple; share a project, not a single session).
- **Everything is RBAC + ABAC:** role decides *what* you can do, project membership decides *where*.

This doc is the **single source** for auth. Implementation must be 1:1 with it.

---

## 2. Roles (global) — REQ-062/REQ-064

| Role | Who | What they can do (global) |
|------|-----|---------------------------|
| **superadmin** | First registered user (auto) + anyone promoted by a superadmin; oldest admin auto-promotes while none exists (no migration script) | **Instance owner:** everything an admin does PLUS user/role management on any row, `PATCH /api/auth/settings` (incl. `requireLogin`), promoting others to superadmin, transferring ownership |
| **admin** | Promoted by a superadmin | Projects (create/delete/transfer), invites (calisan/viewer), every session in a project (view/kill), providers/models/themes, usage for all — everything EXCEPT `auth:manage` and touching superadmin rows (`403 superadmin_required`) |
| **calisan** | Invited by admin (default; legacy `member` rows normalize to `calisan` on read/write) | Assigned projects only: create sessions, edit files, run agents in those projects; sees ONLY own sessions (+ unattributed legacy ones) — чужой sessions are invisible, even in lists; cannot create projects (unless policy = `open`), cannot invite, cannot see settings |
| **viewer** | Invited as read-only (optional) | Read-only in assigned projects: list sessions, view chat/code/files/browser (read-only), view logs/orchestration, cannot send prompts, edit files, run tools, or create sessions. Useful for auditors, stakeholders. |

- At least one `admin`/`superadmin` must remain (deleting/demoting the last elevated user is blocked: `409 last admin cannot be removed`).
- Roles are stored in `user.role` (see §8) and enforced in every route guard. `member` is accepted wherever a role is read (legacy alias) but never written back — writes persist `calisan`.

---

## 3. Permissions — Matrix

Permissions are **capabilities**, not just roles. Roles map to a default permission set, but an admin can grant extra per-user.

### 3.1 Global permissions (instance-wide)

| Permission ID | Description | Default: superadmin | admin | calisan | viewer |
|---------------|-------------|---------------------|-------|---------|--------|
| `user:list` | List users | ✓ | ✓ | — | — |
| `user:create` | Invite user | ✓ | ✓ | — | — |
| `user:edit` | Edit user (role, name, perms, reset pw, disable) | ✓ | ✓ (never superadmin rows) | — (own profile only) | — |
| `user:delete` | Remove user | ✓ | ✓ (never superadmin rows) | — | — |
| `auth:manage` | `PATCH /api/auth/settings` (incl. `requireLogin`) | ✓ | — | — | — |
| `session:view-own` | List/read own + unattributed sessions | ✓ | ✓ | ✓ | — |
| `project:create` | Create a new project (see §4.2 policy) | ✓ | ✓ | see §4.2 | — |
| `project:list:all` | List all projects (not just assigned) | ✓ | ✓ | — | — |
| `project:delete` | Delete any project | ✓ | ✓ | — | — |
| `provider:manage` | `POST/PATCH/DELETE /api/providers` + test | ✓ | ✓ | — | — |
| `model:manage` | `PATCH /api/models` + catalog refresh | ✓ | ✓ | — | — |
| `theme:manage` | Change global theme | ✓ | ✓ | — | — |
| `config:manage` | `PATCH /api/config` (global) | ✓ | ✓ | — | — |
| `agent:manage:all` | View/kill any agent, manage caps | ✓ | ✓ | — (own agents only) | — |
| `vault:manage` | Vault sync, graph admin | ✓ | ✓ | — | — |
| `usage:view:all` | See usage for all users | ✓ | ✓ | — (own) | — (own) |

### 3.2 Project-scoped permissions (per `projectId`)

Every `project_members` row has a `role` + `permissions[]` override for that project. If empty, defaults by global role apply (superadmin/admin = all, calisan = `session:*` + `file:*` + `terminal:*` + `browser:*`, viewer = `read` only).

| Permission ID | Description | calisan default | viewer default |
|---------------|-------------|-----------------|----------------|
| `project:view` | See project in list, open it | ✓ | ✓ |
| `project:edit` | Edit project name/path/settings | ✓ (owner) / — | — |
| `session:create` | `POST /api/sessions` in this project | ✓ | — |
| `session:list` | `GET /api/sessions?projectId=` | ✓ (own + unattributed only — §5) | ✓ |
| `session:read` | `GET /api/sessions/:id` + WS replay | ✓ (own + unattributed only — §5) | ✓ |
| `session:write` | Send prompts, edit etc. (means `session:create` already covers new) | ✓ (own only) | — |
| `session:fork` | Fork a session in this project | ✓ (own only) | — |
| `session:view-own` | Ownership scope flag for the §5 filter | ✓ | — |
| `session:delete` | Delete sessions in this project | ✓ (own) | — |
| `file:read` | `GET /api/files*` | ✓ | ✓ |
| `file:write` | Write/Edit via tools | ✓ | — |
| `terminal:use` | Use live terminal logs, run Bash | ✓ | — (view only) |
| `browser:use` | Drive browser preview | ✓ | — (view only) |
| `git:write` | Commit/PR via Git panel | ✓ | — |
| `agent:create` | `create_agent` in this project | ✓ | — |
| `worktree:create` | `EnterWorktree` / branch isolation | ✓ | — |

- If a user is **not a member** of a private project, they get **no** permissions for it ( not even `project:view` ), unless `project_visibility = public` (see §4.1).
- **Session ownership:** `session:delete` for members is `own` by default — an admin can set it to `all` per project if desired. Viewer never gets delete.

---

## 4. Projects — Visibility & Creation Policy

### 4.1 Visibility

| Visibility | Who can see | Use case |
|------------|-------------|----------|
| `private` (default) | Only `project_members` + admins (via `project:list:all`) | Secret repos, client work |
| `public` | All authenticated users (`project:view` implied, but `session:create` still requires membership) | Shared templates, docs |

- Private is the safe default — prevents accidental listing.
- Public still respects `session:create` — seeing the project doesn't mean you can spam sessions in it.

### 4.2 Creation policy (global, §8 `settings.projectCreation`)

| Policy | Who can `POST /api/projects` |
|--------|------------------------------|
| `admin-only` | Only `admin`/`superadmin` → others get `403 project:create requires admin` |
| `members` (default) | `admin`/`superadmin` only (`calisan` never creates — REQ-064) |
| `open` | Any authenticated user |

- This is the toggle the user asked for: **“proje oluşturma (yoksa sadece atanan projelerde session açabilir vs)”** — set to `admin-only` if you want only admins to create projects; everyone else can only open sessions in projects they are assigned to.
- Recommended default `members` — balanced, but lock to `admin-only` for tightly managed teams.

### 4.3 Project lifecycle

```
POST /api/projects { name, cwd, visibility, visibility }  → requires `project:create` per policy
  → creates `projects` row + `project_members` row for creator as `owner` (all perms)
  → cwd is on the server's FS (local mode) or volume (cloud)

PATCH /api/projects/:id { name, visibility } → requires `project:edit`
  → visibility change is audit-logged

DELETE /api/projects/:id → requires `project:delete` + confirm (also deletes sessions/files index for that project, not the FS cwd)

POST /api/projects/:id/members { userId, role, permissions[] } → admin or project owner with `project:edit`
  → adds/updates membership; `role` can be `member`/`viewer` per project (overrides global role for that project)

DELETE /api/projects/:id/members/:userId → same guard
```

---

## 5. Sessions — Inheritance + Ownership (REQ-062/REQ-064)

- **Sessions belong to exactly one `projectId`.** On `POST /api/sessions { projectId, initialPrompt, model }`, the server checks `session:create` for that `projectId`. If `projectId` is null (legacy), it requires `project:list:all` or falls back to user's default project.
- **Ownership stamp:** every created/forked session records `meta.ownerId` (the caller token's user id; absent for anonymous/legacy sessions). See `SessionMeta.ownerId` + `SessionSummary.ownerId`.
- **Calisan isolation (`canViewSession`):** superadmin/admin see every session. Everyone else sees ONLY sessions they own PLUS unattributed (`ownerId` null) legacy sessions. `GET /api/sessions` filters the list; `GET /:id`, fork, PATCH, DELETE, merge, rewind return `403 not your session` for чужой rows; `/search` drops чужой hits. A calisan never sees чужой session — not even its title.
- **Listing:** `GET /api/sessions` without `projectId` returns only sessions from projects the user can `session:list` in (filtered by membership for non-admins). Admin with `project:list:all` sees all, but the UI still groups by project.
- **Resuming:** `GET /api/sessions/:id` checks `session:read` for its `projectId` (+ ownership); `POST /api/sessions/:id/resume` (WS replay) checks `session:write` if the user will send prompts.
- **Sharing:** share a **project**, not a session — adding a user to the project instantly grants `session:read` (viewer) or `session:create/write` (calisan) for all sessions in it. No per-session ACL to avoid the “which link did I share?” bug.

---

## 6. User Management

### 6.1 Invite flow (admin only)

```
Admin → Settings → Users → Invite
  → dialog: email, role (member/viewer), projects[] (multi-select, optional), sendInvite?
  → POST /api/users/invite { email, role, projectIds[] }
    → creates `users` row with `status: invited`, `inviteToken` (hashed), expiry 7d
    → emails invite link `https://lokma.fermag.com.tr/invite?token=...` (or shows copyable link if email not configured)
    → invited user sets password on first open (or OAuth if `auth.providers` includes google/github)
```

### 6.2 Auth

- **Local:** email + password (scrypt, `credentials.json` style but per-user in DB), httpOnly `lokma_token` cookie (JWT, 7d, `Secure; SameSite=Lax`), `Authorization: Bearer` also accepted for CLI (`LOKMA_API_KEY` style per-user API key).
- **OAuth (optional, Phase 2):** Google/GitHub via `better-auth` / NextAuth — same `users` table, `provider: google`.
- **First admin:** `lokma init --admin admin@example.com` or env `LOKMA_ADMIN_EMAIL` + `LOKMA_ADMIN_PASSWORD` on first boot seeds the admin. If `~/.lokma/auth.json` empty, the first `POST /api/auth/register` becomes admin.

### 6.3 Data model

```ts
// lokma-shared/src/schemas/user.ts
const RoleSchema = z.enum(["admin","member","viewer"])
const UserSchema = z.object({
  id: z.string(), // nanoid / cuid
  email: z.string().email(),
  name: z.string().min(1).max(40),
  role: RoleSchema, // global
  status: z.enum(["active","invited","disabled"]),
  permissions: z.array(z.string()).default([]), // global overrides, e.g. ["project:create"]
  createdAt: z.string().datetime(),
  lastActiveAt: z.string().datetime().nullable(),
})
// lokma-shared/src/schemas/project.ts
const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  cwd: z.string(), // e.g. /mnt/apopic/lokma or /home/lokma/projects/xyz
  visibility: z.enum(["private","public"]).default("private"),
  ownerId: z.string(), // user.id
  createdAt: z.string().datetime(),
})
const ProjectMemberSchema = z.object({
  projectId: z.string(),
  userId: z.string(),
  role: z.enum(["member","viewer"]).default("member"),
  permissions: z.array(z.string()).default([]), // overrides for this project
  addedAt: z.string().datetime(),
  addedBy: z.string(),
})
// Settings (global)
const AuthSettingsSchema = z.object({
  projectCreation: z.enum(["admin-only","members","open"]).default("members"),
  projectVisibilityDefault: z.enum(["private","public"]).default("private"),
  inviteExpiryDays: z.number().default(7),
  sessionRetentionDays: z.number().nullable().default(null), // null = forever
})
```

Storage: SQLite `users` + `projects` + `project_members` + `settings` (or Postgres in cloud, same drizzle schema). `auth.json` for local single-user fallback is migrated to DB on first multi-user invite.

---

## 7. Enforcement — Server & Web

### 7.1 Fastify `preHandler`

Every protected route has `config: { auth: true, permission: "project:create" | "session:read" }`. The `preHandler` hook (see `22-*` style) does:

```ts
app.addHook("preHandler", async (req, reply) => {
  if (!req.routeOptions.config?.auth) return
  const user = await verifyJwt(req.cookies.lokma_token ?? req.headers.authorization?.replace("Bearer ",""))
  if (!user) return reply.code(401).send({ error: "unauthenticated" })
  if (user.status !== "active") return reply.code(403).send({ error: "account disabled or invited" })
  req.user = user

  const perm = req.routeOptions.config.permission as string | undefined
  if (!perm) return
  // Resolve projectId from params/query/body if perm is project-scoped
  const projectId = req.params?.projectId ?? req.query?.projectId ?? req.body?.projectId ?? await getProjectIdForSession(req.params?.sessionId)
  const allowed = await can(user, perm, projectId) // checks global role + project_members + settings.projectCreation
  if (!allowed) return reply.code(403).send({ error: `forbidden: missing ${perm} ${projectId ? `for project ${projectId}` : ""}` })
})
```

`can()` precedence: `admin` → always true for any perm (unless `project:delete` last-admin guard) → then check `user.permissions` → then check `project_members` for `projectId` (role default + per-project `permissions[]`) → then `settings.projectCreation` for `project:create` → else false.

### 7.2 Web

- **Login:** `/login` (email/password + OAuth buttons), redirect to `?next=` after auth, `lokma_token` httpOnly.
- **Users page:** `Settings → Users` (admin-only nav item, hidden for member/viewer). Table `Name | Email | Role | Status | Projects | Actions (Edit/Disable/Delete/Reset password/Copy invite link)`, search, invite dialog.
- **Projects page:** `Projects` pane + `+ New Project` button. If user lacks `project:create`, button is disabled with tooltip `Only admins can create projects (ask an admin)` when policy `admin-only`.
- **Sessions pane:** `GET /api/sessions` already filtered — viewer sees only `read`, member sees `create` button enabled, viewer sees it disabled with `Read-only in this project`.
- **Top bar:** if `session:write` is false, composer is disabled + `Read-only` badge.
- **Command palette:** filters actions by `can` — e.g. `Manage Providers` hidden for non-admin.

All `fetch` include `credentials: "include"` so the httpOnly cookie is sent; CLI uses `Authorization: Bearer <apiKey>` (per-user key from `Settings → API keys`).

---

## 8. APIs

```
POST   /api/auth/register           → first admin seed (no auth), thereafter 401
POST   /api/auth/onboarding         → fresh only: { requireLogin } → persists onboardingDone (REQ-066 §14)
POST   /api/auth/login              → { email, password } → sets lokma_token cookie + { user }
POST   /api/auth/logout             → clears cookie
GET    /api/auth/me                 → { user } (requires auth)
POST   /api/auth/invite             → admin: { email, role, projectIds[] } → { user, inviteLink }

GET    /api/users                   → admin: { users: User[] }  (403 for others)
POST   /api/users/invite            → admin: { email, role, projectIds[] }
PATCH  /api/users/:id               → admin: { name, role, permissions[], status }
DELETE /api/users/:id               → admin: 204 (blocks last admin)
POST   /api/users/:id/reset-password → admin: { tempPassword or resetLink }

GET    /api/projects                → { projects: Project[] } (filtered by `can` + visibility)
POST   /api/projects                → { project: Project }  (requires `project:create` per policy)
GET    /api/projects/:id            → { project, members: ProjectMember[] } (requires `project:view`)
PATCH  /api/projects/:id            → { project } (requires `project:edit`)
DELETE /api/projects/:id            → 204 (requires `project:delete`)
GET    /api/projects/:id/members    → { members: ProjectMember[] }
POST   /api/projects/:id/members    → { member: ProjectMember } (requires `project:edit`)
DELETE /api/projects/:id/members/:userId → 204

GET    /api/sessions[?projectId]    → filtered by `session:list`
POST   /api/sessions                → requires `session:create` for projectId
... existing sessions/files/terminal/browser/mcp routes now all require `auth` + project-scoped perm as per §3.2/§5

GET    /api/settings/auth           → { projectCreation, projectVisibilityDefault } (admin: full, others: read-only)
PATCH  /api/settings/auth           → admin: { projectCreation, ... }
```

All `401` → `{"error":"unauthenticated"}`, `403` → `{"error":"forbidden: missing <perm>"}` with `WWW-Authenticate` hint for CLI.

---

## 9. Security & Gotchas

- **Never return `apiKeyEncrypted` or `passwordHash`** — only `keySet` boolean (as in `22-*` providers). Same for `inviteToken` (hashed).
- **Audit log:** every `user:create/edit/delete`, `project:create/delete`, `project_members` change, `permission` change writes to `audit_log` (`actorId`, `action`, `target`, `at`, `ip`).
- **Rate limit:** `/api/auth/login` + `/api/auth/invite` behind `limit_req zone=auth 3r/m` (as in `nginx.conf`).
- **Invite expiry:** 7d, one-time use, invalidated on password set.
- **Last admin guard:** `DELETE /api/users/:id` + `PATCH role` that would leave 0 admins → `409 last admin cannot be removed`.
- **Project delete guard:** confirm dialog with `type project name` + deletes only the DB index + `project_members`, never `rm -rf cwd` (ask separately).
- **Worktree isolation:** sessions in a worktree (`EnterWorktree`) still check `project:view` + `worktree:create` — the FS path is still under the project's `cwd`.

---

## 10. Migration

- **Single-user → multi-user:** on first `POST /api/users/invite`, migrate `~/.lokma/auth.json` (if exists) + `~/.lokma/config.json` `users[0]` to DB, create `projects` from existing `~/.lokma/projects/*` dirs, add the inviter as `owner` of each.
- **Env override:** `LOKMA_AUTH_DISABLED=1` keeps the current single-user mode (no `preHandler` checks) for local dev — not for `lokma.fermag.com.tr`.
- **REQ-062 roles (no script, in-memory):** `readUsers()` normalizes legacy `member` → `calisan` on every read (writes persist the canonical value, so the file converges), and promotes the oldest active `admin` to `superadmin` while no superadmin row exists. Pre-062 instances boot with identical behavior and gain the new matrix without touching `users.json`.
- **REQ-062 sessions:** `meta.ownerId` is absent on all pre-062 sessions → they read as unattributed → visible to every project member (§5). Isolation only narrows sessions created after the upgrade.

---

## 12. Login gate — `requireLogin` (REQ-062 Parça A, REQ-063)

One switch, three surfaces, all keyed on `loginGateActive()` = bootstrapped AND `settings.requireLogin` (default `false` — existing open instances keep working until a superadmin flips it in the Auth pane or `settings.json`):

- **Web App (`App.tsx`):** boot probes `GET /api/auth/settings` (public: settings + `bootstrapped`) then `GET /api/auth/me` (quiet, no `/login` bounce). Gate active + 401 → full-screen `LoginGate` (login form; register variant only pre-bootstrap). No shell, no tabs, no session until 200. Gate off → straight to `AppShell` (legacy behavior).
- **REST:** every `/api/sessions/*` + `/api/projects/:id/todos/*` route resolves the caller first — 401 tokenless while the gate is on, legacy-open while off. (User/project/admin routes always required a token once bootstrapped — unchanged.)
- **WS (`/ws/:sessionId`):** handshake probe closes tokenless sockets with `4401 login required` (+ an `error/login_required` frame first so the client toasts instead of hanging). Token rides `?token=` (browsers cannot set WS headers) or the httpOnly `lokma_token` cookie. Gate checks fail open — a gate-probe crash never breaks the socket; the prompt path re-resolves the user per turn anyway.

---

## 13. Todos + agent claims (REQ-062 Parça C, REQ-065)

`~/.lokma/todos/<projectId>.json`, shapes in `lokma-shared/schemas/todo.ts`, store in `lokma-core/todos/store.ts`:

- `{ id, projectId, title, status: open|claimed|done, claimedBy: { sessionId, userId, claimedAt } | null, leaseUntil: epoch-ms | null }`. Default lease 5 min (`TODO_CLAIM_LEASE_MS`), heartbeat cadence ~60 s (`TODO_HEARTBEAT_MS`, approximated by once-per-agent-turn).
- **Claim** (`claimTodo` / `POST .../claim`) is one atomic file write (`writeAtomic` tmp+rename): `open → claimed` + holder + lease together. Live чужой lease → `409 todo_claimed` + holder (never a silent double-take). Same-session re-claim is idempotent (extends). Expired leases sweep to `open` on next touch — dead loops orphan nothing.
- **Heartbeat:** `heartbeatTodo` (holder only, quiet false otherwise) + `heartbeatSession(sessionId)` (cross-project sweep, called once per agent turn, best-effort so it never breaks a turn).
- **Agent tools** (`buildTodoTools({ sessionId, userId })`, registered in the server agent loop): `list_todos` (read), `claim_todo` + `complete_todo` (WRITE_TOOLS → ask by default; failures return `{ ok: false, code }` results, never throw into the turn).
- **UI:** Todo pane (Inspector rail + tiling tabs) — project picker, Open / Claimed by me / In progress / Done groups, claim button (409 names the holder session), "Do with AI" (mints a session, claims the todo to it, stages the work prompt via `INITIAL_PREFIX` so chat auto-sends on open), done/release/delete.

---

## 14. First-run onboarding — `onboardingDone` (REQ-066)

Fresh instances (unbootstrapped, `settings.onboardingDone === false`) boot into a full-screen `OnboardingWizard` (`web/src/components/auth/onboarding-wizard.tsx`, unskippable like `LoginGate`, not a pane): welcome → "do you want login?" → owner account (auth path) or open-instance confirm (open path). Step machine (`onboarding.ts`: `nextStep`/`prevStep`/`stepIndex`) is unit-probed 15/15; forms reuse `validateRegisterForm`.

- **Auth path:** `POST /api/auth/register` bootstraps (first account = superadmin), the wizard stores the token, then the fresh superadmin flips `{ requireLogin: true, onboardingDone: true }` via the authed `PATCH /api/auth/settings` and lands straight in the shell. Retry-safe: a failed policy PATCH retries the PATCH only (`accountCreated` flag — re-register would 403 as already-bootstrapped).
- **Open path:** `POST /api/auth/onboarding { requireLogin }` persists `{ requireLogin: false, onboardingDone: true }` server-side and answers `{ ok, settings, bootstrapped: false }`. Unbootstrapped-only (bootstrapped → 403 `auth_already_bootstrapped`, same code as late register); idempotent while fresh. No privilege risk — a fresh instance is already single-user-open (§10), this only writes the two onboarding keys.
- **Gate (`App.tsx`):** unbootstrapped + not done → `onboarding` phase; unbootstrapped + done (owner picked open) → shell (legacy behavior); bootstrapped instances never see the wizard. Later flips (open → login, new accounts) stay in the Auth pane (`requireLogin` toggle + `inviteUser`, REQ-062).

---

## 11. UI Mock Checklist (for the next design prompt)

When you generate the next Claude Light mock, include these auth surfaces:

- [ ] `/login` (email/password + OAuth, `lokma_token` httpOnly)
- [ ] `Settings → Users` table (admin-only, Invite dialog with email/role/projects, Edit/Disable/Delete, Copy invite link)
- [ ] `Settings → Auth` (projectCreation `admin-only/members/open` + visibility default)
- [ ] `Projects` pane (`+ New Project` disabled tooltip when `admin-only`, visibility badge `private/public`, `…` → Manage members)
- [ ] `Project → Manage members` dialog (add user, role member/viewer, per-project permissions checkboxes from §3.2)
- [ ] Sessions filtered (viewer: composer disabled + `Read-only` badge, member: `+ New Session` enabled)
- [ ] Top bar permission hints (if `provider:manage` false, `Manage Providers` hidden from palette)
- [ ] Audit log drawer (optional, admin)

---

*Next: implement `lokma-shared/src/schemas/user.ts` + `project.ts` + `projectMember.ts` + `authSettings.ts` (Zod), then `lokma-core/src/auth/*` (verifyJwt, can, invite), then Fastify `preHandler` + `24-*` pane updates.*

