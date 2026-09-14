# REQ-139 — Hermes-parity effort ladder + compact reasoning

**Status:** done · 2026-09-14
**User request (verbatim):** "kanka bu thinking şeyleri modele göre mi yapalım yoksa hermes-agenttaki gibi. bunun gibi mi birde hermesteki gibi daha compact hale getir thinking şeylerini"

## Decision

**Hermes-agent gibi: tek ortak merdiven, modele göre clamp.** Model başına ayrı
seviye menüsü tutulmaz. Seçilen seviye, adapter içinde ilgili wire'ın kabul
ettiği en yakın (önce daha zayıf) kademeye indirilir — Hermes'in
`EFFORT_LADDER` + `clamp_effort` deseninin aynısı. Böylece:

- aynı seçim her modelde anlamlı kalır (menü model değişince değişmez),
- modelin tanımadığı bir seviye 400 üretmez, sessizce bir alt kademede çalışır,
- yeni model eklemek menü/kod değişikliği gerektirmez.

## What changed

- **Ladder (`packages/lokma-shared/src/protocol/ws.ts`)** — `REASONING_EFFORTS`
  artık `off → minimal → low → medium → high → xhigh → max`, ayrıca tek kaynak
  `REASONING_LADDER` (off hariç) + `ActiveReasoningEffort` tipi.
- **Clamp (`packages/lokma-ai/src/provider/reasoning.ts`)** — `clampEffort(effort, supported)`
  aynı seviyeyi, yoksa en yakın **daha zayıf** kademeyi, o da yoksa en yakın
  daha güçlüyü döner; iki wire sözlüğü: `OPENAI_COMPAT_WIRE_EFFORTS` (minimal…max)
  ve `RESPONSES_WIRE_EFFORTS` (minimal yok → low'a clamp).
- **Anthropic** — `anthropicThinkingBudget(effort, maxTokens)`; budget tablosu
  6 kademeye genişledi ve `maxTokens - 1024` tavanına clamp edilir (8192 çıktı
  sınırında xhigh/max → 7168), yani `budget_tokens < max_tokens` kuralı korunur.
- **OpenAI adapter** — seçim artık clamp'ten geçiyor (Responses ise Responses
  sözlüğüyle). Mevcut "400 + capability wording → alanı düşür ve hatırla"
  emniyet ağı yerinde duruyor.
- **Composer** — menü 7 satıra çıktı (Off / Minimal / Low / Medium / High /
  Extra High / Max); başlık Hermes'teki gibi `Effort` (eskiden "Thinking
  budget"), uzun liste için `max-h-[340px]` + scroll. Hint satırları korundu.
- **Compact gösterim (`ThinkingTrace`)** — Hermes'in `_emit_reasoning_preview`
  davranışı: her paragraf tek satıra sıkıştırılır, ilk **5 satır** gösterilir,
  kalan `N more lines` düğmesiyle açılır (aç→kapa aynı düğme). Böylece uzun bir
  reasoning akışı sohbeti kaplamaz; isteyen tek tıkla tamamını görür.

## Verification

- `bun packages/lokma-ai/src/provider/adapters.test.ts` → **147/147**
  (clamp matrisi + yeni Anthropic budget tavanı).
- `bun packages/lokma-web/web/src/components/chat/lokma-message.test.ts` →
  reasoning-preview testleri (paragraf sıkıştırma, 5 satır sınırı, "N more").
- `bun packages/lokma-web/web/src/components/chat/composer.test.ts` → ladder'ın
  her kademesi reload sonrası korunuyor, `ultra` artık bilinmeyen değer → `off`.
- `bun x tsc --noEmit` → 0 hata; `bun run build` + web build → green.
- **Canlı** `scripts/probe-thinking-ladder.cjs` → **5/5 PASS** (başlık `Effort`,
  7 satır, duplike yok, `Max` persist, başarısız istek yok).
- `scripts/probe-reasoning-compact.cjs` → reasoning turu tetikliyor; seçili model
  `reasoning_content` **stream etmezse** SKIP döner (aşağıdaki tuzak).

## Traps

- **`deepseek-v4.1-flash` reasoning'i sunucu tarafında tutuyor** — `reasoning_effort`
  kabul ediliyor ve token harcanıyor, ama stream'de `reasoning_content` delta'sı
  gelmiyor; bu yüzden thinking bloğu o modelle canlıda hiç görünmez. Kompakt
  render'ın canlı kanıtı `reasoning_content` veren bir modelle alınmalıdır.
- **CommandCode haftalık limit** (14 Eyl, reset 18 Eyl 18:43 UTC) canlı model
  çağrılarını kapatıyor → problar limit açılınca yeniden koşulmalı.
- **Probe gürültüsü:** istemci yeni (boş) session id'si için transcript ister,
  server `session_not_found` 404'ü döner — bu tasarım gereğidir, app hatası
  sayılmaz; `probe-thinking-ladder.cjs` bunu favicon ile birlikte ayıklar.
