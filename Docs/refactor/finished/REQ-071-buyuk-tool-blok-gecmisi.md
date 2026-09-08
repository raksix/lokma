# REQ-071 — Buyuk tool bloklari ve gecmis budama

Status: done (2026-09-08, recovery commit 5cd2548)
Asked: agent loop buyuk dosya yazimlarini calistiramiyordu; tek dev mesaj tum konusmayi bellekten dusuruyordu.
Interpretation: (1) block-filter tamponu 8KB idi — gercek dosya yazimlari (30KB+ landing page) hic kapanmayan blok sayilip chat metni olarak akip hic calistirilmiyordu; tampon 256KB oldu. (2) model gecmisi dev mesajlarda tum pencereyi kaybediyordu — artik mesaj basina budama var (chat 8K, tool 2K) ve en yeni mesaj her zaman butun biniyor. (3) sistem promptu sadece `<tool name="...">` seklini zorunlu kilar (`<tool_call>`/ciplak ad bicimleri yasak).
Touched:
- `packages/lokma-core/src/tools/parse.ts` (`BLOCK_FILTER_BUFFER_CAP` 8192 → 262144, prompt satiri)
- `packages/lokma-core/src/tools/parse.test.ts` (REQ-071 blogu: 20KB blok parse + tek-tag sekli)
- `packages/lokma-web/server/src/agent-loop.ts` (`HISTORY_MESSAGE_CAP` 20 → 30, `HISTORY_CHAR_CAP` 24K → 48K, `truncateHistoryText` + rol bazli budama + en-yeni-butun)
- `packages/lokma-web/server/src/agent-loop.test.ts` (new: history probe 7/7)
- `packages/lokma-web/web/src/components/chat/composer.tsx` (double-Enter guard: `lastSent` ref, ayni metin 1.5sn icinde ikinci kez gonderilmez — setText async oldugu icin hizli ikinci Enter cift user satiri uretiyordu)
Proof: root tsc 0, concept build green, web build green index-Brgs9deK.js, probes parse 41/41 + agent-loop 7/7 + history 9/9, single-proc lokma-web restart online, served index == disk dist (BUNDLE-MATCH, guard `current.at<1500` live).
Follow-up (2026-09-08, recovery): (a) dead-upstream transcript note (commit b70d8ae) — stream failures now leave `[run failed: <reason>]` in the transcript instead of vanishing. (b) empty-first-turn guard in `agent-loop.ts` — a first turn with no text/tool-calls/questions throws an honest retryable error instead of showing "Response complete" with no response; later quiet turns still mean tool-work-done.
