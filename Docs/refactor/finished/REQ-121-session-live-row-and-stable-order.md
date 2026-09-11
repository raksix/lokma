# REQ-121 — Session satırında canlı çalışma göstergesi + stabil sıra

Status: done (2026-09-11 — sidebar UI + read/unread + transparan satırlar)
Asked: 2026-09-11 loop + kullanıcı: tıklanan session üste fırlamasın (aktif
sadece prompt almış = çalışan session olsun); çalışan sessionda baştan sona
animasyonlu loading bar; okunmadı yeşil / okundu gri nokta; satır arka
planları tamamen transparan.
Touched (plan):
- `packages/lokma-web/server/src/routes/sessions.ts` (list summaries carry `running`/`queued` from `runStatus`)
- `packages/lokma-core/src/session/store.ts` (`updatedAt` bumps only on real activity touch, not meta patches)
- `packages/lokma-web/web/src/lib/api.ts` (`SessionSummary.running`/`queued` fields)
- `packages/lokma-web/web/src/stores/session.ts` (`refreshSessionsQuiet`, no `loading` flash)
- `packages/lokma-web/web/src/index.css` (`.lokma-scanbar` keyframes)
- `packages/lokma-web/web/src/components/sessions/sessions-sidebar.tsx` (row indicator + quiet poll)

## Asked

Session listesinde hangi session'da agent'ın şu an çalıştığı görünsün; ayrıca bir session'ı açmak ya da ayarını değiştirmek onu listenin en üstüne fırlatmasın (sıra sadece gerçek aktiviteyle değişsin).

## Interpretation

1. Server `GET /api/sessions` özetlerine in-memory `running` + `queued` bayraklarını ekler (poll başına I/O yok).
2. Sidebar satırı çalışan session'da üst kenarda terracotta tarama çubuğu gösterir.
3. Sidebar listeyi ~5sn'de bir sessizce tazeler (skeleton/flash yok).
4. `updatedAt` sadece gerçek mesaj aktivitesinde ilerler; model/bot/title gibi meta yamaları sırayı bozmaz. Liste zaten `updatedAt`'e göre newest-first (`grouping.ts` `byRecency`).

## Verify

- `bun x tsc --noEmit` 0 errors.
- Web + server build green; pm2 single-proc restart; served bundle hash == disk.
- Canlı prob: çalışan session satırında `.lokma-scanbar` var; meta patch sonrası sıra değişmiyor.

## UI (bu tur)
- Satırda `running` (server `running` bayrağı) DIŞINDA aktif görünüm YOK:
  açık ama boş session diğerleriyle aynı (sahte aktif bitti).
- Çalışan satır: üstte terracotta süpürme barı (`.lokma-scanbar`, baştan
  sona animasyon) + nabız nokta + hafif terracotta zemin.
- Boşta: tam transparan zemin (`hover:bg-muted/40` hafif), nokta yeşil
  (okunmadı) / gri (okundu), okunmadı başlık semibold.
- Okundu takibi: `lokma-seen:v1` + `lokma:seen` eventi; açınca + izleyip
  bitirince işaretlenir, ilk yüklemede eskiler okunmuş sayılır.
- Liste 4sn'de sessiz tazelenir (`refreshSessionsQuiet`, loading flash yok).
