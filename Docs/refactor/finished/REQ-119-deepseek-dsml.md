# REQ-119 — DeepSeek DSML tool calling (v4.1-flash)

- **Status:** done (canlıda — 2026-09-11)
- **Asked:** "deepseek v4.1-flash her şeyi thinking yapıyor, tool calling
  yapamıyor, düzelt."
- **Kök neden (canlı kanıtlı):** v4.1-flash tool çağrılarını NE `<tool>` NE
  native function_call olarak yazar — DeepSeek'in DSML formatını kullanır
  (fullwidth U+FF5C pipe'lar):
  `<｜｜DSML｜｜ calls><｜｜DSML｜｜ invoke name="list_files">{"path":
  "Docs"}<｜｜DSML｜｜ parameter></｜｜DSML｜｜ invoke></｜｜DSML｜｜ calls>`
  Üstelik aynı blok HEM `reasoning_content` HEM `content` kanalından gelir:
  thinking'de ham markup görünür, text-filtre tanımaz, sıfır çalıştırma
  (26 thinking + 1 text + done, transcript'te ham DSML).
- **Did (`packages/lokma-core/src/tools/parse.ts`):**
  - `DSML_INVOKE_BLOCK` (invoke-seviyesi toleranslı eşleşme) + `toDsmlCall`
    (iç DSML tag'leri soyulur, JSON parse, olmazsa `salvageXmlArgs`,
    ARG_ALIASES normalizasyonu) + `DSML_CALLS_TAG` (wrapper sessiz yutulur).
  - `parseToolBlocks`/`stripModelBlocks` üç şekli de kapsar.
  - `drain()` yeniden yazıldı: TÜM şekiller EN ERKEN eşleşme indisine göre
    yarışır (sabit öncelik, trailing-markup'un önceki invoke'u metne
    düşürme bug'ı — canlı yakalandı, probe ile kilitlendi).
  - `agent-loop.ts`: turn'lük `thinkingText` birikir, thinking-only DSML
    `parseToolBlocks` ile taranır, text-çağrılarla whitespace-duyarsız
    dedupe (`keyOf`) ile birleştirilir — çift kanal asla çift çalışmaz.
  - `lokma-ai/openai.ts`: `stripDsmlEchoes` thinking delta'larından DSML'i
    temizler (tool satırı tek yerde görünür).
- **Proof:** parse probe 65 passed (DSML + wrapper + dedupe senaryoları);
  canlı deepseek koşusu: `tool_start:2/tool_result:2`, gerçek liste +
  doğru cevap, chat'te DSML sızıntısı YOK (önceki koşuda vardı).
  Hatalı invoke honest-error → model düzeltip başardı (sistem çalışıyor).
- **Files:** core `tools/parse.ts` + `parse.test.ts`, ai `provider/openai.ts`,
  server `agent-loop.ts`.
- **Not:** ağaçta kardeş/loop'un REQ-118 FAZ B işi vardı — `git stash` +
  hunk-seviyesi ayırma ile YALNIZCA REQ-119 commitlendi; FAZ B unstaged
  duruyor, dokunulmadı.
