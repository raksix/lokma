# REQ-085 — Terminal double-keypress dedup (REQ-059 follow-up)

- Status: done (2026-09-09, recovery commit — see Proof)
- Asked: no user message on file. Previous tick cut off pre-record: `terminal-pane.tsx`
  carried a complete uncommitted dedup hunk whose comment tagged `REQ-086`, a number
  that was never filed (grep over `Docs/refactor/README.md` + `finished/` returns zero
  hits). Recorded here under the next free number `REQ-085` (REQ-069/071/072/075/084 precedent).
- Interpretation: REQ-059 direct-typing scrollback showed every key doubled — the same
  physical keypress reached the PTY twice (double keydown delivery). Drop the duplicate,
  never the human's intent: held-key auto-repeat (`e.repeat`) always passes; only
  non-repeat duplicates of the identical byte within 50 ms are dropped (a human cannot
  re-press the same key that fast; fast double-Enter is equally inhuman).
- Touched:
  - `packages/lokma-web/web/src/components/terminal/terminal-pane.tsx` — `lastKeyRef`
    (`{ bytes, at }`) + guard in `onTermKeyDown`; orphan comment tag fixed `REQ-086` → `REQ-085`.
- Verify (all green this tick):
  - `bun x tsc --noEmit` in `packages/lokma-web/web` (sterilized env): 0 errors.
  - `bun run build` (sterilized env): green; current chunk
    `dist/assets/terminal-pane-DSM7uwC7.js` (referenced by `dist/index.html` via
    `index-7bh5jWp4.js`) contains the minified guard
    (`!e.repeat` + `Date.now()` + `<50` + `bytes`/`at` ref update).
  - `lokma-web` single-proc restart (`pm2 start ecosystem.config.cjs --only lokma-web`,
    never `pm2 kill`); served `index.html` chunk hash == disk `dist` + served terminal
    chunk carries the guard (BUNDLE-MATCH).
- Proof: recovery commit hash recorded in `Docs/00-LOKMA-KONTEKST.md` chronology.
