# REQ-079 — Terminal sade: full-panel icerik, bar yok, otomatik shell

- **Status:** done (canlida — 2026-09-09)
- **Asked:** 2026-09-09 — "terminalin sadece icerik kismi olsun, tum paneli kaplasin; terminalin kendi sutundaki bari kaldir; terminale yazi yazilamiyor fixle".
- **Teşhis (canli E2E):** yazma mekanizmasi SAGLAM (TABINDEX:0, ECHO-BACK:true), shell baslatma SAGLAM. Sorun: pane bos aciliyor (`noShells`), kullanici bos ekrana yazmaya calisiyor. Cozum: barlari kaldir + shell yoksa otomatik baslat.
- **Did:** `TerminalPane` chrome-free — ust bar (baslik+sekmeler+butonlar) + ikinci bar (cwd/status/filter/follow/kill) + alt bar (hint/ws) kalkti, sadece scrollback tum paneli kapliyor. Mount'ta running terminal yoksa auto-create (session basina tek deneme, ref guard — fail loop yok, hata toast + tikla-retry). Olu/secili-yok pane'e tiklayinca fresh shell. Kill butonu yok — `exit` yazilir (gercek PTY). REQ-059 direkt-yazma (scrollback=terminal, arrows/Ctrl+C/Ctrl+D/paste) korundu; REQ-060 cwd cozumu korundu.
- **Proof:** root tsc 0, terminal.test.ts 50/50, web build green; live: served index-DXKFADPW.js → terminal-pane-BLp-zeJX.js `Click to start a shell` iceriyor, served ref == disk ref.
- **Files:** packages/lokma-web/web/src/components/terminal/terminal-pane.tsx.
