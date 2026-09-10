# REQ-107 — Terminal SSH hissi versin

- **Status:** pending
- **Asked:** 2026-09-10 — "bu terminal sanki ssh ile sunucuya bağlanmışım gibi olmalı."
- **Interpretation:** Terminal paneli gerçek PTY zaten (REQ-059); istenen his: tam-yükseklik scrollback + anında yankı + bağlantı kopunca belirgin durum + yeniden bağlanma + proje cwd'sinde açılış (REQ-060 var). 'yap'ta canlı terminalde eksik his noktaları tek tek kapatılır (prompt yankısı, yeniden bağlanma, tam-boy). 'yap' denmeden kod YOK.
- **Touched:** (yok — write-only)
- **Verify:** canlıda terminal SSH oturumu gibi hissettirir: yazı anında yankılanır, kopma/geri gelme bellidir, F5 sonrası shell yaşar.
