# REQ-040 — Session açılınca VS Code gibi yeni sekme olarak eklensin

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "bir dosya açık pane'de ama ben session açınca onu yeni tab olarak eklemiyor, vscode tab sistemi gibi olacak".
- **Interpretation:** Pane'de dosya sekmesi açıkken session açılınca mevcut sekme DEĞİŞMEMELİ — session VS Code mantığıyla YENİ sekme olarak eklenmeli (sekmeler birikir, aktif olan değişir, kapatılmadıkça kaybolmaz). Mevcut `upsertSessionTab` aynı session'ı focus'luyor ama farklı session açılışında replacing davranışı gözlenecek ve düzeltilecek.
- **Touched (plan):** `components/panes/workspace.tsx` + `pane.tsx` (session açma akışı — append, replace değil), `panes.ts` (gerekirse).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile dosya sekmesi açıkken session açıp iki sekmenin de durduğu kanıtlanır, bundle match.
