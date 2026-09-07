# lokma-skill-hello — example skill package (REQ-028)

Minimal installable skill: the reference shape for every `lokma-skill`
marketplace repo.

## Layout

```
lokma-skill-hello/
  SKILL.md                  # name + description frontmatter (REQUIRED at root)
  references/hello-pane.md  # linked file → chip in the Skills pane
```

## Try it

```bash
cp -r plugins/lokma-skill-hello ~/.lokma/skills/
# then: Skills pane → Registry → lokma-skill-hello (source: user)
```

The installer (`POST /api/skills/install`) enforces the same shape on
remote repos: https-only URL, `git clone --depth 1`, parseable root
`SKILL.md`, rescan. Full contract: `Docs/27` §7 install.
