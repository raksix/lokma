# REQ-024 — Mobil görünüm ayrı sade deneyim: pane sistemi yok, single view

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "mobil görünüm için ayrı bir kısım gibi olacak, her özellik olacak ama pane sistemine gerek yok, mobilde sadece single görünüm falan olsun".
- **Interpretation:** Mobil breakpoint altında uygulama ayrı sade moda geçer: TÜM özellikler erişilebilir kalır (chat, sessions, explorer, inspector içerikleri, ayarlar) ama tiling/windowed pane sistemi yoktur — sadece single görünüm (tek yüzey + alt/üst navigasyon ya da sekmeler). Mevcut mobil drawer'lar bu yapıya evrilir; pane sürükle-bırak, split, windowed mobilde hiç açılmaz.
- **Touched (plan):** `app-shell.tsx` mobil dalı (pane sistemi yerine single yüzey + mobil nav), `useIsMobile` eşiği, tiling store mobilde zorla kapalı.
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, 390px headless ile tüm özelliklere ulaşıldığı + pane UI'ının hiç render olmadığı kanıtlanır, bundle match.
