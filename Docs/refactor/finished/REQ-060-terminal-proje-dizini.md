# REQ-060 — Terminal varsayılan olarak seçili projenin dizininde açılsın

- **Status:** done (2026-09-08 — new shells default to the selected session/project cwd via pure `resolveTerminalCwd`; session switch adopts, manual edits + refreshes never clobbered; 50/50 unit, live bundle match)
- **Asked:** 2026-09-08 — "bir de terminal açınca default olarak seçili projenin dizininde açılacak".
- **Interpretation:** Yeni terminal pane'i açılınca cwd'si o an seçili projenin/session'ın dizini olur (elle `cd` gerekmez). Session/proje değişince yeni terminaller güncel dizini alır; açık terminaller etkilenmez.
- **Touched:** web `terminal/terminal.ts` (pure `resolveTerminalCwd`) + `terminal-pane.tsx` (session-switch adopt, refresh-safe) + `index.ts` export + `terminal.test.ts` (+9 asserts).
- **Verify (plan):** root+web `tsc` 0, build'ler green, restart'lar, headless ile `pwd` çıktısının proje dizini olduğu kanıtlanır, bundle match.
