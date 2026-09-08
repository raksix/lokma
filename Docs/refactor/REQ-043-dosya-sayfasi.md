# REQ-043 — Inspector ve Explorer ayrı sayfa; rail'e dosya ikonu, o sayfada sadece dosyalar

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "Inspector da explorer ayrı sayfa olarak olacak, inspector'ın yan küçük menüsüne dosya ikonu eklersin, vscode'daki gibi, o sayfada sadece dosyalar gözükecek, tamam mı?"
- **Interpretation:** Inspector ve Explorer iki AYRI sayfa/görünüm olur (aynı panelde üst üste değil). Inspector yanındaki ince şeride (rail) VS Code'daki gibi dosya ikonu eklenir; o sayfa açılınca SADECE dosyalar görünür (sessions/server kartı yok). REQ-034'ün devamı niteliğinde (file explorer'ın tek yuvası = bu dosya sayfası).
- **Touched (plan):** rail'e files ikonu + Inspector'da files sayfası (sadece `FileBrowser`), Explorer sayfasından FileBrowser çıkışı.
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile dosya sayfasında sadece ağaç olduğu + Explorer'da dosya olmadığı kanıtlanır, bundle match.
