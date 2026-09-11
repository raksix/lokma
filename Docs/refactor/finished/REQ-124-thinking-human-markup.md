# REQ-124 — Thinking reads human (strip tool markup at render)

- **Status:** done (canlıda — 2026-09-11)
- **Asked:** "Thinking bloğu ham tool markup'ı gösteriyor (DSML invoke'lar,
  `<tool>` / `<tool_call>` / `<tool_result>` kalıntıları) — insan gibi okunsun,
  sadece akıl yürütme metni görünsün."
- **Did:** yeni exported `stripThinkingMarkup` web `lokma-message.tsx`'te
  (whole-string strip — asla per-delta değil, bölünmüş tag sızamaz):
  DSML invoke blokları (kapanmamışsa EOF'a kadar), başıboş DSML tag'leri,
  `tool` / `tool_call` / `tool_result` blokları (kapanmamışsa EOF'a kadar),
  ardından boşluk çökertme. `ThinkingTrace` artık okunabilir kalanı render
  eder (boşsa + streaming değilse hiç göstermez). Gereksiz kalan ai-side
  `stripDsmlEchoes` + per-delta kullanımı `ai provider/openai.ts`'ten
  silindi (reasoning_content ham geçer, temizlik render katmanında).
  Server yürütme/parsing'e dokunulmadı (core `parse.ts`, `agent-loop`).
- **Proof:** `lokma-message.test.ts` REQ-124 bloğu (prose korunur, üç şekil +
  DSML + kapanmamış kesilir, düz metin aynen, boşluk çökertme); core parse
  probe 76/76; root tsc 0; concept build green.
- **Files:** `web/.../chat/lokma-message.tsx` + `lokma-message.test.ts`;
  `ai/.../provider/openai.ts` (stripDsmlEchoes removal).
