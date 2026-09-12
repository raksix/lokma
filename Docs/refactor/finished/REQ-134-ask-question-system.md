# REQ-134 — Ask-the-user questions (visual question cards)

**Status:** done · 2026-09-12
**Reported (verbatim):** "kanka soru sorunca." + screenshot ·
"soru sorma sistemi yok soru sorma sistemi ekle direkt visual olarak soru sorma
sistemi de olsun"
**Screenshot:** `upload_20260912_192849_1.png`

## What the user saw

The assistant wrote the question as raw XML and the chat printed it verbatim:

```
Şu an ortada bir talimat yok, o yüzden yönü senden alayım:
<ask question="Nereden devam edelim?" choices="sayfayı görsel olarak iyileştir|içerik/metinleri düzelt (Türkçe karakterler dahil)|yeni bir bölüm/özellik ekle|sadece inceleme yap, öneri listesi ver">
```

No card, no buttons — markup as chat text. The user asked for a real question
system with a visual surface.

## What was already there

`<ask question="Q?">a|b|c</ask>` → `ask_user_question` frame → `QuestionCard`
(choices as buttons, free-text input) → `ask_response` → the run continues.
The plumbing existed; it simply never fired for this shape.

## Root causes (all three had to be fixed)

1. **Options were read only from the block body.** `toAsk()` split the body on
   `|`; this model put the options on a `choices` **attribute** and left the
   body empty.
2. **No closing tag.** `COMPLETE_BLOCK` never matched, so the streaming filter
   fail-opened the markup as visible text — exactly what the screenshot shows.
3. **The finished-text sweep had the same blind spot**, so nothing promoted the
   stray block to a question either.

## Fix

`packages/lokma-core/src/tools/parse.ts`
- `toChoices()` accepts `a|b|c`, `["a","b"]` and whitespace-trimmed labels;
  `toAsk()` reads `choices`/`options` attributes (also `q` as a question alias)
  before falling back to the body.
- `parseAskBlocks()` sweeps unclosed `<ask …>` openers too.
- `createBlockFilter()` grew a live rule (`DANGLING_ASK_LINE`): an `<ask …>`
  that owns a finished line and has no `</ask>` on it is swallowed as a
  question, so raw markup never reaches the chat surface; `finish()` handles the
  end-of-stream case with no trailing newline.
- `stripModelBlocks()` drops the unclosed tail as well (stored transcripts).

`packages/lokma-web/server/src/agent-loop.ts`
- Before flushing the turn text: if the filter found no asks, sweep the visible
  text, promote any dangling ask to a real question and cut the markup out of
  the transcript.

`packages/lokma-web/web/src/components/chat/lokma-message.tsx`
- `QuestionCard` is now a proper visual control: header block with a QUESTION
  label, numbered choice buttons (1-9 keyboard shortcuts), an always-available
  "or type your own answer" field, a sent state, and a footer that says the run
  is waiting.

## Evidence

| Check | Result |
|---|---|
| `bun src/tools/parse.test.ts` (7 new cases: attribute, bodyless, JSON body, unclosed, dedupe, strip, live filter ×2) | **90 passed** |
| `scripts/probe-live-ask.cjs` — deployed server, real WS, both shapes | **10/10** |
| `/tmp/lokma_ask_ui.cjs` — real browser, real click | **6/6** |
| Screenshot `/tmp/lokma-ask-card.png` (vision-verified: card + 3 numbered buttons + "run waits" + no raw `<ask`) | ✅ |

The probe prompt itself is not counted as leakage: baseline `<ask` occurrences
in the reopened transcript are measured and compared after the turn (4 → 4).

## Notes

- Both shapes are supported on purpose: the closed `>a|b</ask>` block and the
  attribute-only one-liner. Models pick either.
- The one-line rule is deliberately bounded: only the ask's own line is
  consumed, so prose after it stays visible.
