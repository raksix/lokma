# REQ-074 — Tool satırları timeline'da yaşasın (F5'e dayanıklı, ham JSON yok)

- **Status:** done (canlıda — kullanıcı "tool calling çağrıları otomatik gözüksün, Hermes desktop nasıl yapıyorsa öyle yap" dedi, implemente edildi; SS'lere bakılamadı — görüntü servisi 500)
- **Asked:** 2026-09-09.
- **Research:** Hermes desktop (`NousResearch/hermes-agent`): her tool çağrısı kendi satırını açar, sonuç AYNI satırı günceller (`turn-activity.ts` + `inflight-turn-journal.ts`); OpenCode timeline: her şey ayrı row tipi. Bizim canlı model zaten böyleydi — eksik transcript tarafıydı.
- **Gap:** ThoughtTrace SADECE canlı WS frame'lerinden besleniyordu; run bitince transcript reload oluyor, `role:'tool'` satırları AssistantRow'da HAM JSON basılıyordu; F5 sonrası tool satırları hiç görünmüyordu.
- **Fix:**
  - Server `toolRecord` artık `input`'u da persist ediyor (7 çağrı noktası) — transcript satırları canlı-trace detayında.
  - `TranscriptMessage` tipine `toolName`/`toolCallId`.
  - `transcriptToolEntry(m)` pure parse + `ToolCallRow` paylaşılan satır bileşeni (ThoughtTrace de onu kullanıyor).
  - Transcript map'inde `role==='tool'` → avatar'lı ToolRow (ham JSON asla basılmaz).
  - Yol üstünde: server build'i kıran pre-existing tsc hatalarının kökü bulundu (eski core dist) — core rebuild ile SRV-TSC 0.
- **Touched:** `server/agent-loop.ts` (input persist), `chat/lokma-message.tsx` (ToolCallRow+transcriptToolEntry), `chat/single-chat-view.tsx` (ToolRow render+tip), `chat/lokma-message.test.ts` (§9, 6 case).
- **Proof:** probe 51/51, web+srv tsc 0, build'ler green, restart'lar, F5 E2E: reload sonrası transcript'te insan cümlesi var / ham JSON yok / takılı Running yok; gate ON (`/api/auth/me` 401).
