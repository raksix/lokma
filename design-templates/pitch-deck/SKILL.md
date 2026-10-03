---
name: pitch-deck
description: "Six slides that carry an argument, in order."
scope: template
mode: deck
---

# Pitch Deck — 6 slides

One HTML page, one scroll. Every `<section>` is one slide sized `min-height: 100vh`
with `scroll-snap-align: start` on the html element. Use a fixed top progress rail
so the reader knows how far in they are.

## Slide order (do not reorder, do not skip)

1. **Hook** — one claim-sized headline, a single supporting line, one CTA.
   No logo wall, no "welcome to".
2. **Problem** — the status quo described concretely, with a number. Show the
   cost, not the complaint.
3. **Product** — the actual interface or a faithful abstraction of it. One
   headline plus three capability lines. Never a wireframe of nothing.
4. **Proof** — three metrics as a row, each with a label, a value and a
   comparison. Real numbers from the brief; no invented logos.
5. **Business** — how money moves. One pricing line, one unit-economics line.
6. **Ask** — the amount, the use of funds as three items, the runway it buys.

## Rules

- Each slide has exactly one `<h2>`. The first slide owns the page's `<h1>`.
- No bullet dump longer than three items anywhere.
- Numbers are large (clamp 2.5rem–4rem); the prose around them is not.
- The final slide repeats the hook's headline in a different register: the
  ask, not the claim.
- Print styles: each section breaks to its own page and drops the rail.
