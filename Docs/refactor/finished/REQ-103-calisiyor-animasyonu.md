# REQ-103 — Agent çalışırken animasyonlu çalışıyor göstergesi

- **Status:** done (2026-09-10, commit pending)
- **Asked:** 2026-09-10 — "agent çalışırken çalıştığı belli olması için ... animasyon yaparsın oraya, anlayak."
- **Teşhis (koddan):** asistan alanı parça parça belirir: `thinking` varsa ThinkingTrace (`single-chat-view.tsx:316`), `stream`/toolCalls varsa canlı blok (326), yoksa HİÇBİR ŞEY — run aktif (`streaming`) ama thinking/tool/çıktı henüz yokken ekran ölü durur. İstek: bu boşlukta animasyonlu "..." (Lokma çalışıyor) göstergesi; ilk çıktı gelince yerini içeriğe bıraksın. Mevcut `animate-pulse` parçaları var (Brain ikonu, caret) ama boş-run durumunu kapsayan blok yok.
- **Touched:** `packages/lokma-web/web/src/components/chat/lokma-message.tsx` (+WorkingIndicator: Loader2 spin + Working + 3 bounce dots, motion-reduce safe, role=status), `packages/lokma-web/web/src/components/chat/single-chat-view.tsx` (+awaitingFirstOutput gate: streaming && !thinking && !stream && no tools && no cards && no error)
- **Verify:** tsc 0 errors, vite build green, fresh chunk contains "Lokma is working" aria string, live 200 + served bundle == disk (index-D2-xKi44.js). Gösterge ilk chunk'ta kaybolur, transcript'e yazılmaz, run bitince kalıntı yok.
