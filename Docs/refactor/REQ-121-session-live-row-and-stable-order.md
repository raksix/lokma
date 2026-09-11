# REQ-121 — Session satırında canlı çalışma göstergesi + stabil sıra

Status: in-progress (plumbing recovery committed this tick; sidebar UI by sibling agent, uncommitted in worktree)
Asked: 2026-09-11 (loop recovery — interrupted tick left plumbing with no spec; intent reconstructed from the uncommitted diff)
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
