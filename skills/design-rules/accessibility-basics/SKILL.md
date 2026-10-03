---
name: accessibility-basics
description: "Use when the artifact must be usable with keyboard and screen reader."
category: design-rules
scope: design
group: Accessibility
---

# Accessibility Basics

Non-negotiable baseline. Apply while building, not as an afterthought.

## Keyboard

- Every interactive element is reachable with `Tab` in DOM order and shows a
  `:focus-visible` ring with at least 2px width and 3:1 contrast.
- No `tabindex` above `0`. Custom controls respond to `Enter` and `Space`.
- Nothing important hides behind hover alone.

## Semantics and labels

- Exactly one `<h1>`, then a real hierarchy (`h2`, `h3`) with no skipped levels.
- Every `<input>` has a `<label for>` or an `aria-label`; placeholder text is
  never the label.
- Icon-only buttons carry `aria-label`; decorative images carry `alt=""`.

## Colour and motion

- Body text at least 4.5:1 against its background; large text 3:1.
- Never encode meaning in colour alone — pair it with text or an icon.
- Honour `prefers-reduced-motion: reduce` by disabling animation.

## Pitfalls

- `outline: none` without a replacement ring removes the only focus signal.
- Low-contrast muted text on dark surfaces is the most common failure.