# REFACTOR REQUESTS — Lokma UI/UX change inbox

> Owner: user sends one message at a time ("burası böyle olsun, şurası şöyle olsun").
> Each request lands here as a numbered `REQ-XXX` entry (Turkish, verbatim + clarified).
> Implementation happens separately per request (or batched on demand) — this file is the
> single source of truth for WHAT was asked, WHAT was decided, and WHAT shipped.
> Loop `lokma-test-loop` is PAUSED while refactor runs (paused at 191/1000).

## How this works (process)

1. **User sends one request** in chat (e.g. "sidebar dar olsun", "şu buton sağa geçsin").
2. **Agent appends it** below as a new `REQ-XXX` with status `pending`, keeping the user's
   original words plus a one-line clarified interpretation. No code is touched yet.
3. **Agent asks back ONLY if ambiguous** (max 1 short question per request; if obvious,
   implement directly without asking).
4. **Implementation** — for each `REQ-XXX` (or a batch, as the user says):
   - Read the relevant pane/component in `packages/lokma-web/web/src/` fresh.
   - Apply the change (Tailwind v4 tokens, lucide icons, dark-mode safe, no emoji).
   - Verify: `bun x tsc --noEmit` (root) + `bun run build` (web) green, then restart
     ONLY the touched proc via ecosystem file (`pm2 start ecosystem.config.cjs --only lokma-web`),
     never `pm2 kill`.
   - Live-verify on `lokma.fermag.com.tr` (creds path `/root/.lokma-basic-auth`, values never logged).
5. **Close the loop** — mark the entry `done` with commit hash + live proof
   (`/` 200 authed / 401 anon, `/health` 200, bundle hash == disk dist).
6. **Commit discipline** — every request ships as its own atomic English commit
   (`refactor(web): REQ-XXX <what changed>`) + instant `git push origin main`.

## Status values

- `pending` — recorded, not started.
- `in-progress` — being implemented.
- `done` — shipped, verified live, commit hash listed.
- `rejected` — won't do, reason listed.

## Requests

<!-- New entries append below. Newest at bottom. -->

_No requests yet — waiting for the first message._
