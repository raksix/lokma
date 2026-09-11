# REQ-131 — Bulk model actions work + provider grouping (Models tab)

**Status:** done
**Area:** web (`packages/lokma-web/web`), server (`packages/lokma-web/server`)
**Date:** 2026-09-11
**Reported by user:** "şurda da allow al disable al düzgün çalışmıyor. + inputtaki model searchda model seçiminde gruplandırma var. fakat burda yok, burda da model gruplandırma olsun"

## Symptom

1. **Allow All / Disable All did nothing.** The buttons lit up, no checkbox
   changed, no error surfaced as a *result* — the panel simply stayed as it was.
2. **The Models tab was one flat 600-row list.** The Composer dropdown (chat
   input → model search) already grouped models by provider; the settings pane
   next to it did not, so the same catalog read two different ways.

## Root cause

**Bulk failure — a server cap below the real catalog size.**

```
server/src/routes/models.ts:  const MAX_BULK_KEYS = 500;   // DoS guard
live merged catalog:          613 ids (6 providers)
```

`buildBulkMap(models, enabled)` builds one map for the *whole* catalog and
`PATCH /api/models` rejected it with `400 too_many_models` before writing
anything. The store rolled back its optimistic update, and the toast was the
only trace. Any single-model toggle kept working — which is why the pane looked
"partially broken" rather than dead.

**Second failure mode: all-or-nothing validation.** The handler rejected the
entire batch if *any* id was unknown. The catalog is probe-backed (5m cache +
live `/v1/models` fan-out), so a single stale id — one provider returning a
model another provider dropped, or a catalog refreshed between GET and PATCH —
was enough to kill a 613-entry "Allow All" with `unknown_model`.

**Grouping gap.** `models-pane.tsx` rendered `filtered.map(...)` directly; the
Composer used a provider-grouped list. No shared helper existed, so parity had
to be built, not just styled.

## Fix

1. `MAX_BULK_KEYS` **500 → 5000** and exported. It is a DoS guard, not a
   product limit; the cap must sit far above any realistic catalog.
2. **Partial success instead of rejection:** unknown ids are filtered out,
   the known ones are written, and the response reports
   `skipped` / `skippedIds`. A batch of only-unknown ids still returns
   `400 unknown_model`.
3. **Bulk scope follows what the user sees:** with a search filter active the
   buttons apply to the matching subset ("Allow 12 shown"), otherwise to the
   whole catalog ("Allow All (613)"). Labels always carry the count, so the
   target is never ambiguous.
4. **`groupByProvider()` helper** (pure, tested) → the pane renders sticky
   provider headers — uppercase provider name, `enabled/total`, a collapse
   chevron, and per-group **All / None** shortcuts.
5. `setModelsBulk` now returns `ModelsMutationRes`, so the toast reports the
   real number: `Enabled 611 models · 2 skipped (not in catalog)`.

## Files

| File | Change |
| --- | --- |
| `server/src/routes/models.ts` | `MAX_BULK_KEYS` 5000 + exported; partial-success bulk (accepted/unknown) |
| `server/src/routes/models.test.ts` | +1 check: bulk cap clears real catalogs (12 total) |
| `web/src/components/providers/models.ts` | new `groupByProvider()` |
| `web/src/components/providers/models-pane.tsx` | grouped render, sticky headers, per-group All/None, count-labelled bulk |
| `web/src/components/providers/models.test.ts` | +7 checks: grouping + filtered bulk scope (39 total) |
| `web/src/stores/provider.ts` | `setModelsBulk` returns the mutation result |
| `web/src/lib/api.ts` | `ModelsMutationRes.skipped` / `skippedIds` |

## Evidence

- `bun src/routes/models.test.ts` → **12 checks passed**
- `bun src/components/providers/models.test.ts` → **39 passed, 0 failed**
- `bun x tsc --noEmit` clean in both packages, `bun run build` green
- Live: bulk `PATCH /api/models` with the full 613-id catalog returns
  `updated: 613, skipped: 0` (before: `400 too_many_models`)
- Live: same batch plus two fabricated ids returns `updated: 613, skipped: 2`
  and writes nothing for the unknown ids

## Not done (deliberate)

- No bulk-fallback-chain button (server owns no such API).
- No per-group "refresh only this provider" — `POST /api/models/refresh`
  fans out to every enabled provider by design (REQ-032).
