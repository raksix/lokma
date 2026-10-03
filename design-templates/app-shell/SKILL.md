---
name: app-shell
description: "A device frame around one real app screen."
scope: template
mode: mobile
---

# App Shell — one screen, honestly rendered

A phone frame centred on a neutral page background. The frame is `390px` wide
with a small corner radius and a thin bezel; inside it a real app screen, not a
wireframe of a screen. Everything is one HTML file with inline CSS, so the frame
itself is just a bordered `<div>` with an inner scroll area.

## Inside the frame, top to bottom

1. **Status bar** — time, signal, battery as inline SVG or CSS shapes. Keep it
   small and low-contrast; it is set dressing, not content.
2. **App bar** — the screen title and exactly one trailing icon button.
3. **Primary content** — the real list or feed from the brief: 5–7 rows, each
   with a title, a secondary line and one control. Real copy, real values.
4. **Bottom action** — either a tab bar (4–5 items, one active) or a single
   full-width primary button. Not both.

## States you must show

- **Empty**: one centred line plus one action, never a blank panel.
- **Loading**: three skeleton rows matching the real row geometry. Never a
  spinner on its own as the only loading treatment.
- **Error**: one inline row-level message with a retry control. Never a
  full-screen error for one failed row.

## Rules

- 44px minimum touch target on every control.
- One accent colour for interactive state only; never for decoration.
- The frame does not scroll; the inner screen does, and its scrollbar is hidden.
- Below 420px viewport width the frame goes full-bleed with 12px side padding —
  never a horizontal scrollbar.
