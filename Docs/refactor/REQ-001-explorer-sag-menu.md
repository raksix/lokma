# REQ-001 — Explorer sağ menüde olacak

- **Status:** done (commit `b72bd77`, live 2026-09-07)
- **Asked:** 2026-09-07 — "explorer kısmı sağ menüde olacak" (screenshot: Explorer panel with sessions + file tree).
- **Interpretation:** Explorer (sessions + file browser + server card) moves from the LEFT sidebar to the RIGHT sidebar; Inspector moves to the LEFT. Shortcuts/labels follow (`]` = Explorer, `[` = Inspector, Ctrl+P toggles right).
- **Touched:** `packages/lokma-web/web/src/components/app-shell.tsx`, `header.tsx` (toggle titles), `shell/shortcuts.ts` (descriptions), `shell/responsive.ts` (layout comment).
- **Proof:** root `tsc --noEmit` 0, web `bun run build` green (`index-BFI34VKx.js`), single-proc `lokma-web` restart via ecosystem file, live `/` 401 anon / 200 authed, `/health` 200, `/api/bots` 401 anon, served bundle == disk dist.
