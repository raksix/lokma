# REQ-004 — Açık temadaki siyah borderlar yumuşatılacak

- **Status:** done (commit `d7b44ca`, live 2026-09-07)
- **Asked:** 2026-09-07 — "açık temadaki siyah borderlar çok göz sikiyor onu düzelt".
- **Interpretation:** Hard near-black (`#262624`) fills/outlines in light theme go soft/brand: composer mode-toggle pill becomes a light track (`border-line`/`bg-muted`, dark keeps the black pill); testing stage selected-pill becomes terracotta in light (dark keeps white); `Sidebar` gets an explicit `border-line` side border (the old dynamic `border-${...}` class never compiled, so dividers were missing/uncontrolled). Dark surfaces (model popup, testing console, badges) stay dark — intentional.
- **Touched:** `components/chat/composer.tsx`, `components/testing/testing-pane.tsx`, `components/sidebar.tsx`, `components/shell/theme.ts` (+ `theme.test.ts`, 4 new checks).
- **Root cause (proven live):** dark server theme (omp) stamps `--border: 240 4% 16%` inline on `<html>`; the header toggle back to light only flipped the `.dark` class, so the global `*` border rule kept painting every border `rgb(39,39,42)`. `applyTheme('light')` now clears the stamped set.
- **Proof:** headless toggle probe BEFORE `--border 240 4% 16%`/header `rgb(39,39,42)` → AFTER `--border 36 18% 88%`, header/aside/cards/toggle-border all `rgb(230,226,219)`, toggle track `rgb(242,240,235)`; theme probe 27/27; root+web `tsc` 0; web build green (`index-D8EkNuWG.js`); live bundle match, `/` 401 anon/200 authed, `/health` 200.
