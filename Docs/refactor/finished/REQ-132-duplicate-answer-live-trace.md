# REQ-132 — A finished run painted its answer (and thinking) twice

**Reported:** "stream bittikten sonra 2 kere şey geliyor… cevap thinking falan çok saçma"

**Symptom:** the chat showed the same reply twice — once as a timestamped
transcript row, once as the live stream block still rendering underneath it.
The thinking block appeared on top of that, so the pane read as duplicated noise.

## Root cause

The live trace (`stream`, `thinking`, `toolCalls`, `toolMarks`) and the persisted
transcript are two views of the same turn. The shell only dropped the live trace
in one direction:

- `lib/ws.ts` `case 'done'` sets just `done: true` — the buffers stay populated.
- `hooks/use-ws.ts` cleared `stream`/`thinking` only when the **next** prompt was
  sent (`sendText`), never when a run finished.
- `components/chat/index.tsx` refetched the transcript on `done` and hid the live
  stream (`streamVisible`), but **`thinking` was passed through unguarded** and the
  hide lived in a `.then()` that never runs when the refetch rejects.

So after a clean finish the DOM held both the transcript row (from the server)
and the still-populated live buffers — every reply rendered twice, and thinking
twice as well. Verified against the session store first: the server had exactly
one row per turn (`/root/.lokma/.../sess_mtxj0ckn_kwle.jsonl`, 13 rows, no
duplicates), so the duplication was purely client-side.

## Fix

1. `lib/ws.ts` — new pure reducer `dropLiveTrace(state)`: clears `stream`,
   `thinking`, `toolCalls`, `toolMarks` and a stale `retry`, keeps everything else.
2. `hooks/use-ws.ts` — exposes `clearLiveTrace()` (wraps the reducer) on the
   `UseWs` surface; `sendText` keeps working as before.
3. `components/chat/index.tsx` — on `done`: `reloadTranscript()` **`.finally()`**
   (not `.then()`) then hides the stream **and** drops the live trace, so the
   refetched transcript becomes the single source of truth. Aborted runs are
   covered too: `agent-loop.ts` persists the partial output on its abort paths
   (`:513-548`), so the trace can safely go.

## Evidence (same probe, only the code differs)

`/tmp/lokma_dup_probe3.cjs` sends a prompt whose answer is exactly
`LOKMA-DUP-CHECK`, waits for the run to end, then counts leaf elements whose
trimmed text equals that marker — sidebar rows carry the whole prompt, so they
can never match the equality test.

| Build | Reply renderings |
| --- | --- |
| before (`git stash` of the 4 files) | **2** |
| after (fix applied) | **1** |

Both runs finished with the transcript complete (`Response complete`), so the
difference is the live-trace drop, not a timing artefact. JSON + screenshots:
`/tmp/lokma-dup-before.json`, `/tmp/lokma-dup-after.json`, `/tmp/lokma-dup-*.png`.

## Tests

- `src/lib/ws.test.ts` — new section 12: `dropLiveTrace` drops the live answer,
  live thinking and live tool rows while keeping `done`/`cost`/`sessionId`.
- `src/components/shell/narrow-layout.test.ts` — allowlist refreshed: the model
  row grid lost its 90px provider column in REQ-131 (the grouped list shows the
  provider in the sticky header), so the reviewed snippet is now
  `grid-cols-[28px_1fr_60px]`.
- `bun x tsc --noEmit` clean, `bun run build` clean, `ws.test.ts` all checks pass.

## Notes

- The remaining `narrow-layout` failures (config-pane grids, skills-pane header,
  onboarding-wizard / todo-pane / header toolbars, browser/terminal pane
  allowlists) are in files untouched by this change and were already red on
  `main`; they are not part of REQ-132.
- Server build is not needed for this change — it is web-only.
