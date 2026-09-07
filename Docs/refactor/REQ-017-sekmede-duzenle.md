# REQ-017 — File browser'dan açılan dosyalar IDE gibi düzenlenebilir olacak

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "file browserdan açılan tüm dosyalar vscode'daki ide gibi ide gibi düzenlenebilcek işte anladın sen".
- **Interpretation:** Pane'de açılan dosya sekmeleri (`PaneFilePreview`, şu an read-only + "edit in the Explorer" yönlendirmesi) VS Code tarzı düzenlenebilir editöre dönüşür: sekmede yaz → kaydet (mevcut `POST /api/files/write` + `expectedSha` lost-update guard aynen kullanılır, 409 → conflict UI pane sekmesine taşınır). Sidebar'daki küçük editör kalabilir ama asıl düzenleme sekmede olur; sekme başlığında dirty (kaydedilmemiş) göstergesi olur.
- **Touched (plan):** `components/panes/pane.tsx` (`PaneFilePreview` → editable: textarea/code alanı + Save + dirty dot + conflict UI), sekme başlığına dirty işareti (`panes.ts` ya da tab bar).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile dosyayı sekmede değiştirip kaydedip diskte doğrulama + stale-sha conflict akışı kanıtlanır, bundle match.
