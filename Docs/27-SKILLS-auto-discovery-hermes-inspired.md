# Auto Skill Discovery — Hermes-Inspired for Lokma

> **Inspired by:** `nousresearch/hermes-agent` (239k★) — self-improving agent with a closed learning loop
> **Hermes sources:** `agent/prompt_builder.py` (build_skills_system_prompt), `tools/skills_tool.py` / `skill_manager_tool.py`, `agent/skill_utils.py`, `agent/curator.py`, `skills/*/SKILL.md`, `hermes --help` / `hermes skills list` / `~/.hermes/skills`
> **Raw:** `raw/27-hermes-skills-ham-arastirma.md` (1044 lines, 90KB)

## 1. What Hermes Gets Right

Hermes is the only agent with a **built-in learning loop**:

- It **creates skills from experience** after a complex task (curator proposes, agent writes `SKILL.md`).
- It **self-improves skills during use** — when a better approach is found, the skill is patched in place.
- It **nudges itself to persist knowledge** — periodic memory curator prompts "is this worth saving?".
- It **searches past conversations** (FTS5 + LLM summarization) and **models the user** (Honcho dialectic).

All of this is possible because skills are **procedural memory** — not facts (`MEMORY.md`), not profile (`USER.md`), but *how to do X*.

## 2. How Hermes Skills Work (Anatomy)

```
~/.hermes/skills/<category>/<skill-name>/
├── SKILL.md            # frontmatter + instructions (max 64 chars desc, ≤100KB, 1MiB hard)
├── references/         # linked docs (auto-discovered, listed in <available_skills>)
├── templates/          # copy-paste templates
├── scripts/            # runnable helpers
└── assets/             # images, etc.
```

`SKILL.md` frontmatter (byte-0 rule):

```yaml
---
name: hermes-agent
description: "Use when configuring, setting up, or troubleshooting Hermes Agent itself. ..." # ≤64 chars trigger
category: autonomous-ai-agents
---
# Body: numbered steps, exact commands, pitfalls, verification
```

Rules Hermes enforces (we adapt):

- Description's **first 57 chars** must be `Use when <trigger>.` — this is what the router matches.
- One skill = one `SKILL.md`. References outside `references/templates/scripts/assets` = dangling lint.
- `references/` is auto-enumerated into `linked_files` in `skill_view` — no manual index.
- Limits: 64 char description, 1024 char SKILL.md body? No — 100KB warn, 1MiB hard. Categorical nesting required.

## 3. The `skills_list` / `skill_view` / `skill_manage` Trilogy

| Tool | What Hermes does | Lokma analog |
|------|------------------|--------------|
| `skills_list` | Lists available skills (name + description) — cheap, always callable | `GET /api/skills` + `lokma skills list` |
| `skill_view(name)` | Loads full `SKILL.md` + `linked_files` manifest. If `file_path` given, loads `references/x.md`. | `GET /api/skills/:id` + `GET /api/skills/:id/file?path=references/x.md` — same progressive disclosure |
| `skill_manage` | Create/patch/delete/write_file/remove_file for skills | `POST /api/skills` / `PATCH /api/skills/:id` / `lokma skills create` |

**Progressive disclosure (Hermes pattern we keep):**

1. `skills_list` (cheap) → agent sees ~50 skill names + 64-char triggers
2. Loads one `skill_view(name)` only when the task matches the trigger
3. Optionally loads a single `references/` file — never the whole skill at once

This keeps prompt-cached prefix stable and context small. Violating it (loading all skills) defeats caching.

## 4. How Hermes Auto-Discovers Relevant Skills Per Task

This is the magic the user asked for — "hermes agent kendi kendine skill araştırıp onu kullanabiliyor".

`agent/prompt_builder.py:build_skills_system_prompt()`:

```
Every turn, Hermes builds <available_skills> by:
  1. Scanning ~/.hermes/skills/*/SKILL.md (bundled + hub + user + org mirror)
  2. Snapshot-caching the manifest (LRU + disk, invalidated on mtime)
  3. Injecting a compact index into the system prompt:

     <available_skills>
       hermes-agent: Use, configure, theme, extend, and orchestrate Hermes Agent.
       codebase-inspection: Inspect codebases w/ pygount: LOC, languages, ratios.
       obsidian: Read, search, create, and edit notes in the Obsidian vault.
       ...
     </available_skills>

  4. Adding the instruction:

     "Before replying, scan the skills. If a skill matches or is even
      partially relevant, you MUST load it with skill_view(name) and
      follow its instructions. Err on the side of loading."

The agent then, in its own reasoning (no extra tool), decides:
  - Does the user's prompt trigger any <available_skills> description's "Use when"?
  - If yes → calls skill_view(name) → follows the numbered steps inside → does the task
  - If 2 skills overlap → loads both, follows both
  - If unsure → loads anyway (prefer recall over precision)
```

No classifier, no embedding search in the hot path — just **description matching by the LLM itself** against a cheap index. That's why the first 57 chars rule exists: it's the retrieval key.

**Secondary routing (not hot path):**

- `/skills search <query>` — FTS over descriptions (user-initiated or agent-initiated when <available_skills> is too long)
- `HERMES_OPTIONAL_SKILLS_DIR` — team-shared skills repo appears alongside `~/.hermes/skills`
- `~/.hermes/skills/.usage.json` — `use_count`/`view_count`/`patch_count` telemetry for curator ranking

## 5. Tool System & MCP (Context)

