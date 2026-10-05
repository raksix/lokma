# REQ-204 — Sublume: interactive-subtitle vocabulary learning as a bundled subsystem

**Status:** `pending`
**Date:** 2026-10-05
**Requested by:** Furkan
**Origin:** Own repo `raksix/sublume` (PRIVATE) — research docs in `Docs/` there.
**Rule:** no code until the owner says "yap" / "do it". This file is the record of intent.

---

## What was asked

> "Kanka şimdi bir proje yapacağız… film, dizi, ya da işte belli bir video parçası olacak. Bu video
> parçasında biz subtitle dostunu da yıkacağız, oraya Subtitle'ı etkileşimli olacak. Atıyorum.
> İngilizce bir film dizi izliyorum. Bunun subtitle'ından şey kelimenin üstüne basıp, bu kelimenin
> anlamını görebileceğim. Sözlük kısmından ve bu kelimeye kendi sözlüğümü ekleyebileceğim, ki
> bilmediğim kelimeler, bildiğim kelimeler gibi ekleyebileceğim. İşte kelime öğrenmek için, cümle
> öğrenmek için biraz daha İngilizce geliştirme için bir program olacak."

Then, mid-research:

> "Lokma'da bir proje yapacağız. Lokma'daki ilgili bir sistem olacak. Lokma'nın sisteme de
> bakabilirsin."

## Interpretation

**Sublume** is a product that ships *inside Lokma*, not beside it. The learner watches a film
or series with subtitles rendered word-by-word; every word is a real click target; clicking
opens a definition popover; the word is saved into a personal vocabulary bank tagged
`unknown` / `learning` / `known`, carrying the exact subtitle sentence and the video
timestamp as its context; the bank is reviewed later with spaced repetition.

**The loop:** watch → click → understand → save → review.

Anti-goals: not a browser extension that fights a streaming site; not a SaaS with an
account; not a word list without context.

## Why it belongs to Lokma rather than a separate app

- It needs a player pane, a workspace mode, a persistent store, vault projection, skills,
  a bot, tools, and auth — **all five already exist** in this harness.
- Lokma already has the exact precedent: `design` and `archify` are bundled subsystems
  (core module + route + panes + `SURFACES` rows + `BUNDLED_PLUGINS` row + bot + skills).
- A second Fastify app would have to duplicate the global auth gate and session wiring
  (`packages/lokma-web/server/src/app.ts:41-52`) for no gain.

Full evidence: `raksix/sublume` → `Docs/06-LOKMA-INTEGRATION-SURFACE.md`.

## Proposed shape (not implemented)

One `lokma-core/src/sublume/` module + one route file + one web component family + rows in
the surface catalog + one bundled plugin manifest + one bot + skills. Data root
`~/.lokma/sublume/`.

Two findings from the research that shape this:

1. **The vocabulary bank is structured data, not prose.** Lokma's memory store is
   `§`-delimited markdown capped at 20 000/5 000 chars
   (`packages/lokma-core/src/memory/manager.ts:16`) and the vault graph is capped at 80
   nodes / 300 links. Neither can hold `status`, `dueAt`, `mediaRef` per word across
   thousands of entries → **SQLite primary + vault projection.**
2. **Sublume is a top-level mode, not a pane set.** A watch → click → review loop owns the
   whole screen — the same reason `Design` became the third app mode
   (`packages/lokma-web/web/src/components/panes/panes.ts:54-55`).

## Research phase — COMPLETE (2026-10-05)

Six reports, 61,872 words, 383 sources, in the private repo `raksix/sublume` under
`Docs/`. Fourteen decisions logged in `Docs/07-DECISIONS.md`.

### The one that shapes the architecture

**You cannot attach a click handler to a word in a native `<track>` cue.** Four
independent proofs, from the research and confirmed by direct measurement:

1. Cue rendering is not in the light DOM — hit-testing the caption band returned
   `["VIDEO","BODY","HTML"]`, so there is no element to bind a listener to.
2. `::cue` is a pseudo-element and cannot receive JS events at all.
3. The WHATWG issue that proposed a constructor taking a `cueNode` — i.e. making cue
   content addressable DOM — was **withdrawn**. The platform will not fix this.
