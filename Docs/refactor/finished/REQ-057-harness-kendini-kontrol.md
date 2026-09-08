# REQ-057 — Harness kendi içindeki her şeyi kontrol edebilsin

- **Status:** done 2026-09-08 — commit 98823d4 (agent loop drives its own UI: `ui_action` WS frame + `open_browser`/`open_terminal`/`open_session` tools; 11/11 probes pass, root tsc 0, server+web builds green, lokma-server+lokma-web single-proc restarted online, served bundle == disk dist with consumer strings live).
- **Asked:** 2026-09-08 — "lokmanın kendi harness'i lokmanın içindeki her şeyi kontrol edebiliyor olacak. örnek: browser açabilecek, url girebilecek, browser kontrol edebilecek. terminal açıp pane ayarlayıp terminalde komut çalıştırabilecek. yani her şeyi kontrol edebilecek, isterse new session pane açıp ona prompt verebilecek, fifashn proje oluşturabilecek".
- **Interpretation:** Agent loop'a UI-kontrol yetenekleri eklenir: browser pane aç + URL gir + gez, terminal pane aç + komut çalıştır, new session aç + prompt gönder, proje oluştur — hepsi WebSocket/komut kanalından, kullanıcının eliyle yaptığı her şey agent tarafından da yapılabilir olur.
- **Mevcut durum notu:** Server tarafında agent tool'ları (terminal/browser çalıştırma) ZATEN var — demolar komut koşturdu. Eksik olan WEB UI yüzeyini sürmesi (pane açma, URL girme, session açıp prompt basma). Plan bu boşluğu kapatır.
- **Touched (plan):** agent-loop tool seti (ui-control tool'ları) + WS komutları + ilgili pane'ler.
- **Verify (plan):** root+web `tsc` 0, build'ler green, restart'lar, headless E2E: agent komutuyla browser açıp URL gezme + terminalde komut + new session prompt kanıtı, bundle match.
