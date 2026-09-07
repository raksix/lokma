---
name: lokma-skill-hello
description: Use when learning how a skill package is shaped. Minimal installable example.
category: example
---

# Hello Skill — the minimal installable skill package (REQ-028 example)

This directory is the reference shape every `lokma-skill` marketplace repo
should follow: a `SKILL.md` with `name` + `description` frontmatter at the
repo root, plus optional `references/` / `templates/` / `scripts/` /
`assets/` folders (the registry lists them as `linked_files`).

## Install

- **From the app:** Skills pane → Marketplace tab → search → Install
  (server runs `git clone --depth 1 <url>` into `~/.lokma/skills/`,
  checks this file, rescans — the skill appears in the registry).
- **Locally (this repo):** copy the folder into the user skills dir:
  `cp -r plugins/lokma-skill-hello ~/.lokma/skills/` — next
  `GET /api/skills` lists `lokma-skill-hello` with source `user`.
- **Verify:** open it in the Skills pane → skill_view shows this file,
  the `references/hello-pane.md` chip loads through
  `GET /api/skills/:id/file?path=`.

## When to Use

- User asks "how do I publish a skill" → point here, then at
  `Docs/27-SKILLS-auto-discovery-hermes-inspired.md` §7 install contract.
- Marketplace repo authors: keep `SKILL.md` at the root — the installer
  rejects repos without a parseable root `SKILL.md` (`no_skill_md`).
- Tag the GitHub repo with the `lokma-skill` topic so
  `GET /api/skills/marketplace` finds it.

## Rules for skill packages

- `name` (first 57 chars of `description`) is the router — keep it
  `Use when <trigger>. <one-line behavior>.`
- Never invent `linked_files` — only real files under the four folders.
- Keep `SKILL.md` under 256KB (`SKILL_FILE_CAP` rejects larger reads).
