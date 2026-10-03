---
name: brutalist-web
description: "Use when the artifact should read raw, blocky and structural."
category: design-style
scope: design
group: Style
---

# Brutalist Web

A hard-edged visual language. Apply it as a whole — half measures read as
generic.

## Surfaces

- Flat single-colour surfaces. No gradients, no glass, no blur.
- Visible 2-3px borders on every block; nothing floats without an edge.
- Corner radius `0` everywhere except an explicit focus ring.

## Type

- One family, weight `900` for headings and `400`/`700` for body.
- Uppercase headings, tight tracking (`-0.02em`), generous line breaks.
- Oversized scale jumps: the h1 should be at least 2.5× the body size.

## Colour and motion

- Monochrome with exactly one saturated accent used sparingly (links, one
  button, the active state) — never more than 10% of the visible area.
- Motion is instant: 0-80ms transitions only, or none. No easing curves,
  no bounce, no parallax, no reveal animation.

## Pitfalls

- Soft shadows and rounded corners contradict the language — remove them.
- Centred text over long copy reads as broken at 390px; keep the measure
  left-aligned.