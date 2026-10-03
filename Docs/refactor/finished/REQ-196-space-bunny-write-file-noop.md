# REQ-196 — write_file does nothing on stealth/space-bunny-alpha

**Status:** done — `1394d1c`
**Reported:** 2026-10-03, live session `sess_musa0o6l_s89m`
**Model:** `commandcode/stealth/space-bunny-alpha` (also seen on any upstream
that answers with tool markup instead of native calls)

## Symptom

The agent says it wrote a file; nothing lands on disk and the chat bubble
shows the raw block:

```
<tool name="write_file">]<]minimax[>[<path>duman-tarifi.html]<]minimax[>[</path>…
```

No tool row, no error, no file. The user asks again ("dosya olarak yazsana")
and the model emits the same shape.

## What was measured first (the model is NOT at fault)

Before touching the parser, the upstream was measured directly:

| Probe | Result |
|---|---|
| `POST /provider/v1/chat/completions` with `tools[]`, stream=false | 200, `finish_reason: tool_calls`, valid `arguments` |
| same, stream=true | 200, indexed `delta.tool_calls[]` fragments join correctly |
| 12 identical runs | 12/12 native calls |
| the failing session's history replayed verbatim | native call |
| full server registry (47 tools, 28 KB body) through a recording proxy | 200 on every turn, `tools=47` present, native call |
| 14 KB and 23 KB html payloads | native, arguments complete |

So: the harness sends the schemas, the upstream accepts them, and the model
calls functions natively. The failure is in the TEXT-TOOL fallback path that
runs when a model answers with markup — and the fallback silently produced a
call with no usable input.

## Root cause

`salvageXmlArgs` matched an argument value with `([^<>]*)` — "any run of
non-tag characters". A generated landing page is full of tags, so its own
`<h1>…</h1>` ended the match long before the closing `</content>`. With the
junk wrapper in play, `<path>` and `<content>` never matched at all; the only
matches were the payload's leaf tags, so the salvage returned
`{title, h1, p}` and `write_file` ran with no `path`.

Measured on the exact broken shape:

```
current salvage -> {}          # the keyed pass finds nothing; leaf pass returns junk
after fix       -> {path: "duman-tarifi.html", content: "<!DOCTYPE html>…"}  (byte-identical)
```

## Fix

1. **Drop the junk keyword** before matching. The model's wrapper is
   `minimax` glued between brackets with a zero-width char (U+200B) inside.
2. **Match the registry's real argument tags** with `[\s\S]*?` so a payload
   that CONTAINS markup is captured whole.
3. **Strip the residue** the keyword leaves behind (`]<]\u200b>[`). The run
   must start **and** end with a bracket and contain only `[ ] < >` between
   them. That shape is what makes the strip safe:

   | value | after strip |
   |---|---|
   | `<!DOCTYPE html>…</html>` | untouched |
   | `</html>` | untouched |
   | `a[1].txt` | untouched |
   | `[1,2,3]` | untouched |
   | `{"a":1}` | untouched |

The keyed list is explicit rather than "any tag", so a payload's own `<h1>`
or `<div>` can never be mistaken for an argument name.

## Verification

```
bun src/tools/parse.test.ts                        119 checks (was 105)
bun src/tools/tools.test.ts                         93 checks
bun scripts/probe-write-junk-salvage.ts              8 checks — file on disk, byte-identical
bun scripts/probe-live-write.ts                      5 checks — real upstream, 22 KB native write
bun x tsc -p tsconfig.json --noEmit                  clean
```

**Proven-to-fail:** restoring the old leaf-only `salvageXmlArgs` makes the
suite fail at `path is a clean filename (got undefined)` and exit 1; putting
the fix back returns 119. An assertion that never went red is a comment.

**Note on lint:** `bun run lint` cannot run in this checkout —
`@typescript-eslint/parser` is not installed, so eslint reports
`Parsing error: Unexpected token` on untouched files too (verified on
`registry.ts`). Not a regression from this change.

## Follow-up worth considering

The symptom was silent: a salvage that returns garbage still produces a
`tool` row, so the user sees the model claim success. A salvage that cannot
find a `path`-like key could surface `parseError` instead of a half-call, so
the loop retries natively rather than executing a no-op write.
