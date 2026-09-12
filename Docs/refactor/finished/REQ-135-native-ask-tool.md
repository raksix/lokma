# REQ-135 — Native `ask_user` tool (the "Unknown tool: ask" fix)

**Status:** done · 2026-09-12
**Reported (verbatim):** "ask aracı kullanılmıyor diyor ask aracını hallet
hermes'in reposundan bakabilirsin"
**Screenshot:** `upload_20260912_194836_2.png`

## What the user saw

A tool row in the transcript, red:

```
ask   {"question":"index.html'deki \"NOVA EGE\" sayfasını inceled…   Unknown tool: ask
```

The model had the right idea — ask the user a multiple-choice question — but
the harness had no such tool, so the call failed and the model fell back to
writing the question as plain text (which is what the previous REQ-134 fix
taught it to do as markup).

## Root cause

Since REQ-128 the registry's Zod schemas ride to the provider as **native
function schemas**, so models call tools as functions. The registry only held
the eight file/shell tools plus todos and UI controls; `ask_user` existed only
as *text markup* (`<ask …>`, REQ-134). A tool-calling model therefore invented
the name (`ask`) and the executor answered `Unknown tool: ask`.

## Fix (modelled on Hermes' `clarify`, this harness' own shape)

| File | Change |
|---|---|
| `lokma-core/src/tools/ask.ts` **(new)** | `ask_user` definition: `question` (1-2000 chars) + optional `choices` (2-8, recommended first). `readOnly` unset on purpose — it must never ride a parallel read batch. The handler deliberately throws: the **loop** owns this tool. |
| `lokma-core/src/tools/registry.ts` | `alias(alias, target)` + resolution inside `get()`/`call()`, plus `has()`. Aliases are not listed as separate tools and a bad target fails at registration. |
| `lokma-core/src/tools/gate.ts` | `INTERACTIVE_TOOLS` — `ask_user` is `allow` in every mode (auto/manual/plan/bypass). Asking the user for permission to ask the user is nonsense; an explicit `deny` entry still wins. |
| `lokma-web/server/src/agent-loop.ts` | Registers the tool and aliases `ask` + `clarify` → `ask_user`. In the tool loop a native `ask_user` call is intercepted before the executor: `tool_start` row → `ask_user_question` frame → `waitAnswer` → `tool_result` + `<answer …>` fed back, so the run continues. |

Both paths now live side by side, which is the point:

- **native** — a tool-calling model calls `ask_user` (this REQ);
- **text** — a model without function calling writes `<ask …>` (REQ-134).

## Evidence

| Check | Result |
|---|---|
| `bun src/tools/tools.test.ts` (4 gate cases + 8 registry/alias cases) | **93 passed** |
| `scripts/probe-live-ask.cjs` — adds scenario 3: model told to use the native tool | see below |
| `tsc` (web) + `build:core` / `build:server` / `build:web` | clean |

Scenario 3 asserts on the deployed server: a question frame arrives, an
`ask_user` tool row is visible, **no** `Unknown tool` error appears anywhere in
the frame stream, and the turn finishes after the answer is sent.

## Notes

- Alias resolution means an older model that still emits `ask` (or a model
  trained on Hermes' `clarify`) reaches the same card instead of an error.
- The tool description tells the model *when not to ask* (low-stakes choices,
  dangerous-command confirmation) — the failure mode of an ask tool is asking
  too much, not too little.
