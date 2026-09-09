# REQ-076 — Login olmadan hiçbir sisteme erişilemesin (global auth gate)

- **Status:** in-progress (2026-09-09)
- **Asked:** 2026-09-09 — "login olmadan ana sayfaya erişilebiliyor, ben login sistemini açtım. login olmadan hiçbir şekilde lokmanın hiçbir sistemine erişilmemesi lazım, çok büyük güvenlik sorunu. auth sistemi açık bende. kimse login olmadan hiçbir sisteme erişemesin."
- **Gap (confirmed live 2026-09-09):**
  - Live `GET /api/auth/settings` returns `requireLogin: false` while the user sees auth ON in the UI — the toggle state does not match the server (under investigation; the fix below makes the server the single source of truth).
  - Worse: only `sessions` / `todos` / `ws` routes check `loginGateActive()`. All other routes (`files`, `terminal`, `git`, `config`, `providers`, `models`, `agents`, `skills`, `memory`, `vault`, `cron`, `bots`, `commands`, `browser`, `archify`, `design`, `tests`, `themes`, `usage`, `cloud`, `setup`, `plugins`, `observability`) serve **200 without any token** — even with the gate ON. `POST /api/terminal` without a token = unauthenticated remote code execution. Critical.
  - Web `App.tsx` fails OPEN: when `/api/auth/settings` is unreadable it boots straight into the shell.
- **Design:**
  - A. Server global gate: `POST /api/*` + all methods — one `onRequest` hook (`server/src/plugins/auth-gate.ts`) registered before all routes. Gate active (`loginGateActive()` = bootstrapped + `requireLogin`) + no valid token → `401 { code: 'unauthenticated' }`. Public allowlist (pure matcher in `auth-gate-policy.ts`, unit-tested): `GET /health`, `GET /api/health`, `GET /api/auth/settings` (boot gate needs it, policy flags only), `POST /api/auth/login|register|accept-invite|onboarding`, `GET /api/share/:token` + `GET /share/:token` + `GET /share/:kind/:token` (unguessable-token public links, by design). Everything else under `/api/*` gated — including future routes by default. `/ws/*` untouched (own handshake check stays).
  - B. Web fail-closed: `App.tsx` settings-fetch failure boots into `LoginGate` (login mode), never into the shell.
  - C. Live: deploy both, flip `requireLogin: true` on the server, prove with tokenless curl matrix (all `/api/*` → 401 except allowlist) + public URL check.
- **Touched (plan):** server `plugins/auth-gate-policy.ts` (new), `plugins/auth-gate.ts` (new), `plugins/auth-gate-policy.test.ts` (new), `app.ts` (wire hook); web `App.tsx` (fail-closed).
- **Verify (plan):** policy unit test green (`bun`), server `tsc` 0, web `tsc` + `vite build` green, single-proc pm2 restarts, tokenless curl matrix live (401s + allowlist 200s), `/api/auth/me` 401 without token.
- **Proof:** _filled on close._
