# REQ-051 — Session satırları compact + göreli zaman + aktiflik sıralaması

- **Status:** done (2026-09-08 — implemented + live verified, close-out commit below)
- **Asked:** 2026-09-08 — "burası daha compact olsun. yazı hemen eksilmesin, genişliğe göre otomatik ayarlansın. ayrıca yanında ne kadar süre önce aktif olduğu m, h, d cinsinden (dakika/saat/gün) yazsın. en son prompt gelen en üste gelsin" (SS'e bakılamadı — görüntü servisi 500).
- **Interpretation:**
  1. Session satırları daha compact (dar padding, tek satır ağırlıklı).
  2. Başlık hemen kesilmesin — genişliğe göre otomatik uyarlanır (esnek truncate: yer varsa tamamı, darsa ellipsis).
  3. Her satırda göreli aktiflik süresi: `5m`, `3h`, `2d` (dakika/saat/gün).
  4. Sıralama: en son prompt/aktivite gelen en üstte.
- **Not:** REQ-044 (sadece başlık) ile kısmi çakışma — bu istek başlık + `m/h/d` rozetini birlikte ister; REQ-044'ün "sıfır meta" hali yerine "tek mini rozet" hali kazanır (kullanıcı onayı varsayıldı, dosyada dursun).
- **Touched (plan):** `components/sessions/sessions-sidebar.tsx` (satır düzeni + `relativeTime` m/h/d formatı) + `grouping.ts` (sıralama zaten updatedAt ise korunur, yoksa eklenir).
- **Touched (this run):** `grouping.ts` gains `activityBadge` (compact `5m`/`3h`/`2d` token, `now` under a minute, short date past 30d, empty when missing; full `relativeTime` kept as the badge tooltip) + `byRecency` (`updatedAt` desc, missing/NaN sinks to bottom) applied to every group in `groupSessions` (time buckets + project groups) · `sessions-sidebar.tsx` row goes compact (`px-2 py-1`, `gap-1.5`, title stays `flex-1 min-w-0 truncate` so it fills available width and ellipsizes only when narrow) + badge span (`tabular-nums`, zinc chip, dark variant) pinned right of the title · `sessions.test.ts` +9 badge/recency checks.
- **Proof:** probe 32/32 PASS · root `bun x tsc --noEmit` 0 · web `bun run build` green (`index-Wi3RzF6r.js`) · single-proc `lokma-web` restart online · served bundle == disk dist (BUNDLE-MATCH) · headless live PASS: 28/28 rows carry a compact badge (`2h`/`6h`), DOM order matches API recency (newest prompt on top), dark theme.
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile satır kompaktlığı + `m/h/d` + sıralama kanıtlanır, bundle match.
