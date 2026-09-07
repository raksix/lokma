# REQ-005 — Session listeden pane'e session ekleme çalışmıyor

- **Status:** done (commit `d279dec`, live 2026-09-07)
- **Asked:** 2026-09-07 — "sol menüden session alıp pane olarak ekleyemiyorum concept tasarımda bu vardı bu sistemi yapalım düzelt".
- **Diagnosis:** Drop target (`WorkspacePane` handleDrop + `SessionDropChooser`) ONLY exists in tiling mode — in single-chat mode there is nowhere to drop, so the drag silently does nothing. Fix on both paths: (1) session-row `dragstart` with tiling off auto-enables tiling + toast so a drop target always exists; (2) NEW explicit affordance — row hover action "Open as pane tab" (`Columns2` icon) opens/focuses the session tab in the last-focused pane (no DnD needed), enabling tiling first when off.
- **Touched:** `stores/pane.ts` (transient `pendingSessionTab` slot), `components/panes/panes.ts` (pure `upsertSessionTab`), `components/panes/panes.test.ts` (new checks), `components/panes/workspace.tsx` (consume effect), `components/sessions/sessions-sidebar.tsx` (dragstart auto-tiling + pane-tab button).
- **Proof:** root `tsc --noEmit` 0, panes probe 76/76 + shell 10/10, web `bun run build` green (`index-D0SHuMhW.js` 447919 B), single-proc `lokma-web` restart via ecosystem file, live `/` 200 authed + `/health` 200 + `/api/bots` 401 anon, served bundle byte-identical to disk dist.
