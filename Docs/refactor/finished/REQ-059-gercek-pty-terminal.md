# REQ-059 — Terminal pane gerçek PTY gibi kullanılsın

- **Status:** done (2026-09-08 — real PTY via `script(1)` + direct-type scrollback, bottom command box removed; probes: pty:true, echo, ^C interrupt, survive, kill/forget, 41/41 unit, live chunk served)
- **Asked:** 2026-09-08 — "terminal arayüzünde altta komut yerine girmek yerine direkt pty, gerçek terminal gibi kullanak işte terminali o dizinde".
- **Interpretation:** Terminal pane'in altındaki komut-satırı input'u kalkar; yerine o dizinde (session cwd) çalışan GERÇEK interaktif terminal gelir — yazı yazma, komut geçmişi, ctrl+C, tam ekran çıktı, xterm benzeri deneyim (pty üzerinden).
- **Touched (plan):** terminal pane UI (xterm.js benzeri gömülü terminal ya da mevcut yapıya pty etkileşimi) + server pty kanalı (varsa genişletilir).
- **Verify (plan):** root+web `tsc` 0, build'ler green, restart'lar, headless ile komut yazıp çıktıyı görme + ctrl+C kanıtı, bundle match.
