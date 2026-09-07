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

### REQ-001 — Explorer sağ menüde olacak
- **Status:** done (commit `b72bd77`, live 2026-09-07)
- **Asked:** 2026-09-07 — "explorer kısmı sağ menüde olacak" (screenshot: Explorer panel with sessions + file tree).
- **Interpretation:** Explorer (sessions + file browser + server card) moves from the LEFT sidebar to the RIGHT sidebar; Inspector moves to the LEFT. Shortcuts/labels follow (`]` = Explorer, `[` = Inspector, Ctrl+P toggles right).
- **Touched:** `packages/lokma-web/web/src/components/app-shell.tsx`, `header.tsx` (toggle titles), `shell/shortcuts.ts` (descriptions), `shell/responsive.ts` (layout comment).
- **Proof:** root `tsc --noEmit` 0, web `bun run build` green (`index-BFI34VKx.js`), single-proc `lokma-web` restart via ecosystem file, live `/` 401 anon / 200 authed, `/health` 200, `/api/bots` 401 anon, served bundle == disk dist.

### REQ-002 — Explorer'dan açılan dosya son aktif session pane'inde tab açılsın
- **Status:** done (commit `f58f2e7`, live 2026-09-07)
- **Asked:** 2026-09-07 — "file explorerdan bir dosya açılınca son aktif olan session panesinden tab olarak açılsın".
- **Interpretation:** Clicking a file in the Explorer opens (or focuses, if already open) a file tab in the last-focused tiling pane (`focusedPaneId`; fallback: first pane). Same path+session re-click focuses instead of duplicating. If tiling mode is off, it turns on so the tab has a pane to land in. The sidebar inline preview/editor stays as the edit surface; the tab is a read-only preview (`PaneFilePreview`).
- **Touched:** `stores/pane.ts` (transient `pendingFileTab` request slot), `components/panes/panes.ts` (pure `upsertFileTab`), `components/panes/panes.test.ts` (4 new checks), `components/panes/workspace.tsx` (consume effect), `components/files/file-browser.tsx` (`openFile` requests the tab).
- **Proof:** panes probe 71/71 (4 new upsert checks), root+web `tsc` 0, web build green, single-proc restart, live bundle match.

### REQ-003 — New Session butonuna renk ekle
- **Status:** done (commit `887b574`, live 2026-09-07)
- **Asked:** 2026-09-07 — "new session butouna renk ekle".
- **Interpretation:** The sidebar "New Session" CTA gets the terracotta brand color (`bg-terracotta`, hover `bg-terracotta-hover`, white text — dark-mode guarded in `index.css`) so it stands out as the primary action. `cn`+twMerge drops the conflicting `bg-primary` automatically.
- **Touched:** `components/sessions/sessions-sidebar.tsx` (button classes only).
- **Proof:** live crop — burnt-orange button, white text; root+web `tsc` 0, web build green, live bundle match.

### REQ-004 — Açık temadaki siyah borderlar yumuşatılacak
- **Status:** done (commit `d7b44ca`, live 2026-09-07)
- **Asked:** 2026-09-07 — "açık temadaki siyah borderlar çok göz sikiyor onu düzelt".
- **Interpretation:** Hard near-black (`#262624`) fills/outlines in light theme go soft/brand: composer mode-toggle pill becomes a light track (`border-line`/`bg-muted`, dark keeps the black pill); testing stage selected-pill becomes terracotta in light (dark keeps white); `Sidebar` gets an explicit `border-line` side border (the old dynamic `border-${...}` class never compiled, so dividers were missing/uncontrolled). Dark surfaces (model popup, testing console, badges) stay dark — intentional.
- **Touched:** `components/chat/composer.tsx`, `components/testing/testing-pane.tsx`, `components/sidebar.tsx`, `components/shell/theme.ts` (+ `theme.test.ts`, 4 new checks).
- **Root cause (proven live):** dark server theme (omp) stamps `--border: 240 4% 16%` inline on `<html>`; the header toggle back to light only flipped the `.dark` class, so the global `*` border rule kept painting every border `rgb(39,39,42)`. `applyTheme('light')` now clears the stamped set.
- **Proof:** headless toggle probe BEFORE `--border 240 4% 16%`/header `rgb(39,39,42)` → AFTER `--border 36 18% 88%`, header/aside/cards/toggle-border all `rgb(230,226,219)`, toggle track `rgb(242,240,235)`; theme probe 27/27; root+web `tsc` 0; web build green (`index-D8EkNuWG.js`); live bundle match, `/` 401 anon/200 authed, `/health` 200.
