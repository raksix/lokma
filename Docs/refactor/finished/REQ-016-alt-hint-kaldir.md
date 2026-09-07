# REQ-016 — Alttaki gereksiz bilgi ibarelerini kaldır

- **Status:** done (2026-09-07, live verified — see Proof below)
- **Asked:** 2026-09-07 — "en alttaki 'Session tabs run their own chat. Tool panes share this workspace session. Drag sessions or files here to open, split, fork, or merge.' + 'Sessions persist to ~/.lokma/projects/<hash>/sessions/*.jsonl (CLI + Web share)' bu ibare gereksiz".
- **Interpretation:** Chat altı + tiling altıdaki iki hint satırı tamamen kaldırılır (ekran alanı kazancı). Gerekirse tek `?` kısayol penceresine taşınır — varsayılan: sil.
- **Touched (plan):** `components/app-shell.tsx` (chat altı persist notu), `components/panes/workspace.tsx` (tiling altı hint satırı).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile ibarelerin DOM'da olmadığı kanıtlanır, bundle match.
- **Proof:** removed both hint divs entirely (`app-shell.tsx` persist note under chat, `workspace.tsx` tiling hint under split tree) — no relocation, per default interpretation. Gates: root `tsc --noEmit` 0 errors, web build green `index-OdH9cU5s.js`, single-proc `lokma-web` restart online, served bundle == disk dist (BUNDLE-MATCH), src grep for both strings clean + served bundle grep count 0 (stale superseded chunks on disk still contain them — expected with `emptyOutDir: false`, not served).
