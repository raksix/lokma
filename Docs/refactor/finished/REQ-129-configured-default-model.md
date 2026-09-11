# REQ-129 — The configured default model must actually drive the server

**Status:** done (2026-09-11)
**Asked:** "kanka lokmaya commadncode diye yeni provbiides ekledim ordan kullan
deepseek v4.1 flash"

## What was wrong

`~/.lokma/config.json:defaultModel` is the model the CLI and the web UI both
honour — the UI picks it when a chat opens, the CLI reads it on boot. The
server never looked at it: `routes/ws.ts` fell back to a hard-coded
`DEFAULT_MODEL = 'anthropic/claude-sonnet-4-5'` whenever a turn arrived
without an explicit model (a fresh session whose first prompt carries no
`model`, which is exactly what a user typing into the box produces).

On a machine whose default points at another provider — and which has no
Anthropic key — the effect was: every first message of every session answered
`No API key configured for Anthropic`, walked the entire 8-step retry ladder
(3s → 60s) and then aborted. Nothing in the transcript explained *why* the
provider it complained about was one the user never selected.

## What changed

- `packages/lokma-web/server/src/routes/ws.ts` — new `configuredDefaultModel(cwd)`
  reads `loadConfig(cwd).defaultModel`, honours it when the model is not
  explicitly disabled (`models[<id>].enabled === false`), and falls back to the
  built-in id only when the config is unreadable or the model is off. The
  turn-model chain is now: per-prompt override → bound bot → session meta →
  configured default → built-in id.
- `scripts/probe-configured-default.cjs` (new) — a probe that starts a session
  with **no model at all** and asserts the deployed server still completes a
  real native tool round-trip. `probe-live-server.cjs` always passes an
  explicit model, so it could never catch this class of bug.

## Evidence

- `probe-configured-default.cjs` BEFORE the fix: `tool_start x0`, 8 ×
  `retry_notice` ("No API key configured for Anthropic"), `done(reason=aborted)`.
- AFTER: **8/8 PASS** — `frames: tool_start,tool_result,text_delta,done`,
  `read_file` returned the real file contents, `cost.model = commandcode/deepseek/deepseek-v4.1-flash`,
  `retry_notice x0`.
- Explicit-model CLI probe on the same model: **12/12 PASS**
  (`commandcode/deepseek/deepseek-v4.1-flash`, native call, 2 turns, BANANA-42).
- Config set to `defaultModel: commandcode/deepseek/deepseek-v4.1-flash`
  (`defaultProvider: commandcode`); backup kept at
  `~/.lokma/config.json.bak.<timestamp>`. No credential value is stored in the
  repo — the probe mints its own token and reads nothing else.
- `tsc --noEmit` 0, server build 0 errors, `pm2 restart lokma-server` →
  `/health` 200.

## Why it happened (the model was not the problem)

The provider switch that triggered this report was fine; the bug had been
there since the server grew a default of its own. Both the CLI and the UI were
already config-driven, so only the path that *no test covered* — a session
created without a model — was broken. That gap is now covered by a probe.
