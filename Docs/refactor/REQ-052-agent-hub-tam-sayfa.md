# REQ-052 — Agent Hub tam sayfa kaplasın, daha detaylı olsun

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-08 — "agent hub tam sayfayı kapasın, daha detaylı olsun" (SS'e bakılamadı — görüntü servisi 500).
- **Interpretation:** Agent Hub dar panel yerine tam sayfa görünüm olur: her agent için durum (running/idle/error), model, bütçe/kota çubuğu, son aktivite, tokEN harcaması + toplu aksiyonlar (pause/resume/kill). REQ-025 (tasarım iyileştirme) ile birleşir — bu istek sayfa kapsamını, REQ-025 görsel dili tanımlar.
- **Touched (plan):** agents/orchestration pane'leri (tam sayfa düzen + detay kartları).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless SS (light+dark) kanıtı, bundle match.
