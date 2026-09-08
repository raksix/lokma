# REQ-044 — Session listesinde sadece başlık görünsün

- **Status:** done (2026-09-08 — implemented + live verified, close-out commit below)
- **Asked:** 2026-09-08 — "burdaki sessionlar da sadece session başlığı gözüksün, 2. ss'de attığım gibi" (2 SS eklendi; görüntü servisi 500 verdiği için bakılamadı ama istek net).
- **Interpretation:** Session satırlarında model rozeti, mesaj sayısı, zaman (`· 12 msgs · 2h` vb.) ve ek meta satırları kalkar — satırda SADECE başlık (hover aksiyon butonları kalır). Kompakt tek-satır liste.
- **Touched (plan):** `components/sessions/sessions-sidebar.tsx` (satır meta bloğu).
- **Touched (this run):** `sessions-sidebar.tsx` — meta `<div>` removed (model badge + `messageCountLabel` + `relativeTime` spans), now-unused `const model` removed, `messageCountLabel`/`relativeTime` imports dropped (helpers stay in `grouping.ts` — still used by `memory/transcripts.ts` + `sessions.test.ts`). Previous tick had removed the imports but left the usages (broken tree); this run completed the removal.
- **Proof:** root `tsc` 0 + web `tsc --noEmit` 0 + web build green (`index-hmICWwCV.js`), single-proc `lokma-web` restart online, served bundle == disk dist (BUNDLE-MATCH). Headless (basic-auth, xvfb Chromium): 28 session rows, all title-only text, 0 rows matching msgs/ago/model-id patterns.
- **Commit:** 37f6251
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile satırlarda başlık-dışı metin olmadığı kanıtlanır, bundle match.
