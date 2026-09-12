# REQ-136 — Run turn budget (why work kept getting cut off)

**Status:** done · 2026-09-12
**Reported (verbatim):** "verdiğim işlem neden kesilip duruyor loglarda bir incelesene"
**Screenshot:** `upload_20260912_201119_1.png`

## What the user saw

```
[run stopped: max_turns=15]          ← assistant line in the transcript
Send failed                           ← red card
Paused after 15 tool turns with work still queued — say "continue" …
```

The session was fine; the run had simply spent its tool-turn budget. Two things
were wrong, and only one of them was the budget:

1. **The budget was a hard-coded 15** (`LOOP_DEFAULT_MAX_TURNS`), and the WS
   path passed it straight through — ordinary work (build a page, verify,
   adjust, verify) hit the ceiling mid-task. There was no way to raise it.
2. **The UI called the pause "Send failed".** The server sends the stop as an
   `error` frame with `code: 'turn_limit'`; the client dropped the code, so a
   deliberate pause rendered as a red failure — which is exactly why the report
   reads like a crash.

## Fix

| File | Change |
|---|---|
| `lokma-shared/src/schemas/config.ts` | `DEFAULT_LOOP_MAX_TURNS = 100` + `LoopConfigSchema` (`loop.maxTurns`, 1-1000) wired into `GlobalConfigSchema`, so the budget is configurable instead of compiled in. |
| `lokma-web/server/src/agent-loop.ts` | `LOOP_DEFAULT_MAX_TURNS` now derives from the shared constant; 15 → 100. |
| `lokma-web/server/src/routes/ws.ts` | `maxTurns: config?.loop?.maxTurns ?? LOOP_DEFAULT_MAX_TURNS` — the config wins, the default is only a fallback. |
| `lokma-web/web/src/lib/ws.ts` | `WsUiState.lastErrorCode` — the `error` frame's code survives into the UI. |
| `lokma-web/web/src/hooks/use-ws.ts` | Exposes `lastErrorCode`. |
| `lokma-web/web/src/components/chat/index.tsx` | Toast wording follows the code (`Run paused: …` vs `Send failed: …`). |
| `lokma-web/web/src/components/chat/lokma-message.tsx` | `RunErrorCard` takes `code`: `turn_limit` renders **"Run paused"** in amber with a `Pause` icon, everything else stays a red failure. |
| `lokma-web/web/src/components/chat/single-chat-view.tsx` | Passes the code through. |

Resume was already implemented (`[run stopped: max_turns=N]` + "say continue");
this REQ keeps it, documents it, and stops it from looking like a crash. Each
run gets its own budget, so a long task may pause again after a resume — that is
honest, not a bug.

## Evidence

| Check | Result |
|---|---|
| `ws.test.ts` — error frame keeps its code, codeless error stays null | PASS |
| `scripts/probe-live-limits.cjs` with `loop.maxTurns=2` | pause with `turn_limit`, message mentions "continue", resume did 2 more real tool turns, no generic error |
| `/tmp/lokma_limit_ui.cjs` — real browser, real run | card says **"Run paused"**, no "Send failed", `[run stopped: max_turns=…]` marker present, resume hint shown |
| Server honours config (`/api/config` → `loop.maxTurns`) | 2 when set, 100 default otherwise |

Verification note: the low budget used for the probe was written to
`~/.lokma/config.json` for the duration of the test and restored afterwards
(backup at `/tmp/lokma-config-backup.json`).
