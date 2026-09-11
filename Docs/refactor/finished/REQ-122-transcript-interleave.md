# REQ-122 — Transcript'te yerinde sıra (thinking + tool + metin interleaved)

- **Status:** done (canlıda — 2026-09-11)
- **Asked:** "İş bitince thinking + tool calling'ler en alta düşüyor; hangi
  aşamada ne yapıldıysa orada kalacak."
- **Kök neden:** filtre canlıda kesme noktalarını biliyordu (REQ-111
  `liveBlocks`) ama kayda geçirmiyordu — turn metni TEK `assistant` blob'u
  olarak yazılıyor, tool satırları arkaya diziliyordu; thinking hiç
  yazılmıyordu.
- **Did:**
  - `core/tools/parse.ts`: filtre `StreamMark {at}` üretir (`finish()` +
    tip dahil) — bloğun durduğu yerdeki görünür metin ofseti.
  - `agent-loop.ts`: turn sonunda thinking (`thinking` rolü, 12KB cap) +
    metin `runMarks` ile kesilip tool satırlarıyla sırayla yazılır
    (metinsiz segment atlanır; mark'sız merge çağrılar kalan metni önce
    boşaltır). `thinking` rolü history'de upstream'e gitmez (display-only).
  - `core/session/types.ts`: `SessionMessage.role` += `'thinking'`.
  - Gösterim: transcript'te `thinking` → `ThinkingTrace` (collapsed değil,
    canlıdaki gibi); search etiketi + replay/share satırları tanır.
- **Proof:** parse probe 76 passed (mark ofset + wrapper senaryoları);
  tsc 0 (core/ai/server/web), build green; canlı mimo koşusu transkripti:
  tool → metin → tool → metin … (önceki blob+alta-dizilme bitti),
  thinking rolü ayrı satırda. Probe session silindi.
- **Files:** core `tools/parse(.test).ts`, `session/types.ts`; server
  `agent-loop.ts`; web `single-chat-view.tsx`, `memory/transcripts.ts`,
  `observability/observability.ts`.
