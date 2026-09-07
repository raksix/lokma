# Hello pane — what an installed skill looks like in the UI

After install, the Skills pane shows one row per skill:

- **Name + id chip** — from the `SKILL.md` frontmatter.
- **Source badge** — `bundled` (ships with the repo `skills/`) or `user`
  (installed into `~/.lokma/skills/`, e.g. via the Marketplace tab).
- **skill_view button** — loads the full `SKILL.md` body (progressive
  disclosure; the list stays light).
- **Reference chips** — one per file under `references/` (like this one),
  `templates/`, `scripts/`, `assets/`; each loads jailed to the skill dir.
- **Telemetry card** — real `.usage.json` counters (`used N · viewed M ·
  patched K`), zeros until touched, never invented.

This file exists so the reference chips have something real to open —
delete it and the chip row simply disappears on rescan.
