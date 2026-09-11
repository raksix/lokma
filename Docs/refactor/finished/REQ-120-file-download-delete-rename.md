# REQ-120 — Workspace file download / delete / rename (browser + pane)

- **Status:** done (2026-09-11, recovery close-out)
- **Asked:** file browser + pane file preview needs download, delete, rename actions
  (orphan request — no original spec file on disk; reconstructed from shipped code).
- **Interpretation:** server exposes jailed delete/rename endpoints + raw read;
  file-browser context menu gains Download/Delete; pane file preview header gains
  Download/Rename/Delete with two-step delete confirm; parent repoints tab on
  rename and closes tab on delete.
- **Touched (server half, commit 55e6ec0):**
  - `packages/lokma-core/src/files/files.ts` — `WorkspaceFiles.remove/rename`
    with root jailing
  - `packages/lokma-web/server/src/routes/files.ts` — `DELETE /api/files` +
    `POST /api/files/rename` with FileError mapping
  - `packages/lokma-web/web/src/lib/api.ts` — `deleteWorkspaceFile`,
    `renameWorkspaceFile` helpers (`readWorkspaceFileRaw` already present)
- **Touched (UI half, this commit):**
  - `packages/lokma-web/web/src/components/files/file-browser.tsx` —
    context menu Download (blob via `readWorkspaceFileRaw`) + Delete
    (`window.confirm`, refresh dir after)
  - `packages/lokma-web/web/src/components/panes/pane.tsx` —
    `PaneFilePreview` header Download/Rename/Delete buttons, inline rename
    input (Enter/Escape), two-step delete confirm (4s auto-reset),
    `onDeleted`/`onRenamed` callbacks; `WorkspacePane`/`PaneTabContent`
    wiring (close tab on delete, repoint `filePath`+title on rename)
- **Proof:** root `bun run typecheck` 0 errors; `bun run build:web` green;
  current bundle `index-HGBAuhXy.js` contains `renameWorkspaceFile`;
  served hash == disk hash after `pm2 restart lokma-web`.
