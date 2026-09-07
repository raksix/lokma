# REQ-021 — Swap'te mini menüler panelleriyle birlikte yer değiştirsin

- **Status:** done 2026-09-07 (implemented + live-verified, see commit hash note at bottom)
- **Asked:** 2026-09-07 — "Explorer menüsü ile Inspector yer değiştirince, inspector menüsünün yanındaki küçük menü geliyor ama explorer menüsünün sağındaki menü gitmiyor, onu da ekle".
- **Interpretation:** REQ-007 swap'inde her panel kendi mini şeridiyle (rail) birlikte hareket etmeli: şu an Inspector tarafının şeridi geliyor ama Explorer tarafındaki şerit yerinde kalıyor. Fix: swap state'i panel+rail çiftini birlikte taşır — solda hangi gövde varsa onun şeridi yanında olur, sağda hangi gövde varsa onunki yanında; boşta şerit kalmaz.
- **Touched (plan):** `components/app-shell.tsx` (swap render mantığı — rail+panel çift olarak taşınır), rail bileşenleri.
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile swap öncesi/sonrası her iki tarafta doğru şerit+gövde eşleşmesi SS ile kanıtlanır, bundle match.
- **Proof:** web `tsc` 0 + root `tsc` 0, vite build green, `pm2 start ecosystem.config.cjs --only lokma-web`, served `/assets/index-xvHeA7cj.js` == disk (bundle-match YES, chunk 200). Headless probe: BEFORE `[InspectorRail | Inspector | Chat | Explorer | ActivityBar]`, AFTER swap `[ActivityBar | Explorer | Chat | Inspector | InspectorRail]`, restored to default. Commit: refactor(web): REQ-021 activity rail travels with Explorer across swap (see git log)
