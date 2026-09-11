# REQ-130 — Provider-namespaced model catalog

**Status:** done · **Scope:** `packages/lokma-web/server/src/routes/models.ts` (+ test) · **Commits:** `31ca8d0`, `ee483b9`

## What the user saw

The **Default model** row in lokma's provider settings showed:

```
commandcode/deepseek/deepseek-v4.1-flash (unavailable)
```

Saving was disabled because the picker believed the model did not exist — while the
very same model answered native tool calls 12/12 in the probe and 8/8 through the
deployed server.

## Root cause

`mergeLiveIds()` folded each provider's live `/v1/models` response into the catalog with:

```ts
const full = raw.includes('/') ? raw : `${outcome.viewId}/${raw}`;
```

Slash-free ids got the provider prefix; **ids that already contained a slash were stored
bare**. CommandCode serves its catalogue vendor-prefixed (`deepseek/deepseek-v4.1-flash`,
`Qwen/Qwen3.8-Max`, `MiniMaxAI/MiniMax-M3`), omniroute serves `cmd/…`, `command-code/…`.
Two consequences:

1. Those ids were attributed to a fabricated provider (`provider: 'deepseek'` for a model
   that came from `commandcode`) and the real `commandcode/…` id never existed — so a
   configured default pointing at it looked unavailable.
2. Two providers exposing the *same* upstream id collided on one `Map` key; whichever was
   probed last silently won, and the user could not tell which provider a row belonged to.

Measured before/after on the live catalog: `commandcode/*` entries **15 → 69**.

## Fix

Always namespace by the provider that served the id:

```ts
const full = `${outcome.viewId}/${raw}`;
```

Slash-free ids behave exactly as before; vendor-prefixed ids gain a real provider identity,
and providers no longer overwrite each other's rows.

## Proof

- `bun src/routes/models.test.ts` → **11 checks passed** (slashed id namespaced, no bare
  slash id leaks, two providers no longer collide, configured default is findable, base row
  survives an exact collision, error/skipped outcomes leave the catalog untouched).
- `bun x tsc --noEmit` in `packages/lokma-web/server` → 0 errors.
- `POST /api/models/refresh` on the live server → catalog 613 models, `commandcode/*` = 69,
  and `commandcode/deepseek/deepseek-v4.1-flash` present with `provider: commandcode`.

## Note for the picker

`default-model-picker.tsx` renders a `(unavailable)` option only when the configured id is
absent from the catalog, so the fix removes the badge without touching the component. The
underlying resolve path (`configuredDefaultModel()` in `routes/ws.ts`, REQ-129) was already
correct — it splits `provider/model` before dispatch.
