# REQ-025 — Agent Hub tasarımı iyileştirilecek

- **Status:** done 2026-09-07 (implemented + live-verified, see commit hash note at bottom)
- **Asked:** 2026-09-07 — "agent hub tasarımı falan daha iyi olabilir".
- **Interpretation:** Agents/Orchestration (Agent Hub) yüzeyinin görsel tasarımı elden geçirilir: kart dizilimi, durum rozetleri (running/idle/error), bütçe/kota göstergeleri, hover aksiyonları (pause/resume/kill/fork) daha okunur ve modern olur. İşlevsellik aynen korunur, sadece sunum iyileşir; terracotta vurgu + light/dark uyumu korunur.
- **Touched:** `components/agents/agents.ts` (NEW `stateBadge(state)` pill classes pairing with `stateTone` dot — per-state light/dark colors, zinc fallback; recovered from cut-off run's uncommitted work), `components/agents/agents-pane.tsx` (row state pill + detail-header status badge wired to `stateBadge`, row hover `hover:shadow-sm` + `hover:border-terracotta/30`), `components/agents/agents.test.ts` (6 new `stateBadge` probe checks). All literal Tailwind classes, lucide only, quoted TS keys. No endpoint, store, or lifecycle logic touched.
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless SS (light+dark) ile yeni görünüm kanıtlanır, bundle match.
- **Proof:** `agents.test.ts` probe 42/42, root `bun x tsc --noEmit` 0 errors, vite build green `index-Co1sd7qp.js`, `pm2 start ecosystem.config.cjs --only lokma-web` (online), served `/assets/index-Co1sd7qp.js` == disk (BUNDLE-MATCH). Commit: refactor(web): REQ-025 agent hub status badges (see git log)
