# Vendored — Agent Office renderer (pixel office)

This directory carries the **drawing code** of the Office surface. Lokma does
not re-implement the pixel office; it reuses upstream's renderer under its MIT
license and feeds it Lokma's own live data (REQ-204 §6.1).

| | |
|---|---|
| Upstream | <https://github.com/isisever/agent-office> |
| File | `plugin/viewer/core.mjs` (the single source of the drawing code) |
| Commit | `47c3c733e384` (2026-10-12) |
| Fetched | 2026-10-18 |
| Body sha256 | `b211956a4a86b4720ac8f7121897e4a89a117beb1356737041f1a3a90985f2e6` |
| License | MIT — Copyright (c) 2026 isisever (`agent-office-LICENSE.txt`) |

## What is in here

- `agent-office-core.mjs` — the renderer, **byte-identical to upstream below the
  vendor header**. The header carries the attribution and the mutation note the
  MIT license and REQ-204 §4.10 require; it is the only Lokma-authored part.
- `agent-office-core.d.mts` — the typed surface Lokma imports (`render`,
  `hitTest`, `setGeometry`, `resetOffice`, `setLanguage`).
- `agent-office-LICENSE.txt` — upstream license text, shipped verbatim.

## How Lokma uses it

`../office-canvas.tsx` is the browser host: it sizes the canvas, calls
`render(now, data)`, blits the returned RGB framebuffer, and routes clicks
through `hitTest`. `../office-canvas-model.ts` is the pure mapping from Lokma's
row contract (`office-view.ts`) to the renderer's data shape — every field has a
real source; nothing is invented.

## Re-syncing with upstream

1. Download `plugin/viewer/core.mjs` at the new commit.
2. Replace everything **below** the `END OF LOKMA VENDOR HEADER` marker with the
   new body, byte for byte (`cat header.txt new-core.mjs > agent-office-core.mjs`).
3. Re-hash the body: `sed '1,/END OF LOKMA VENDOR HEADER/d' agent-office-core.mjs | sha256sum`
   — compare with the fetched file's own `sha256sum` (the marker line is the split point).
4. Update the header (commit, date, hash) and this table.

The drawing code is never edited in place; keep the vendor body byte-exact so
step 3 stays a one-command check.
