# REQ-048 — Ayarlardaki Add Provider/Save butonlarına tema arka plan rengi

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-08 — "ayarlarda falan add provider, save gibi bazı butonların arka plan rengi yok, onlar component olması lazımdı zaten, onlara temalarda arka plan rengi eklersin" (SS'e bakılamadı — görüntü servisi 500).
- **Interpretation:** Ayarlar yüzeyindeki (Providers, Settings, vb.) birincil aksiyon butonları (`Add Provider`, `Save`...) şeffaf/sınırsız görünüyor. Hepsi temalı `Button` componentine bağlanır (`variant="default"` → `--primary` bg), light/dark iki temada da dolgulu görünür. Tek tek class yaması yerine component standardı uygulanır.
- **Touched (plan):** ayar panellerindeki çıplak `<button>`lar → `Button` component + tema token kontrolü.
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless SS (light+dark) ile dolgulu buton kanıtı, bundle match.
