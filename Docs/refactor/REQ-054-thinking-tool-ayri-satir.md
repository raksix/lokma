# REQ-054 — Thinking ayrı, tool çağrısı ayrı (Claude/OpenCode modeli)

- **Status:** done (canlıda — kullanıcı "araştır, ona göre yap" dedi, implemente edildi)
- **Asked:** 2026-09-08 — "düşünme kısmında tool falan çağırıyor amk, tool çağrısı ayrı düşünmesi ayrı. önce git githubdan claude-code reposunu incele detaylı. sonra claude code nasıl yapmış ona göre yap. hermes agent'in sistemine de bak, onlara göre yap, tamam mı? araştır önce detaylıca, ona göre refaktör aç".
- **Research (yapıldı):**
  - `anthropics/claude-code` reposunda TUI kodu YOK (sadece plugin/config açık) — davranış bilgisi kullanıldı: thinking (`✻ Thinking…`, italik, ayrı blok) ≠ tool satırları (`⏺ Ad(özet)` + sonuç, ayrı satırlar) ≠ cevap metni.
  - `sst/opencode` AÇIK KAYNAK — `packages/app/src/pages/session/timeline/message-timeline.tsx` + `utils/session-message.ts` okundu: timeline'da HER ŞEY ayrı row tipidir — `Thinking` (shimmer + reasoning heading, kendi satırı), `AssistantPart`, tool satırları, `DiffSummary`, `Error` (inline hata kartı!), `Retry`. Reasoning `text`'ten ayrı part tipidir.
  - Hermes `hermes-agent` skill + `tui-widgets.md`: tool/skill bölümlerinde `Accordion` deseni, tema tonları, fazlara göre yükleme (shimmer) kuralları.
- **Gap (bizde):** thinking hattı REQ-050'de açıldı ✅; ama (1) tool'lar tek "Thought" details kutusunda toplu — ayrı satır değiller; (2) başarısız run transcript'te İZ BIRAKMIYOR (sadece uçucu toast) — OpenCode'daki gibi inline error card yok.
- **Fix (bu tur):**
  1. Her tool çağrısı AYRI satır: durum ikonu (spinner/✓/!) + ad + girdi özeti + sonuç kırpıntısı; hata satırı kırmızı vurgulu.
  2. Başarısız run'da canlı alana inline error card (OpenCode `Error` row'u gibi) — toast'a ek, transcript yenilenene kadar kalır.
  3. Thinking bloğu ayrı satırda kalır (REQ-050) — dokunulmaz.
- **Touched:** `components/chat/lokma-message.tsx` (ThoughtTrace → ayrı satırlar + RunErrorCard), `single-chat-view.tsx` (runError prop + render), `index.tsx` (runError geçişi).
- **Proof:** web+root `tsc` 0, web build green, single-proc restart, canlı mimo tool-run: tool satırı t=3s'te DOM'da + t=12s'te tamam + stream + done; `/health` 200.