Hermes has 60+ tools in `tools/` (`read_file`, `write_file`, `hermes_web_search`, `execute_code`, `delegate_task`, `cronjob`, `memory`, `session_search`, etc.) gated by `toolsets.py` (`TOOLSETS`, `_HERMES_CORE_TOOLS`). Skills extend tool use with **procedural knowledge**; MCP extends it with **external tools** (`mcp_servers` in `config.yaml`, HTTP or stdio, per-server tool filtering `tools: { include: [...] }`, OAuth or API key).

Lokma keeps the same split: `lokma-core` tools are narrow-waist (always present), skills add *how*, MCP adds *where*.

## 6. Hermes vs Clo  vs Lokma

| Concern | Hermes Agent | Claude Code / Harness | Lokma (planned) |
|---------|--------------|----------------------|-----------------|
| Primary runtime | `run_agent.py::AIAgent` loop (sync, prompt-cached) | `query.ts` async generator (1730 lines) | Same as Claude Code shape, but with Hermes skill routing |
| Skill discovery | `<available_skills>` index + `skill_view` on demand | `/skills` command, not auto-routed | Hermes-style auto-routing + `/skills` palette |
| Self-improvement | Curator proposes skill after complex task; `skill_manage(patch)` during use | None (skills are static) | Same as Hermes — curator + `patch` on second use |
| Memory | `MEMORY.md` + `USER.md` + FTS5 `state.db` + vault sync | `MEMORY.md` (CLAUDE.md) + JSONL sessions | Both — see `28-MEMORY-infinite-vault.md` |
| Scheduling | `cron` (native, `hermes cron create`) | `TaskCreate` + external cron | `hermes cron`-like + DeepSeek Cordis `jobs` |
| Distribution | `~/.hermes/skills` (bundled + hub `agentskills.io` + org mirror) | `skills/` in repo | Both: `~/.lokma/skills` + hub + repo `skills/` |

## 7. How Lokma Adapts Auto-Skill-Discovery

### 7.1 Where it lives

```
lokma/
├── skills/                    # repo-bundled (git-tracked, ships with Lokma)
│   ├── lokma-core/            # e.g. git-workflow, test-driven-development
│   └── lokma-web/             # e.g. pane-layout, provider-setup
├── ~/.lokma/skills/           # user + hub (same trie as Hermes, single source)
│   └── .hub/lock.json
└── packages/lokma-core/src/skills/
    ├── registry.ts            # scan + snapshot cache (mtime + LRU)
    ├── prompt.ts              # build_skills_system_prompt() inject
    └── curator.ts             # post-task "save as skill?" nudge
```

`lokma-shared` defines `SkillSchema` (Zod) — same `name/description/references` contract, agentskills.io-compatible so hub skills are portable.

### 7.2 Runtime flow (CLI + Web, one loop)

```
1. At session start, loadConfig() resolves skills dirs:
     repo/skills  +  ~/.lokma/skills  +  $LOKMA_SKILLS_DIR (team)

2. registry.scan() → { id, description, category, linked_files }[]
   Cached: { snapshot, mtime, lruKey }. Invalidated on file mtime.

3. prompt.ts builds <available_skills> block:
     <available_skills>
       git-workflow: Use when managing GitHub PRs, reviews, branches. ...
       pane-layout: Use when arranging web panes, sidebars, drag-drop. ...
     </available_skills>
   + instruction: "If a skill matches or is even partially relevant, you MUST
     load it with skill_view(name) and follow its instructions."

4. LLM reasons: prompt contains <available_skills>, user prompt says
   "add a PR review workflow" → triggers git-workflow → agent calls
   skill_view("git-workflow") → receives SKILL.md + references → follows steps.

5. If the task was novel (no skill matched but was complex):
   curator.afterTurn() proposes: "Save this approach as skill 'pr-review-ultra'?"
   → on /yes → skill_manage(create, content=SKILL.md) → next time it's in the index.

6. On second use, if the skill was missing a pitfall:
   skill_manage(patch, old_string, new_string) → self-improvement in place.
```

No embedding, no vector DB in hot path. Just LLM description matching over a cheap index — that's the Hermes insight we keep.

### 7.3 Web parity (same index)

- `GET /api/skills` → same `registry.scan()` result (for `/skills` palette + autocomplete).
- `GET /api/skills/:id` → same as `skill_view` (SKILL.md + linked_files).
- `GET /api/skills/:id/file?path=references/x.md` → single reference load.
- `POST /api/skills` / `PATCH /api/skills/:id` → same as `skill_manage` (curator can call it from a gateway session too).
- The **web agent loop** injects the identical `<available_skills>` block — no second implementation.

### 7.4 Hub & trust

- Hub: `agentskills.io` (same as Hermes) + optional `lokma` topic on GitHub (`lokma-plugin` discovery, as in DSH).
- Install: `lokma skills install user/repo` or `GET /api/skills/install` → `git clone` + scan + appears in `<available_skills>` next turn.
- Trust: official (bundled) → trusted (vetted) → community (unvetted, `inspect` before install, scanned for injection).

### 7.5 What we copy verbatim, what we change

| Copy verbatim | Change |
|---------------|--------|
| First-57-chars `Use when <trigger>.` rule | — |
| `SKILL.md` + `references/templates/scripts/assets` layout | Add `prompts/` for Lokma web prompt fragments (optional) |
| `skill_view` progressive disclosure (index → one skill → one file) | Web `GET /api/skills/:id/file` parity |
| `.usage.json` telemetry | Store per-skill `use_count` in `~/.lokma/skills/.usage.json` same shape |
| Curator self-improvement via `patch` | Same, but also triggered by web `PATCH /api/skills/:id` |
| `HERMES_OPTIONAL_SKILLS_DIR` → `LOKMA_SKILLS_DIR` | Same env var semantics |

---

*Raw: `raw/27-hermes-skills-ham-arastirma.md` · Next: `28-MEMORY-infinite-vault.md`*
