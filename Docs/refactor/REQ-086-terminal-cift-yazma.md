# REQ-086 — Terminal çift yazma (dedup) + SSH gibi direkt cwd

- **Status:** done (canlıda — 2026-09-09)
- **Asked:** "terminal ssh gibi direkt o proje dizininde pty olsun; bastığım her tuş 2şer basılıyor".
- **Teşhis:** server TEK echo veriyor (doğrudan WS testinde `q`→1 echo — server sağlam). Client frame de TEK gidiyor (CDP `framesent` kanıtı `["q"]`). Çiftlik, çift ulaşan keydown'ların PTY'ye iki kez yazılmasından — aynı fiziksel basış iki kez ulaşınca shell çift görüyor.
- **Did:** `onTermKeyDown` dedup — basılı-tutma repeat'i (`e.repeat`) her zaman geçer; aynı byte'ın 50ms içindeki tekrarsız kopyası yutulur (insan 50ms'de aynı tuşa iki kez basamaz). SSH-parite zaten vardı: PTY session cwd'sinde açılır (REQ-060), ham baytlar gider.
- **Proof:** tsc 0, terminal probe 50/50, build green; E2E tek frame.
- **Files:** terminal-pane.tsx.
