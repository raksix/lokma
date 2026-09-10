# REQ-111 — Tool calling mesajların arasında, akışta görünsün

- **Status:** pending
- **Asked:** 2026-09-10 — "bu tool loading mesajın altında kalıyor. Şöyle olmalı: tamam bakıyorum → tool calling → sonuç mesajı → tool calling... mesajların aralarında gözükmeli."
- **Teşhis (koddan):** canlı `toolCalls` kaydı TEK blokta transcriptin ALTINDA render ediliyor (`single-chat-view.tsx:342-349` ThoughtTrace) — akışla bağı yok. Oysa transcript modeli satır-içi tool satırını zaten taşıyor (`TranscriptMessage.toolName/toolCallId`, satır 38). 'yap'ta: tool çağrıları varış sırasına göre mesaj aralarına serpiştirilir (metin → tool → metin → tool); blok alta yapışmaz; kayıtlı geçmişte transcript gömülü satırlar korunur.
- **Touched:** (yok — write-only; 'yap' denmeden kod YOK)
- **Verify:** canlıda tool çağrısı ilgili mesajın altında, kronolojik sırada görünür; sonuç metni tool'un altına gelir; sayfa aşağısında ayrı tool bloğu kalmaz.
