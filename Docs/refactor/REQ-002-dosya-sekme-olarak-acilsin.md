# REQ-002 — Explorer'dan açılan dosya son aktif pane'de sekme açılsın

- **Status:** done (commit `f58f2e7`, live 2026-09-07)
- **Asked:** 2026-09-07 — "file explorerdan bir dosya açılınca son aktif olan session panesinden tab olarak açılsın".
- **Interpretation:** Clicking a file in the Explorer opens (or focuses, if already open) a file tab in the last-focused tiling pane (`focusedPaneId`; fallback: first pane). Same path+session re-click focuses instead of duplicating. If tiling mode is off, it turns on so the tab has a pane to land in. The sidebar inline preview/editor stays as the edit surface; the tab is a read-only preview (`PaneFilePreview`).
- **Touched:** `stores/pane.ts` (transient `pendingFileTab` request slot), `components/panes/panes.ts` (pure `upsertFileTab`), `components/panes/panes.test.ts` (4 new checks), `components/panes/workspace.tsx` (consume effect), `components/files/file-browser.tsx` (`openFile` requests the tab).
- **Proof:** panes probe 71/71 (4 new upsert checks), root+web `tsc` 0, web build green, single-proc restart, live bundle match.
