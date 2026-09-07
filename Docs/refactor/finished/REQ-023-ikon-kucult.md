# REQ-023 — Sol/sağ menü ikonları küçültülecek

- **Status:** done 2026-09-07 (implemented + live-verified, see commit hash note at bottom)
- **Asked:** 2026-09-07 — "sol ve sağ menüdeki iconlar biraz daha küçültülebilir".
- **Interpretation:** İki ince şeritteki (sol Inspector rail + sağ activity bar) ikonlar bir boy küçültülür (örn. `h-5 w-5` → `h-4 w-4`, buton kutusu da orantılı daralır), şerit genişliği korunur ya da hafif incelir. Tooltip ve tıklama alanı (min 28px) bozulmaz.
- **Touched:** `components/shell/inspector-rail.tsx` (button `h-9 w-9` → `h-8 w-8`, icon `h-[18px] w-[18px]` → `h-4 w-4`, nav `w-12` → `w-11`, ~48px → ~44px comment), `components/shell/activity-bar.tsx` (same three class shrinks). All literal Tailwind classes, lucide only, `title`/aria tooltips untouched, 32px hit area stays above the 28px minimum.
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless SS ile boyut farkı kanıtlanır, bundle match.
- **Proof:** root `tsc --noEmit` 0 errors, inspector-rail probe 7/7 + activity-bar probe 14/14, vite build green index-Q9WHfTEE.js (current CSS holds `.w-11`/`.h-8`/`.h-4` rules), `pm2 start ecosystem.config.cjs --only lokma-web` (online), served `/assets/index-Q9WHfTEE.js` == disk (BUNDLE-MATCH). Commit: refactor(web): REQ-023 shrink rail icons (see git log)
