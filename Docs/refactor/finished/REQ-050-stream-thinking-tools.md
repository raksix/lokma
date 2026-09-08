# REQ-050 — Mesajlar stream gelsin, thinking + tool calling detaylı görünsün

- **Status:** done (canlıda — kullanıcı "detaylı şekilde yap" dedi, implemente edildi)
- **Asked:** 2026-09-08 — "harness mesajları stream ederek gelsin. thinking, tool calling özellikleri hermes agenttaki gibi çalışması lazım, detaylı şekilde yap. ya da claude code'daki gibi. tüm işlemleri detaylıca göstersin. şuan tool calling falan çalışmıyor" (SS'e bakılamadı — görüntü servisi 500).
- **Interpretation:** Chat akışı Claude Code/Hermes tarzı canlı izlenir olur: token'lar stream yazar, thinking/reasoning bloğu açılır-kapanır görünür, her tool çağrısı (ad + girdi özeti + durum + sonuç/çıktı) detaylı listelenir. Şu an tool calling ya çalışmıyor ya görünmüyor — önce teşhis, sonra fix.
- **Diagnosis (canlı kanıtlı):**
  1. Thinking hattı HİÇ YOKTU: protokolde, adapter'da, loop'ta, UI'da reasoning kavramı yoktu.
  2. GERÇEK tool-display bug'ı: `ThoughtTrace` `{stream && ...}` bloğunun içindeydi — model önce text yazmadan tool çalıştırınca tool'lar görünmez çalışıyordu (transcript'te exit 0 var, ekranda iz yok). Kullanıcının "çalışmıyor" dediği buydu.
- **Fix:**
  - Protokol (`lokma-shared/protocol/ws.ts`): yeni `thinking_delta` frame'i.
  - Adapter (`lokma-ai/provider/openai.ts`): DeepSeek-tarzı `reasoning_content` + Responses `reasoning_summary` delta/completed → `thinking_delta` chunk (`usesResponsesApi` yanına; `responsesThinkingText` helper).
  - Server (`agent-loop.ts`): `thinking_delta` frame olarak iletilir (filtresiz, cevaba karışmaz, persist edilmez).
  - İstemci (`lib/ws.ts` + `use-ws.ts`): `thinking` state'i (run başında sıfırlanır); `ThinkingTrace` bileşeni (akarken açık+pulsing, bitince kapalı sessiz satır).
  - UI (`single-chat-view.tsx`): Lokma bloğu `stream || toolCalls` varsa açılır (tool'lar textsiz de görünür), text kısmı sadece stream varken.
- **Touched:** yukarıdaki 7 dosya + `ws.test.ts` (thinking assert) + `adapters.test.ts` (kapsam dışı — reasoning stub ayrı iş).
- **Proof:** ws checks pass; web+ai+server+root `tsc` 0; web+server build green; canlı mimo E2E: tool exit 0 + 6/6 DOM örneğinde Thought satırı + stream + done; `/health` 200.
