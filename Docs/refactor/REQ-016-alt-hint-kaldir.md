# REQ-016 — Alttaki gereksiz bilgi ibarelerini kaldır

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "en alttaki 'Session tabs run their own chat. Tool panes share this workspace session. Drag sessions or files here to open, split, fork, or merge.' + 'Sessions persist to ~/.lokma/projects/<hash>/sessions/*.jsonl (CLI + Web share)' bu ibare gereksiz".
- **Interpretation:** Chat altı + tiling altıdaki iki hint satırı tamamen kaldırılır (ekran alanı kazancı). Gerekirse tek `?` kısayol penceresine taşınır — varsayılan: sil.
- **Touched (plan):** `components/app-shell.tsx` (chat altı persist notu), `components/panes/workspace.tsx` (tiling altı hint satırı).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile ibarelerin DOM'da olmadığı kanıtlanır, bundle match.
