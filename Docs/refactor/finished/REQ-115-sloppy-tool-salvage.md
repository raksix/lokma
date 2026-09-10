# REQ-115 — Sloppy-model tool-block salvage

- **Status:** done (canlıda — 2026-09-10)
- **Asked:** (recovery: prior tick cut off pre-commit — complete uncommitted
  work found dirty in tree, no pending REQ file on disk) sloppy models
  (mimo) close `<tool>` blocks with `</tool_result>` and emit XML
  `<key>value</key>` args instead of JSON — calls dropped as malformed,
  agent stalls with no tool run.
- **Did:** `COMPLETE_BLOCK` now accepts `</tool_result>` as a `<tool>`
  closer; new `salvageXmlArgs` converts `<key>value</key>` children to an
  object with `ARG_ALIASES` normalization (`dir`/`file`/`filepath`/
  `filename` → `path`, `cmd` → `command`); unsalvageable bodies keep an
  honest `parseError` with an actionable message (valid-JSON hint).
  Unclosed blocks still stay text (no phantom calls).
- **Proof:** parse probe 47 passed, root `tsc --noEmit` 0, concept build green.
- **Follow-up (same night):** mimo then roleplayed a whole tool session —
  `<tool_call>{"name","arguments"}</tool_call>` + hallucinated `<tool_result>`
  ("workspace empty", confident + wrong, zero execution). Parser now accepts
  the `<tool_call>` shape (`toToolCallShape`: name + arguments/args/input/
  parameters) and silently strips model-written `<tool_result>` pairs
  (fake results never reach chat) + unclosed fake tails at `finish()`;
  system prompt forbids roleplaying results. `stripModelBlocks` covers all
  three shapes for old transcripts.
- **Proof 2:** parse probe 56 passed; live E2E: same prompt now executes
  for real (`tool` role ok:true + correct answer), live tool row visible
  T+0.9s after send, status line live through the run.
- **Files:** `packages/lokma-core/src/tools/parse.ts`,
  `packages/lokma-core/src/tools/parse.test.ts` (+3 asserts).
