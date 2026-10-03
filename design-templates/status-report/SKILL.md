---
name: status-report
description: "A long-form report that leads with the number."
scope: template
mode: document
---

# Status Report — long-form, number-first

A reading document, `max-width` measure around 70ch, serif or humanist sans, no
sidebars. It is read once carefully and skimmed twice, so the structure must
survive skimming: every section opens with its own conclusion, not its topic.

## Structure

1. **Title + lead** — the report title, the period, and one sentence stating the
   headline result. The reader who stops here must still have learned something.
2. **Headline number** — one large figure with a label and one comparison. Never
   three competing hero numbers.
3. **What happened** — 2–4 sections of real paragraphs (150+ words total for the
   whole document). Each `<h2>` is a finding sentence, not a noun ("Ship time fell
   a third" beats "Performance").
4. **Evidence block** — a table or a CSS-drawn bar/column block built from the
   brief's real numbers. Label every axis. Inline SVG only, no chart library.
5. **Open questions** — what is still unknown and what would settle it. This is
   the section that makes the rest credible; never omit it.
6. **Next period** — three commitments, each one line, each measurable.

## Rules

- Body paragraphs get real sentences. No "Lorem ipsum", no "results to be
  determined", no bullet standing in for an argument.
- Tables get `<th scope>` and a caption; a number column is right-aligned with
  tabular figures.
- No pull-quotes, no emoji, no decorative dividers between every paragraph.
- The document must read correctly in print: no fixed heights, no fixed
  background colours on body text.
