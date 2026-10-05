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

- Approve the hybrid shape, or push toward a separate app?
- Which slice is "first"?
- Video sources for v1: local files only, or YouTube too?
- Does the popover need Turkish translation, or is an English definition enough?

## Status log

- 2026-10-05 — written as `pending`. Research phase only; no code written.