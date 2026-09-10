# REQ-103 — Agent çalışırken animasyonlu çalışıyor göstergesi

- **Status:** pending
- **Asked:** 2026-09-10 — "agent çalışırken çalıştığı belli olması için ... animasyon yaparsın oraya, anlayak."
- **Teşhis (koddan):** asistan alanı parça parça belirir: `thinking` varsa ThinkingTrace (`single-chat-view.tsx:316`), `stream`/toolCalls varsa canlı blok (326), yoksa HİÇBİR ŞEY — run aktif (`streaming`) ama thinking/tool/çıktı henüz yokken ekran ölü durur. İstek: bu boşlukta animasyonlu "..." (Lokma çalışıyor) göstergesi; ilk çıktı gelince yerini içeriğe bıraksın. Mevcut `animate-pulse` parçaları var (Brain ikonu, caret) ama boş-run durumunu kapsayan blok yok.
- **Touched:** (yok — write-only; 'yap' denmeden kod YOK)
- **Verify:** canlıda yavaş/düşüncesiz modelde bile gönderimden ilk token'a kadar animasyonlu gösterge; thinking/tool/stream gelince kaybolur; run bitince kalıntı yok.
