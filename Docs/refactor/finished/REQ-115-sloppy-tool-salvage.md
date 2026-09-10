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
- **Files:** `packages/lokma-core/src/tools/parse.ts`,
  `packages/lokma-core/src/tools/parse.test.ts` (+3 asserts).
