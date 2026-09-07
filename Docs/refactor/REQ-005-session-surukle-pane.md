# REQ-005 — Session listeden pane'e session ekleme çalışmıyor

- **Status:** in-progress
- **Asked:** 2026-09-07 — "sol menüden session alıp pane olarak ekleyemiyorum concept tasarımda bu vardı bu sistemi yapalım düzelt".
- **Diagnosis:** Drop target (`WorkspacePane` handleDrop + `SessionDropChooser`) ONLY exists in tiling mode — in single-chat mode there is nowhere to drop, so the drag silently does nothing. Fix on both paths: (1) session-row `dragstart` with tiling off auto-enables tiling + toast so a drop target always exists; (2) NEW explicit affordance — row hover action "Open as pane tab" (`Columns2` icon) opens/focuses the session tab in the last-focused pane (no DnD needed), enabling tiling first when off.
- **Touched:** `stores/pane.ts` (transient `pendingSessionTab` slot), `components/panes/panes.ts` (pure `upsertSessionTab`), `components/panes/panes.test.ts` (new checks), `components/panes/workspace.tsx` (consume effect), `components/sessions/sessions-sidebar.tsx` (dragstart auto-tiling + pane-tab button).
- **Verify:** panes+shell probes green, root+web `tsc` 0, web build green, single-proc restart, live bundle match + headless drag-drop opens the chooser.
