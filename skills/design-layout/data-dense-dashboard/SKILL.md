---
name: data-dense-dashboard
description: "Use when the artifact shows tables, metrics or live values."
category: design-layout
scope: design
group: Layout
---

# Data Dense Dashboard

Tables and metrics that stay readable as the row count grows.

## Layout

- Numeric columns right-aligned with tabular figures (`font-variant-numeric:
  tabular-nums`) so digits form a clean column.
- Row height 40-44px; sticky header on scroll; the first column stays sticky
  when the table scrolls horizontally.
- Group related metrics: KPI row on top (3-4 tiles max), detail table below.

## Formatting

- Format values at the source (1,284 / 98.2% / €12.40), never in prose.
- Truncate with an ellipsis plus a `title` for long text cells; never wrap a
  number across lines.
- Show units in the column header, not repeated in every cell.

## Colour

- Neutral surfaces for the bulk of the table; colour only for state
  (positive/negative/delta) and pair it with a sign or icon, never colour alone.

## Pitfalls

- Zebra striping plus heavy borders doubles the noise — pick one.
- A chart next to the same numbers is decoration unless it shows a trend.