4. `document.activeNodes` is `undefined` in current Chrome, so even the debugging hook
   for inspecting cue DOM is gone.

**Therefore Sublume reads cues as data and renders its own per-word overlay, keeping the
native track in `hidden` mode.** This is a gain, not a cost: the popover needs buttons and
hit areas inside cues anyway, so the overlay was never optional.

### Decisions the research settled (no owner input needed)

| # | Decision |
|---|---|
| D11 | **v1 needs no word-level timing.** Sentence cues satisfy the whole loop; forced alignment (WhisperX/stable-ts/MFA) defers entirely. |
| D12 | **Local files in v1; YouTube via `yt-dlp`; Netflix/Prime/Disney categorically out of scope** (DRM: pixels never reach JS, bypassing it is unlawful). |
| D13 | **Turkish gloss, offline-first** — Wiktionary → pretranslated Argos → MyMemory for gaps only. Zero network calls on the click path. |
| D14 | **Compete on retention, not lookup.** ~12 extensions already ship click-a-word; Netflix is building it natively. |

### Measured, not assumed

- **`api.dictionaryapi.dev` is dead** — HTTP 522 (Cloudflare origin timeout) from this
  machine, three attempts; its marketing site still answers 200, so a casual check passes.
  → the popover must be cache-first and multi-source.
- **Raw YouTube `timedtext` returns HTTP 200 with a zero-byte body** — measured twice, on
  both `fmt=json3` and `type=list`. A 200 carrying nothing is worse than an error.
- **SUBTLEX-en 50k** (subtitle-derived frequency, 622 KB) is the right corpus — a word
  frequent in subtitles and rare in books is exactly the word a learner keeps meeting.
- **`bun:sqlite` is real and precedented** (`vault/fts.ts`, `session/search.ts`) and
  arrives as a bun built-in, not a `package.json` dependency.

### Corrections to the research docs

Re-measuring produced different numbers than the agents reported: Kaikki English is
**523 MB** gz, not 2.8 GB; Turkish is **35 MB**, not 42 MB. That changes the offline
answer from disqualifying to tractable as a build-time step. Details in
`Docs/08-MEASURED-FINDINGS.md`.

## Surfaces

| Surface | Kind |
|---|---|
| Watch | top-level mode page |
| Word popover | overlay (not a tab) |
| Vocabulary bank | Inspector pane |
| Review | Inspector pane |
| Imported media | Inspector pane |

## Agent tools

`lookup_word`, `add_vocab`, `list_vocab`, `review_due`, `import_media`, `export_anki`.
Each needs a row in `packages/lokma-shared/src/surfaces.ts` or the rail/activity/tool
lists drift from each other.

## Risks

| Risk | Note |
|---|---|
| Word-level subtitle timing | Most subtitle files carry sentence timing only; karaoke highlight needs forced alignment. Whether v1 needs it at all is still open. |
| Dictionary API availability | **Measured:** `api.dictionaryapi.dev` returns HTTP 522 from this machine. The popover cannot rest on one free hosted API. |
| Scope | This is a product, not a feature. It should be sliced before any code starts. |

## Slices — proposed, for the owner to cut

1. Player + sidecar subtitle import + per-word click + popover (single local video file)
2. Vocabulary bank + status tags + sentence/timestamp attachment
3. Review (FSRS) + Anki export
4. Second video source (YouTube), word-level karaoke highlight
5. Agent/bot integration

## Decision needed from the owner

- Approve the hybrid shape, or push toward a separate app? → **Q4**
- Which slice is "first"? → **Q5** (recommendation: player + local file + sidecar
  subtitle + per-word click + popover + bank. No alignment, no YouTube, no SRS yet.)
- ~~Video sources for v1?~~ → answered, D12
- ~~Does the popover need Turkish translation?~~ → answered, D13
- ~~Word-level timing in v1?~~ → answered, D11

## Status log

- 2026-10-05 — written as `pending`. Research phase only; no code written.
- 2026-10-05 — research phase complete: 6 reports / 61,872 words / 383 sources in
  `raksix/sublume`, 14 decisions in `Docs/07-DECISIONS.md`. Three of the five open
  questions were answered by the research (D11 timing, D12 sourcing, D13 translation).
  Two remain for the owner: Q4 hybrid shape, Q5 first slice. Still no code.