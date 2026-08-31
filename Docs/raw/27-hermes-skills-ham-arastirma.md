# Hermes Agent Deep Research — Auto Skill Discovery & Adaption for Lokma

> **Date:** 2026-08-31 · **Focus:** How Hermes Agent auto-discovers skills and uses them · **Target:** Lokma adaption
> **Sources:** `https://github.com/nousresearch/hermes-agent` (README, `docs/`, `skills/`, `optional-skills/`, `tools/`, `agent/`, `hermes_cli/`, `website/docs/`), local install `/usr/local/lib/hermes-agent`, live runtime `/root/.hermes` ( `~/.hermes/skills`, `~/.hermes/config.yaml`, `~/.hermes/skills/.usage.json`, `hermes --help`, `hermes skills list/browse`, `agent/prompt_builder.py`, `tools/skills_tool.py`, `tools/skill_manager_tool.py`, `toolsets.py`; plus skill SKILL.md reads e.g. `autonomous-ai-agents/hermes-agent/SKILL.md`, `loop-engineering`, `hermes-harness`, `auto-continue` )

---

## Table of Contents

1. [What Hermes Agent Is — Architecture](#1-what-hermes-agent-is--architecture)
2. [Skill System — Defined, Discovered, Installed, Loaded, Invoked](#2-skill-system--defined-discovered-installed-loaded-invoked)
3. [skill_view / skill_manage Analog (skills_list trilogy)](#3-skill_view--skill_manage-analog-skills_list-trilogy)
4. [How Agent Auto-Discovers Relevant Skills Per Task (Skill Routing)](#4-how-agent-auto-discovers-relevant-skills-per-task-skill-routing)
5. [Tool System & MCP](#5-tool-system--mcp)
6. [Cron / Loop / Harness vs Hermes-Agent — Differences](#6-cron--loop--harness-vs-hermes-agent--differences)
7. [How Lokma Can Adapt Auto-Skill-Discovery](#7-how-lokma-can-adapt-auto-skill-discovery)
8. [Appendix — Key File Map & CLI Cheatsheet](#8-appendix--key-file-map--cli-cheatsheet)
9. [References — Cited Sources](#9-references--cited-sources)

---

## 1. What Hermes Agent Is — Architecture

### 1.1 One-liner

**Hermes Agent** is an **open-source, self-improving AI agent framework by Nous Research** in the same class as Claude Code / Codex / OpenClaw — an autonomous terminal agent that uses tool-calling to act on your system, but extended to run **the same agent core** across CLI, Ink TUI, Electron desktop, web dashboard, and ~20 messaging platforms via a gateway. Source: README banner + `skills/autonomous-ai-agents/hermes-agent/SKILL.md` frontmatter `description: "Use, configure, theme, extend, and orchestrate Hermes Agent."` and `website/docs/developer-guide/architecture.md` [Source: https://github.com/nousresearch/hermes-agent · README.md · /usr/local/lib/hermes-agent/skills/autonomous-ai-agents/hermes-agent/SKILL.md · website/docs/developer-guide/architecture.md]

### 1.2 Design axioms

Two principles shape every decision (quoted from `AGENTS.md`):

- **Per-conversation prompt caching is sacred.** Mutating past context / toolsets / system prompt mid-conversation invalidates provider-side caching and multiplies cost. Only exception: context compression. [Source: /tmp/hermes-agent-repo/AGENTS.md · website/docs/developer-guide/prompt-assembly.md]
- **Core is a narrow waist; capability lives at edges.** Every core tool ships on every API call; most new capability arrives as **skill, CLI command + skill, service-gated tool, or plugin**, not core. [Source: AGENTS.md §Contribution Rubric · website/docs/developer-guide/creating-skills.md]

Companion properties marketed in README: self-improving via skills, persistent memory, multi-platform gateway, provider-agnostic, profiles, extensible/themeable. [Source: README.md feature table]

### 1.3 Runtime forms

| Surface | Entry | What it reuses |
|---------|-------|----------------|
| **Classic CLI** | `hermes` (Rich + prompt_toolkit) | `cli.py` → `run_agent.py::AIAgent` |
| **Ink TUI** | `hermes --tui` | Node (Ink) + Python `tui_gateway` JSON-RPC over stdio [Source: AGENTS.md §TUI Architecture] |
| **Web dashboard** | `hermes dashboard` | Embeds `hermes --tui` via `ptyprocess`; not a rewrite [Source: AGENTS.md §TUI in Dashboard] |
| **Electron desktop** | `apps/desktop` | `@assistant-ui/react` + `tui_gateway` + `@hermes/shared` WS client; spawns `hermes serve` (headless). No dep on dashboard frontend [Source: AGENTS.md §Electron Desktop Chat App] |
| **Gateway** | `hermes gateway run` | `gateway/run.py` — Telegram/Discord/Slack/WhatsApp/Signal/Email/etc. |
| **ACP server** | `hermes acp` | VS Code / Zed / JetBrains |
| **OpenAI proxy** | `hermes proxy` | Local OpenAI-compatible endpoint backed by OAuth |

### 1.4 Code layout (load-bearing)

```
hermes-agent/
├── run_agent.py          # AIAgent — ~12k LOC core loop
├── model_tools.py        # discover_builtin_tools(), handle_function_call()
├── toolsets.py           # TOOLSETS, _HERMES_CORE_TOOLS (default bundle)
├── cli.py                # HermesCLI (~11k LOC)
├── hermes_state.py       # SQLite state.db + FTS5 session search
├── hermes_constants.py   # get_hermes_home() (profile-aware)
├── agent/                # prompt_builder, context_compressor, memory, curator, …
│   ├── prompt_builder.py # <-- SKILLS INDEX BUILT HERE
│   ├── skill_utils.py    # parse_frontmatter, skill_matches_*, get_all_skills_dirs
│   ├── curator.py        # background skill lifecycle
│   └── system_prompt.py  # 3-tier cached prompt: stable / context / volatile
├── hermes_cli/           # setup, config, skills/mcp/kanban/cron CLI
├── tools/                # one file per tool + registry.py
│   ├── registry.py       # central ToolRegistry
│   ├── skills_tool.py    # skills_list, skill_view
│   └── skill_manager_tool.py # skill_manage (create/edit/patch/delete/write_file)
├── gateway/              # messaging adapters
├── cron/                 # jobs.py + scheduler.py
├── skills/               # bundled skills (always active)
├── optional-skills/      # niche/heavy — installed via `hermes skills install`
├── plugins/              # memory/context_engine/model-provider/kanban/…
├── ui-tui/               # Ink React TUI
└── tui_gateway/          # Python RPC backend for TUI
```
[Source: AGENTS.md §Project Structure · website/docs/developer-guide/architecture.md · `/usr/local/lib/hermes-agent` ls]

### 1.5 AIAgent loop (synchronous, sharded mentally)

```python
# run_agent.py::AIAgent.run_conversation (simplified)
while (api_call_count < max_iterations and budget.remaining>0) or grace_call:
    if interrupt_requested: break
    resp = client.chat.completions.create(model=model, messages=messages, tools=tool_schemas)
    if resp.tool_calls:
        for tc in resp.tool_calls:
            result = handle_function_call(tc.name, tc.args, task_id)
            messages.append(tool_result_message(result))
        api_call_count += 1
    else:
        return resp.content
```
- Tools include reasoning in `assistant_msg["reasoning"]`. [Source: AGENTS.md §AIAgent Class]
- Context compression triggers near token limit; volatile memory not mutated mid-session until rebuild. [Source: website/docs/developer-guide/prompt-assembly.md]

### 1.6 Config & state homes (profile-aware — never hardcode `~/.hermes`)

```
~/.hermes/config.yaml       settings (not secrets) — edit via `hermes config set`
~/.hermes/.env              API keys / tokens only — also via $HERMES_HOME/.env if set
~/.hermes/skills/           single source of truth for skills (bundled+hub+user)
~/.hermes/state.db          canonical session store (FTS5)
~/.hermes/skills/.usage.json sidecar telemetry (use_count, view_count, patch_count)
~/.hermes/logs/             agent.log / errors.log / gateway.log
~/.hermes/skills/.bundled_manifest  which skills were seeded from repo
~/.hermes/skills/.hub/lock.json     hub-installed skills
~/.hermes/skills/.archive/          curator archive (recoverable)
~/.hermes/skills/.curator_suppressed curated builtins pruned durability
```
Profiles live at `~/.hermes/profiles/<name>/` with same layout; resolve via `get_hermes_home()` / `$HERMES_HOME`. [Source: skills/autonomous-ai-agents/hermes-agent/SKILL.md §Key Paths · hermes_constants.py]

---

## 2. Skill System — Defined, Discovered, Installed, Loaded, Invoked

### 2.1 What is a Skill?

A **skill** is **procedural memory**: a reusable, narrow, actionable workflow package that captures *how to do a specific type of task* from proven experience. Memory (`MEMORY.md`/`USER.md`) is broad/declarative; skills are narrow/actionable. Compatible with **agentskills.io** open standard. [Source: tools/skill_manager_tool.py module docstring · tools/skills_tool.py module docstring · README feature table "closed learning loop"]

Mental model from `website/docs/developer-guide/prompt-assembly.md`:

> *"If you want different repo rules, edit project context files. If you want reusable operating procedures, add or modify skills. If you want to change how Hermes assembles prompts for everyone, change Python."*

Skills are the **supported customization surface for reusable procedures** — no fork needed.

### 2.2 Skill anatomy (on disk)

```
~/.hermes/skills/
├── my-skill/                       # flat skill (personal)
│   ├── SKILL.md                    # REQUIRED — frontmatter + instructions
│   ├── references/                 # supporting docs (load via skill_view(..., file_path))
│   ├── templates/                  # templates
│   ├── scripts/                    # helper scripts
│   └── assets/                     # supplementary files (agentskills.io)
└── category-name/                  # categorized (recommended for repo skills)
    └── another-skill/
        └── SKILL.md
```

Also:

- `skills/<category>/<name>/SKILL.md` inside repo checkout → **bundled** (ships by default)
- `optional-skills/<category>/<name>/SKILL.md` → **optional** (install on demand via `hermes skills install official/<category>/<name>`)
- `~/.hermes/skills/_org/<org_id>/...` → **org-mirrored** skills (token-gated via `.active_org`)
- `./.hermes/skills/` / `./.agents/skills` → **project-local** skills (when repo trusted via `hermes skills trust`)
- `skills.external_dirs` (in `config.yaml` / extra dirs) → **external** read-only dirs [Source: agent/skill_utils.py · agent/prompt_builder.py §External + project dirs · hermes skills --help]

Support dirs (`references/`, `templates/`, `assets/`, `scripts/`) are **not** standalone skills even if they contain a `SKILL.md` preserved by curator archive. Gated by `SKILL_SUPPORT_DIRS` and `is_skill_support_path()`. [Source: agent/skill_utils.py: `SKILL_SUPPORT_DIRS = frozenset(("references","templates","assets","scripts"))`]

Excluded dirs pruned on every scan: `.git`, `.github`, `.hub`, `.archive`, `.venv`, `venv`, `node_modules`, `site-packages`, `__pycache__`, `.tox`, `.nox`, `.pytest_cache`, etc. [Source: agent/skill_utils.py: `EXCLUDED_SKILL_DIRS`]

### 2.3 SKILL.md format (frontmatter — agentskills.io compatible)

Every skill is a **markdown file with YAML frontmatter** between `---` fences, no leading blank line:

```yaml
---
name: my-skill-name               # required, ≤64 chars, ^[a-z0-9][a-z0-9._-]*$
description: "Use when X. Y behavior." # required, validator 1024 but REVIEW HARDLINE 60
version: 1.0.0
license: MIT
platforms: [linux, macos, windows] # optional — OS gate (macos→darwin, linux→linux, windows→win32)
environments: [kanban]            # optional — relevance gate (kanban/docker/s6)
prerequisites:                    # legacy
  env_vars: [API_KEY]
  commands: [curl, jq]
required_environment_variables:   # modern — drives secret capture
  - name: GITHUB_TOKEN
    prompt: "Paste GitHub PAT"
    help: "https://github.com/settings/tokens"
    required_for: "GitHub API"
    optional: false
required_credential_files:        # file mounts for Modal/Docker sandbox
  - path: ~/.config/gcloud/...
compatibility: Requires X         # agentskills.io
metadata:
  hermes:
    tags: [fine-tuning, llm]
    related_skills: [peft, lora]
---

# Skill Title

2-3 sentence intro. When to use + Prerequisites + How to Run + Quick Reference
+ Procedure (numbered steps with checkable criteria) + Pitfalls + Verification
# Keep ~100 lines simple / ~200 complex; heavy material → references/*.md
```

**Hard rules**

- Must start at byte 0 with `---` (BOM `U+FEFF` stripped; Windows Notepad gate in `skill_utils.py::parse_frontmatter`). [Source: agent/skill_utils.py §parse_frontmatter]
- Must close with `\n---\n`, parse as YAML mapping, non-empty body after. Validator in `tools/skill_manager_tool.py::_validate_frontmatter`. [Source: tools/skill_manager_tool.py]
- Body `SKILL.md` ≤ 100,000 chars enforced (`MAX_SKILL_CONTENT_CHARS`) — practical target 8-14k chars. [Source: tools/skill_manager_tool.py: `MAX_SKILL_CONTENT_CHARS = 100_000`]
- Per-file cap 1 MiB (`MAX_SKILL_FILE_BYTES`). [Source: tools/skill_manager_tool.py]
- Description first 57 chars + `...` is what the **system prompt index truncates to** — trigger must be self-contained there. Rule of good skill: `"Use when <trigger>. <one-line behavior>."` [Source: tools/skill_manager_tool.py: `SKILL_MANAGE_SCHEMA` description · website/docs/developer-guide/creating-skills.md]
- `platforms:` absent ⇒ compatible everywhere. Termux special-case: `linux` also matches Android `sys.platform=="android"` (Python 3.13+). [Source: agent/skill_utils.py::skill_matches_platform]
- `environments:` absent ⇒ relevant everywhere; `environments: [kanban]` hides from index when kanban not active but **still loadable explicitly** via `skill_view` / `--skills` (explicit consent bypass). Tags: `kanban`, `docker` (`is_container()`), `s6` (`/run/s6` or `/package/admin/s6-overlay`). [Source: agent/skill_utils.py §§_detect_environment, skill_matches_environment]

**Body section order (modern, from `hermes-agent-skill-authoring` skill):**

```
# <Skill> Skill
When to Use (+ Don't use)
Prerequisites (exact env vars, installs)
How to Run (via `terminal` tool)
Quick Reference (flat command list)
Procedure (numbered, each with completion criterion)
Pitfalls (known limits)
Verification (how to prove it worked)
```

Reference Hermes tools not raw shell (`search_files` not `grep`, `read_file` not `cat`, `patch` not `sed`/`awk`). [Source: /root/.hermes/skills/software-development/hermes-agent-skill-authoring/SKILL.md]

### 2.4 Provenance & tiers

| Tier | Where | Installed via | Curator touches? | Pin semantics |
|------|-------|---------------|------------------|---------------|
| **Bundled** | `skills/` in repo → copied to `~/.hermes/skills/` seeded from git; tracked in `.bundled_manifest` | `hermes` install / `hermes update` / `hermes skills repair-official` | Only if `curator.prune_builtins: true` (default true) **except** `PROTECTED_BUILTIN_SKILLS = {"plan"}` plus `pinned` exempt [Source: tools/skill_usage.py] | `hermes curator pin <name>` exempts |
| **Optional** | `optional-skills/` in repo | `hermes skills install official/<category>/<name>` → `.hub/lock.json` | No | No |
| **Hub community** | `skills.sh` / ClawHub / direct `https://.../SKILL.md` URL | `hermes skills install <id|url>` | No | No |
| **User-local** | `~/.hermes/skills/<name>` or `<category>/<name>` | `skill_manage(action="create")` (agent) or manual | Only when `created_by: "agent"` via background review fork; foreground `create` stays user-owned (`created_by: null`) [Source: tools/skill_manager_tool.py `record_created(agent_created=is_background_review())`] | `pin` blocks delete but not patch/edit |
| **Project-local** | `./.hermes/skills/` or `./.agents/skills/` (per git root) | `hermes skills trust` to load | No (but scanned at highest precedence) | N/A |
| **Org-mirrored** | `~/.hermes/skills/_org/<org_id>/` | sync client `skills_sync_client.pull_org_skills` token-gated via `.active_org` | Depends | N/A |

Bundled seeding rule: `hermes update` recopies builtins unless suppressed by `.curator_suppressed` (curator prune durability). [Source: tools/skill_usage.py §_suppressed_file]

### 2.5 Discovery (how agent finds skills on disk)

**Central function:** `agent/prompt_builder.py::build_skills_system_prompt()` + `:: _build_skills_system_prompt_inner()` and `agent/skill_utils.py::iter_skill_index_files` [Source: prompt_builder.py lines ~1739-2111]

**Inputs**

- `get_skills_dir()` → `~/.hermes/skills/` (profile-aware via `$HERMES_HOME`)
- `get_all_skills_dirs()` → local + `skills.external_dirs` (+ external read-only)
- `get_project_skills_dirs()` → trusted `./.hermes/skills`, `./.agents/skills` walked to git root
- Config `skills.disabled` / `skills.platform_disabled.<platform>` (global ∪ platform) minus `ESSENTIAL_SKILLS={"hermes-agent"}` (never disable). [Source: agent/skill_utils.py::get_disabled_skill_names]
- `skills.external_dirs` concept similar to Codex but hermes local. [Source: prompt_builder.py §External skill directories comment]

**Scan order & precedence**

1. **In-process LRU** keyed by `(skills_dir, tools, toolsets, hidden)` — prompt caching stability. [Source: prompt_builder.py §stable tier comment]
2. **Disk snapshot** `.skills_prompt_snapshot.json` validated by manifest (`_build_skills_manifest` walking skills dir with `SKILL_SUPPORT_DIRS` pruning + `ORG_MIRROR_DIR_NAME` gate). Rebuild only when manifest mismatch. [Source: prompt_builder.py §§_skills_prompt_snapshot_path, _load_skills_snapshot, _write_skills_snapshot]
3. **Active skills** → `_parse_skill_file` per `SKILL.md` (platform + environment gate), `extract_skill_description`, collect `skills_by_category`.
4. **Project-local** skills iterated per `get_project_skills_dirs()` — if project skill shadows a profile-local one, the profile-local entry is **dropped** before rendering (project wins). [Source: prompt_builder.py §Posture-driven category demotion / shadow logic `entries_shadowed...`]
5. **External dirs** appended (local names win collisions via `seen_skill_names`). [Source: prompt_builder.py §§ External skill directories]
6. **Category postures**: non-coding posture demotes descriptions (names stay, descs omitted — never hidden). [Source: prompt_builder.py §§Posture-driven category demotion]

**Collisions**

- Two org/personal skills sharing same name → both ` [name collision]` flagged, `skill_view` refuses. [Source: prompt_builder.py comment `When a personal and an org skill share a name, NEITHER silently wins`]
- Two skills with same bare name across local+external → `skill_view` records candidates, warns `"Ambiguous skill name"` and refuses; caller must use `category/name` path. [Source: tools/skills_tool.py candidate collection & `len(candidates)>1` branch]
- Project vs local same-name → project wins (intentional override). [Source: tools/skills_tool.py `project_candidates` narrow]

**Cache TTL**

`_SKILLS_CACHE_TTL_SECONDS = 30.0` in `tools/skills_tool.py`; signature = per-dir max mtime (dir + immediate children) + disabled-set + `sys.platform` patch-aware. [Source: tools/skills_tool.py §§_SKILLS_CACHE, _skills_scan_signature]

### 2.6 Installation paths

**Bundled** — implicit on `hermes` install; `hermes update` / `hermes skills repair-official` backfills. Respect `skills.opt-out` / `opt-in`. [Source: `hermes skills --help` show `opt-out`, `opt-in`, `repair-official`]

**Hub/official-optional lifecycle:**

```bash
hermes skills browse                  # 90k+ skills, page 1/4534 (star = official)
hermes skills search "mcp github"     # registry search (skills.sh + GitHub)
hermes skills inspect official/devops/actual-setup  # preview without install
hermes skills install official/security/1password   # by identifier
hermes skills install https://example.com/SKILL.md  # direct URL
hermes skills tap add raksix/lokma   # add GitHub repo as source
hermes skills check / update / uninstall / publish / snapshot
hermes skills tap config              # sources
```

[Source: `hermes skills --help` · `hermes skills browse` output captured 2026-08-31 — 90666 skills · 139 official optional · `hermes skills inspect hermes-agent` resolving to two community ids `skills-sh/wihy/hermes-agent-skill/hermes-agent` vs `skills-sh/nousresearch/hermes-agent/hermes-agent`]

**Agent-driven lifecycle:**

```python
# via tool:
skill_manage(action="create", name="my-skill", content="---\nname: my-skill\ndescription: ...\n---\n...")
skill_manage(action="write_file", name="my-skill", file_path="references/api.md", file_content="...")
skill_manage(action="patch", name="my-skill", old_string="foo", new_string="bar")
skill_manage(action="delete", name="my-skill")
# Curator consolidation delete needs umbrella proof:
skill_manage(action="delete", name="old", absorbed_into="umbrella")  # umbrella must exist
```

All user skills land in `~/.hermes/skills/` (single source). Existing skills modified wherever they live (bundled/hub/user). [Source: tools/skill_manager_tool.py §SKILL_MANAGE_SCHEMA + docstring]

**Collaboration sugar**

- `hermes bundles` — alias: one `/<name>` loads several skills (= skill composition). [Source: `hermes --help` "bundles: Create, list, and manage skill bundles" · prompt_builder stable tier]
- `hermes sync` — sync skills across devices/team (configured `skills_sync_client`). [Source: `hermes --help` "sync Skill Sync"]

### 2.7 Loading — progressive disclosure (3 tiers, Anthropic-inspired)

From `tools/skills_tool.py` module docstring:

| Tier | Cost | What you get |
|------|------|--------------|
| **1. Listing** | ~2 tokens/entry | `skills_list()` → name + 60-char description + category |
| **2. Full instructions** | ~1-8k tokens | `skill_view(name)` → SKILL.md body + frontmatter + linked_files dict |
| **3. Linked files** | on demand | `skill_view(name, file_path="references/api.md")` → that file |

This is the agentskills.io pattern. Don't load full bodies speculatively; first scan, then load only when relevant. [Source: tools/skills_tool.py docstring · agent/prompt_builder.py §"Skills (mandatory)" preamble `Before replying, scan...`]

### 2.8 Invocation

A skill is **not a tool call** that runs code. It is **knowledge injection**: `skill_view` returns markdown; the agent then **follows** instructions, using other tools (`terminal`, `read_file`, `web_search`, `execute_code`, `delegate_task`, etc.) as the skill directs. Skills declare: *"Use when <trigger>"*, numbered steps, pitfalls, verification. Agent obedience to the injected system-prompt index line is what makes invocation happen. [Source: `hermes-agent` SKILL.md Routing Table · all SKILL.md "When to Use" sections]

Explicit preload:

```bash
hermes --skills seo-audit,code-review "audit this repo"
hermes -s tabtangle "build tabs feature"
```

Inside prompt: `skill_view(name="seo-audit")` imperative from system prompt. [Source: `hermes --help` `--skills SKILLS` flag · `cli.py` global flags]

Slash sugar: `/skills` shows management; `skills_list` skills become slash commands when installed (? not all). Skills ending up in `COMMAND_REGISTRY` become `/<skill-name>`? In Hermes, `/skills` is meta; skills appear under `<available_skills>` not slash. Actual slash list in `hermes_cli/commands.py`.

---

## 3. skill_view / skill_manage Analog (skills_list trilogy)

Hermes exposes **three tools in toolset `skills`** (default-enabled on every platform via `_HERMES_CORE_TOOLS`). They wake only when the toolset is enabled — but the prompt builder still injects index even if disabled, pointing to docs URL fallback (dangling ref guard in `prompt_builder.py` ~line 171). [Source: toolsets.py: `_HERMES_CORE_TOOLS` includes `skills_list`, `skill_view`, `skill_manage` ·  toolsets.TOOLSETS["skills"] · prompt_builder variant injected when skill tools not in schema]

### 3.1 `skills_list()` — tier 1

**Purpose:** Token-efficient discovery. Returns **metadata only**: name, description (truncated to `SKILL_PROMPT_DESC_LIMIT`, typically 60-57), category. Platform/environment filtered.

**Implementation:** `tools/skills_tool.py::_find_all_skills()` → scans `get_all_skills_dirs()` + project + external, prunes excluded/support, respects disabled. Cached 30s via `_SKILLS_CACHE`. Also merges `DESCRIPTION.md`-style index? LRU path.

**Returns:** `{"success": True, "skills": [{"name","description","category"}...], "count": N}` sorted (`_sort_skills`). First call warms `.skills_prompt_snapshot.json`.

**Similar tool seen on capturable surfaces:** The parent AI's dev prompt proves the exact shape available to subagents: `skills_list` and `skill_view(name, file_path=None)` — note naming `skills_list` (plural) vs `skill_view` (singular) per hermes convention (mirrors file `skills_tool.py`). [Source: tools/skills_tool.py · /usr/local/lib/hermes-agent/tools/skills_tool.py header docs · parent prompt "Active Hermes profile..." memory decoded]

**Examples**

```python
# In execute_code the HERMES pattern:
from hermes_tools import web_search, terminal, ...  # not for skills
# but direct tool calls (model):
# skills_list() → 183 skills (77 builtin + 106 local on this host per `hermes skills list` 2026-08-31)
# capture: 0 hub-installed, 77 builtin, 106 local — 183 enabled, 0 disabled
```

### 3.2 `skill_view(name, file_path=None)` — tier 2-3

**Full signature** (from registry): `skill_view(name: str, file_path?: str) -> JSON-string`

Handles 4 lookup strategies in order, with dedup across all `all_dirs`:

1. **Plugin skill** `namespace:bare` (e.g. `grix:board`) — via `plugins.plugin_manager`. Returns `_serve_plugin_skill` or available list if namespace exists but bare missing. [Source: tools/skills_tool.py plugin branch ~line `PLUGIN_SKILL_RE`]
2. **Direct path** `search_dir / name / SKILL.md` (category case like `mlops/axolotl`).
3. **Recursive by parent dir name** (catches `foundations/runtime/explore-codebase` called by bare `explore-codebase`) + frontmatter `name:` match (because `skills_list()` exposes frontmatter name even when dirname shorter).
4. **Legacy flat** `search_dir.rglob(f"{name}.md")` excluding support docs.

After collect → **collision detection** (strict fail): if `len(candidates)>1`, refuse with `matches[]` hint to use full path.

**Project quarantine gate:** If candidate under project dir and `is_quarantined_project_skill` (dangerous scan verdict), refuse even by explicit name (same chokepoint index uses). [Source: tools/skills_tool.py ~ `is_quarantined_project_skill` branch]

**Platform-disabled gate:** If skill's `frontmatter.name` in `get_disabled_skill_names()`, refuse with hint `hermes skills`.

**Read once** then:

- Security warnings (outside trusted dirs, `_INJECTION_PATTERNS` list: `ignore previous instructions`, `you are now`, `disregard your`, etc. — logs WARN). [Source: tools/skills_tool.py `_INJECTION_PATTERNS`]
- `skill_matches_platform` check → `UNSUPPORTED`.
- If `file_path` supplied → path-traversal guard (`has_traversal_component`, `validate_within_dir` in `tools/path_security.py`), else normal.
- If `file_path` missing → enumerate `linked_files = {references, templates, assets, scripts}` and return:
  ```json
  {
    "success": true,
    "name": "skill-name",
    "content": "---\nname: ...\n---\n# Title\n...",
    "path": "~/.hermes/skills/category/skill/SKILL.md",
    "frontmatter": {"name": "...", "description": "...", ...},
    "linked_files": {"references": ["references/api.md"], "scripts": ["scripts/foo.py"]},
    "readiness_status": "available" | "setup_needed" | "unsupported",
    "setup_note": "Setup needed before using... missing GITHUB_TOKEN. help: https://...",
    "_source_path": "/abs/path"  // for dedup fingerprint
  }
  ```
- Also handles `required_environment_variables` collection (legacy `prerequisites.env_vars` normalized), env var passthrough registration `register_env_passthrough(available_env_names)`, credential files mount `register_credential_files`, and optional `preprocess` via `agent.skill_preprocessing.preprocess_skill_content`.

**Caching side-effects:** `mark_background_review_skill_read(path)` + `skill_usage.bump_view()` (view_count, last_viewed_at). [Source: tools/skills_tool.py tail + tools/skill_usage.py]

**Error modes**

- `Skill 'x' not found` → includes top-20 available skills, hint `Use skills_list`.
- `Ambiguous skill name 'x': 2 skills match... Pass full relative path`.
- `Skill 'x' is disabled` / `not supported on this platform` / `is quarantined`.
- `Path traversal ('..') is not allowed`.
- `Skill 'x' file no longer exists at ...` for stale plugin registry.

### 3.3 `skill_manage(...)` — mutation (procedural memory write)

**OpenAI schema** at bottom of `tools/skill_manager_tool.py`:

```json
{
  "name": "skill_manage",
  "description": "Create, update, or delete skills — your procedural memory for recurring task types. Actions: create (full SKILL.md + optional category; lands in ~/.hermes/skills/), patch (old_string/new_string for a targeted fix — preferred; OR content alone for a full SKILL.md rewrite), delete, write_file/remove_file (supporting files). Existing skills are modified wherever they live. Good skills: a self-contained trigger in the description's first 57 chars ('Use when <trigger>. <one-line behavior>.'), numbered steps with exact commands, pitfalls, verification (see skill_view() for format). Confirm with the user before create/delete.",
  "parameters": {
    "required": ["action", "name"],
    "properties": {
      "action": {"enum": ["create","patch","delete","write_file","remove_file"]},
      "name": {"description": "Skill name (lowercase, hyphens/underscores, max 64 chars)"},
      "content": {"description": "Full SKILL.md (frontmatter + body). Required for create; on patch it does full rewrite"},
      "category": {"description": "Optional category/domain — only for create"},
      "file_path": {"description": "Supporting file under references/templates/scripts/assets — required for write_file/remove_file; optional for patch (defaults to SKILL.md)"},
      "file_content": {"description": "For write_file"},
      "old_string": {"description": "For patch — must be unique unless replace_all=true"},
      "new_string": {},
      "replace_all": {"type":"boolean"},
      "absorbed_into": {"description": "hidden — curator consolidation delete proof"}
    }
  }
}
```

Note: `edit` (full SKILL.md replace) existed in older builds; current registry enumerates `create|patch|delete|write_file|remove_file` where `patch` with `content` alone is the full-rewrite (major overhauls) vs `old_string/new_string` for targeted fix (preferred). [Source: tools/skill_manager_tool.py `SKILL_MANAGE_SCHEMA` · registry registration `lambda args... handler=skill_manage`]

**Validation stack**

- `_validate_name`: `^[a-z0-9][a-z0-9._-]*$`, ≤64.
- `_validate_category`: one dir segment, no `/` or `\`.
- `_validate_frontmatter`: starts `---`, closes `\n---\n`, YAML mapping, `name`+`description` present, non-empty body; `description` ≤1024 but `is_skill_description_truncated_for_prompt` warns when > limit.
- `_validate_content_size`: ≤100k chars (else must split to references).
- `VALID_NAME_RE`, `MAX_SKILL_FILE_BYTES` 1 MiB.
- `ALLOWED_SUBDIRS = {"references","templates","scripts","assets"}` for `write_file`/`remove_file`.
- `_is_path_redirect`, `_validate_delete_target` defense-in-depth against symlink/junction rmtree escapes (Kilo Code #11227 port). [Source: tools/skill_manager_tool.py top constants + `_validate_*`]

**Guards (pre-mutation)**

- `_pinned_guard` (and `ESSENTIAL_SKILLS={"hermes-agent"}` permanent pin) — refuse delete of pinned/essential (but patch/edit allowed). [Source: tools/skill_manager_tool.py `_pinned_guard`]
- `_background_review_write_guard` + `is_background_review()` — autonomous curator fork may only mutate `created_by:"agent"` skills; refuse external/bundled/hub/ non-curator, pinned. [Source: tools/skill_manager_tool.py `_background_review_write_guard`]
- `_background_review_read_before_write_guard` — curator must have `skill_view`-loaded target path exactly before mutating it (prevents inferred patch). [Source: tools/skill_manager_tool.py `_background_review_read_before_write_guard`]
- `_curator_consolidation_delete_guard` — curator delete MUST declare `absorbed_into=<umbrella>` that exists; bare prune refused (fail-closed #29912). [Source: tools/skill_manager_tool.py `_curator_consolidation_delete_guard`]
- `_org_mirror_write_guard` — org mirrored skills read-only to all writers? [Source: tools/skill_manager_tool.py `_org_mirror_write_guard`]
- `_apply_skill_write_gate` — `tools/write_approval.py` approval staging. When `skills` gate on, write stages as pending (`staged:true, pending_id`) rather than blocking; `/skills approve` replays via `apply_skill_pending` with `_skill_gate_bypass`. [Source: tools/skill_manager_tool.py `_apply_skill_write_gate`]
- `_security_scan_skill` via `tools/skills_guard.py::scan_skill` + `should_allow_install` — blocked skills revert (`atomic_write_text(original_content, preserve_mode=True)`) and error with `format_scan_report`. Default off for `guard_agent_created` (user can `hermes config set skills.guard_agent_created true`). [Source: tools/skill_manager_tool.py `_security_scan_skill`]

**Post-mutation bookkeeping (best-effort, never blocks)**

- Audit ledger `skill_ledger.record_mutation(action, name, before, after_root, evidence={"absorbed_into","archived","session_id"})`. [Source: tools/skill_manager_tool.py post-success `skill_ledger` block]
- `clear_skills_system_prompt_cache(clear_snapshot=True)` — invalidate LRU + `.skills_prompt_snapshot.json` so next turn sees mutation. Instructed: "current session loader cached — new skill visible only next session" (documented in authoring skill pitfall #9). [Source: tools/skill_manager_tool.py · skills/software-development/hermes-agent-skill-authoring/SKILL.md §Pitfalls]
- Telemetry `skill_usage.record_created / bump_patch / forget` — curated via `.usage.json`. [Source: tools/skill_manager_tool.py · tools/skill_usage.py]
- Debounced sync push `skills_sync_client.maybe_push_skills` after 5s quiet window, collapsed burst, only if `is_sync_enabled(skill_name)` and access gate (Nous admin token). [Source: tools/skill_manager_tool.py `_maybe_debounced_sync_push`]
- Org auto-propose `_maybe_auto_propose_org_edit` note attached as `org_sharing`. [Source: tools/skill_manager_tool.py]

**Batch**

- `_skill_manage_batch` — one skill atomically; hidden from schema to discourage multi-skill batch? Still reachable when `batch` kw set? Implementation uses per-entry rollback snapshots at `skill_dir` snapshots kept till batch commit. [Source: tools/skill_manager_tool.py `_skill_manage_batch`]

---

## 4. How Agent Auto-Discovers Relevant Skills Per Task (Skill Routing)

Hermes does **not** use a retrieval-ranking microservice at call time. It uses a **prompt-engineered mandatory scan** over a **pre-built index**, plus gating, plus explicit preload and slash sugar.

### 4.1 The index — `build_skills_system_prompt()`

**Where it lives in prompt:** stable tier (cached). Ordered: `SOUL.md identity` → `tool guidance` → `Honcho block` → `system_message` → `MEMORY.md snapshot` → `USER.md snapshot` → **`## Skills (mandatory)` block** → `Project Context` → `timestamp/session` → `Platform hint`. [Source: website/docs/developer-guide/prompt-assembly.md §Cached system prompt layers + Concrete example]

**What it renders** (each run, per profile × platform):

```markdown
## Skills (mandatory)
Before replying, scan the skills below. If a skill matches or is even partially
relevant to your task, you MUST load it with skill_view(name) and follow its
instructions. Skills contain specialized knowledge — API endpoints, tool-specific
commands, and proven workflows that outperform general-purpose approaches. Load
the skill even if you think you could handle the task with basic tools like
web_search or terminal. Skills also encode the user's preferred approach,
conventions, and quality standards for tasks like code review, planning, and
testing — load them even for tasks you already know how to do, because the
skill defines how it should be done here.
Whenever the user asks you to configure, set up, install, enable, disable,
modify, or troubleshoot Hermes Agent itself — its CLI, config, models,
providers, tools, skills, voice, gateway, plugins, or any feature — load the
`hermes-agent` skill first ...
...
Skill Safety Rule ...
...
<available_skills>
  software-development:
    - skill-a: Short trigger description (≤57 visible)
    - skill-b: ...
  research:
    - arxiv: Search arXiv ... [Source: prompt truncation note]
  ...
</available_skills>
Only proceed without loading a skill if genuinely none are relevant.
```

The exact wrapper prefix is assembled in `prompt_builder.py::_build_skills_system_prompt_inner` at lines ~2087-2111 and includes also "WAIT/DEDUP" handling for `[SKILL_PRUNED]` compression. [Source: agent/prompt_builder.py `managed` + `SKILL_PRUNED` handling]

Inside `<available_skills>`, each category sorted, deduplicated, `description` truncated to prompt-safe limit (`skill_description_truncated_for_prompt` → 57 + `…`). Name stays full. [Source: agent/skill_utils.py `extract_skill_description` · tools/skill_manager_tool.py `SKILL_PROMPT_DESC_LIMIT`]

### 4.2 How routing chooses — heuristics in code + prompt

**A. Deterministic filtering before LLM sees list**

- Platform incompatibility pruned via `skill_matches_platform` (e.g. `apple/*` hidden on Linux). [Source: agent/prompt_builder.py `_parse_skill_file` early return `is_compatible` => skip]
- Environment relevance: `skill_matches_environment` — e.g. `environments: [kanban]` hidden when no `HERMES_KANBAN_TASK` / board nor kanban toolset active. [Source: agent/skill_utils.py §_detect_environment for kanban/docker/s6]
- Disabled skills filtered via `get_disabled_skill_names` (global ∪ platform). [Source: prompt_builder.py `disabled = get_disabled_skill_names(...)`]
- Category postures demote: e.g. pairing with coding posture hides non-coding descriptions but keeps names visible and loadable via `skill_view`. [Source: prompt_builder.py §Posture-driven category demotion comment]
- Org collision double-flagged (both entries flagged collision, `skill_view` refuses ambiguous bare). [Source: prompt_builder.py org collision comment]

Nothing ever hidden without recovery: "every skill name stays visible and loadable via `skill_view`/`skills_list`". [Source: prompt_builder.py comment]

**B. LLM mandatory scan (soft-routing)**

No classifier scores per tool. The model is instruction-forced to read `<available_skills>` each turn and compare user's intent vs each description:

- Rule: *"If a skill matches or is even partially relevant ... you MUST load it"* — low threshold = prefer load. [Source: prompt preamble in task (the subagent prompt literally lists that paragraph) + prompt_builder wrapper]
- Rule: *"Load the skill even if you think you could handle with basic tools"* — anti-generalist bias; skill workflow always preferred as battletested. [Source: same]
- Rule: *"Skills also encode user's preferred approach ... load even for tasks you already know how to do"* — convention alignment. [Source: same]
- Special anchor: Hermes self-help always `hermes-agent`. [Source: prompt_builder "Whenever user asks to configure Hermes ... load hermes-agent first"]

**C. Explicit preload escapes (no inference)**

```bash
hermes --skills github-pr-workflow,youtube-content "do X"
# or repeated -s
hermes -s tabtangle -s randevona "fix tabs"
# config knob `skills.enabled`? Also `hermes skills config` enable/disable per platform
```

These inject via `agent_init` / CLI parser and bypass environment gating (explicit consent). [Source: `hermes --help` `--skills SKILLS` + agent/skill_utils.py `skill_matches_environment` doc "Explicit loads bypass"]

**D. Slash as alias for same**

In CLI, `/skills` shows management UI; skill names aren't slash commands themselves. But plugin-provided `quick_commands` and skill-derived commands via `scan_skill_commands()` / `get_skill_commands()` become slash completions (`complete.slash`) and catalog entries. The desktop curated filter `isDesktopSlashExtensionCommand` proves skill slash flow. [Source: AGENTS.md §Desktop Chat App slash pipeline · website/docs/developer-guide/prompt-assembly.md §Skills index]

### 4.3 Execution after selection — follow-through contract

Once loaded:

- **Workflow skills:** e.g. `github-issue-to-pr` — the subagent is told *"Carry a GitHub issue to a verified PR with honest CI state"*. The skill body is a checklist; the model must follow steps, call tools, then verify with tool output (never just describe). [Source: skills/github/github-issue-to-pr frontmatter]
- **Hub-installable skills:** e.g. `hermes-agent` skill's Routing Table: "User wants CLI flags → load `references/cli-reference.md`" — hub doc load is progressive: SKILL.md body points to `references/*.md` loaded via `skill_view(name, file_path=...)`. [Source: /root/.hermes/skills/autonomous-ai-agents/hermes-agent/SKILL.md §Routing Table · other skills similar tables]
- **Finishing discipline:** Subagent prompt global rule *"Finishing the job: deliver working artifact backed by real tool output — not description. NEVER fabricate."* + report blockers honestly. This ensures skill steps produce verifiable outputs. [Source: task delegation preamble — this very task's parent prompt]

**Correction lifecycle:** If skill outdated/incomplete/wrong, patch immediately `skill_manage(action='patch')` without being asked. After difficult iteration, offer `skill_manage(action='create')`. [Source: prompt_builder `When using a skill and finding it outdated... patch it immediately` · same for `After difficult/iterative tasks, offer to save as skill`]

### 4.4 What defeats / degrades routing

From `agent/skill_utils.py`, `tools/skills_tool.py`, and observed usage sidecar:

- **Stale snapshot cache** — manifest validation catches `SKILL.md` file add/remove but TL:DR: edits bump only file mtime invisible to dir signature; bounded by 30s TTL. Fresh sessions pick up immediately. [Source: tools/skills_tool.py `_SKILLS_CACHE_TTL_SECONDS`]
- **Disabled / quarantine** — expected hiding.
- **BOM / malformed YAML** — frontmatter silently dropped, skill still lists but description missing / platform gating vanishes. (Windows Notepad). [Source: agent/skill_utils.py `if content.startswith("\ufeff")`]
- **Prompt compression** — early skills beyond context window show as `[SKILL_PRUNED]` placeholder; agent must reload via `skill_view`. [Source: prompt_builder `SKILL_PRUNED` · DEDUP handling]
- **Over-eager generalist** — model skips load. Mitigated by the M*A*S*H forcing language ("you MUST load").
- **Bulk skills (183 enabled on tested host)** — `available_skills` still compact: category → `name: description` lines only; not full bodies. Token cost stays O(skills), not O(skill chars). Builds report: 183 skills listed, not loaded. [Source: `hermes skills list` 183 enabled snapshot 2026-08-31]

### 4.5 Telemetry & background nudges

- Sidecar `~/.hermes/skills/.usage.json` tracks per-skill `use_count`, `view_count`, `patch_count`, `last_activity_at`, `state`, `pinned`, `created_by`. Updated on `skill_view` (`bump_view`) and `skill_manage` (`bump_patch`, `record_created`). [Source: tools/skill_usage.py · .usage.json sample showing `auto-continue: use_count 2, view_count 2` etc.]
- Curator periodic pass: marks stale, archives, proposes consolidations, keeps tar.gz backup; runs deterministic sweep for free, optional aux-model consolidation (`curator.consolidate: false` by default). [Source: agent/curator.py · `hermes curator` verbs]
- Learning graph: skills + memories timeline `hermes journey` — change-of-knowledge graph. [Source: `hermes --help` `journey (learning, memory-graph)`]

---

## 5. Tool System & MCP

### 5.1 Tool system fundamentals

**Registry:** `tools/registry.py` — import-time registration:

```python
# any tools/*.py with top-level registry.register() auto-discovered
from tools.registry import registry
def check_requirements(): return bool(os.getenv("X"))
def my_tool(arg: str, task_id=None): return json.dumps({"success": True})

registry.register(
  name="my_tool", toolset="my_toolset",
  schema={"name":"my_tool","description":"...","parameters":{...}},
  handler=lambda args,**kw: my_tool(args["arg"], task_id=kw.get("task_id")),
  check_fn=check_requirements, requires_env=["X"]
)
```

All handlers return JSON strings. `check_fn` gates availability; tool appears only when requirements met. [Source: AGENTS.md §Adding a Tool · website/docs/developer-guide/adding-tools.md]

**Discovery vs exposure:** Auto-discovery imports every `tools/*.py`. Exposure requires name in a toolset. `_HERMES_CORE_TOOLS` is the default bundle every platform inherits. [Source: toolsets.py `_HERMES_CORE_TOOLS` list · AGENTS.md warning "This step is required: auto-discovery imports but only exposed if in toolset"]

**Toolsets (grouping):**

```python
TOOLSETS = {
  "web": {"tools": ["web_search","web_extract"]},
  "terminal": {"tools": ["terminal","process"]},
  "file": {"tools": ["read_file","write_file","patch","search_files"]},
  "skills": {"tools": ["skills_list","skill_view","skill_manage"]},
  "browser": {...}, "cronjob": {"tools":["cronjob"]}, "memory":..., "delegation":..., "kanban":...
}
_HERMES_CORE_TOOLS = [  # every platform inherits unless explicitly customized
  "web_search","web_extract","terminal","process",
  "read_file","write_file","patch","search_files",
  "vision_analyze","image_generate",
  "skills_list","skill_view","skill_manage",
  ...,"browser_*","text_to_speech","todo","memory","session_search","clarify","execute_code","delegate_task","cronjob",
  "kanban_*","computer_use"
]
```

There are ~30 toolsets; `hermes tools` interactive toggles per-platform. Changes take effect on `/reset` (new session) to preserve caching. [Source: toolsets.py · website/docs/developer-guide/adding-tools.md · AGENTS.md §Adding New Tools]

**Execution dispatch:** `model_tools.py::handle_function_call()` wraps `registry` dispatch, error handling, credential redaction, budget spillover, sampling gate, etc. Agent loop calls it per tool_call, appending result as `role:tool` message. [Source: run_agent.py · model_tools.py]

**Plugin vs core route:**

- **Core:** `tools/*.py` shipped in repo (narrow waist).
- **Plugin:** `~/.hermes/plugins/<name>/plugin.yaml` (`ctx.register_tool(...)`); discovered without editing core, enable/disable via `plugins.enabled`. [Source: AGENTS.md §Plugins · website/docs/developer-guide/plugins/index.md]

### 5.2 MCP (Model Context Protocol) — native client

**Module:** `tools/mcp_tool.py` (~2k LOC) — docs shortcut in `skills/autonomous-ai-agents/hermes-agent/references/native-mcp.md`. [Source: tools/mcp_tool.py header doc · native-mcp.md]

**Goal:** Connect to **external MCP servers** (stdio, HTTP/StreamableHTTP, SSE) at startup, discover their tools, and register them as **first-class tools** the LLM can call directly — no bridge CLI.

**Config — `~/.hermes/config.yaml` `mcp_servers`:**

```yaml
# stdio (command)
mcp_servers:
  filesystem:
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    env: { GITHUB_TOKEN: "ghp_..." }  # only this escapes filtered env
    timeout: 120
    connect_timeout: 60

# HTTP/SSE (url)
  remote_api:
    url: "https://mcp.example.com/mcp"
    headers: { Authorization: "Bearer sk-..." }
    # transport: sse   # for SSE protocol instead of Streamable HTTP
```

Requires optional pip dep `mcp` (`pip install mcp`), else silently disabled (light probe via `importlib.util.find_spec("mcp")` ~1-2ms, import lazy ~260ms). [Source: tools/mcp_tool.py §Graceful import · lazy SDK loader `__getattr__` for StdioServerParameters etc.]

**Naming:** `mcp_{server}_{tool}` where hyphens/dots → underscores (LLM-safe). E.g. `filesystem/read_file` → `mcp_filesystem_read_file`. [Source: tools/mcp_tool.py Tool Naming Convention · native-mcp.md]

**Lifecycle**

1. `discover_mcp_tools()` at agent startup (triggered from `model_tools.py`/`agent_init.py`) reads `mcp_servers`.
2. Per server: spawns dedicated background event loop `_mcp_loop` in daemon thread; long-lived asyncio Task keeps transport alive; calls `list_tools()`; registers each in Hermes registry.
3. **Auto-injected** into all `hermes-*` platform toolsets (CLI/Discord/Telegram/etc.) — available every turn without extra config. `mcp_dashboard_oauth` gating also.
4. Reconnect with exponential backoff (1s/2s/4s/8s/16s, capped 60s, up to 5 retries). Idempotent; failed servers retry on next `discover_mcp_tools()` call.
5. On shutdown, tasks signal exit in same Task that opened `async with` (anyio requirement).

**Transports**

- **stdio**: subprocess stdin/stdout, stderr redirected to `~/.hermes/logs/mcp-stderr.log` per-server tagged header via `_get_mcp_stderr_log()` (protects TUI rendering). Filtered env only: `PATH,HOME,USER,LANG,LC_ALL,TERM,SHELL,TMPDIR,XDG_*` plus explicit `env:` config. Prevents credential leakage. [Source: tools/mcp_tool.py §Environment Variable Filtering]
- **HTTP** (`mcp.client.streamable_http`) — with `headers`, `identity_header` (static vs profile-aware `X-User-Id`), `skip_preflight`.
- **SSE** (`mcp.client.sse`) — `transport: sse` flag.

**Security**

- Env var filtering above.
- `tools/mcp_tool.py::tool_error` redacts credential-like patterns from error messages before reaching LLM: `ghp_*`, `sk-*`, `Bearer`, `token=`, `key=`, `API_KEY`, `password`, `secret`. [Source: tools/mcp_tool.py §Security: Credential Stripping]
- `setup_mcp` tool proposes MCP as consent card (install/enable/authorize) — blocked until user acts; never called twice after decline; catalog names via `hermes mcp catalog`. [Source: task preamble catalogue of available tools: `setup_mcp` tool]

**Payload bounds**

- First defense `_MCP_HARD_RESULT_CAP_CHARS = 2_000_000` head 40% / tail 60% split with omission notice, before budget/spillover layer (50K) spilling to disk intact. Caps pathological multi-MB floods, ordinary large results still spilled full. [Source: tools/mcp_tool.py `_MCP_HARD_RESULT_CAP_CHARS` comment referencing #56060 etc.]
- OSV malware preflight bounded `_OSV_MALWARE_CHECK_TIMEOUT_S = 12.0` off-loop so SSL handshake stall doesn't freeze asyncio (issue #29184). [Source: tools/mcp_tool.py that constant]

**Sampling (server-initiated LLM)**

Hermes supports `sampling/createMessage` — MCP server can request LLM completion through agent. Default enabled, per-server config:

```yaml
mcp_servers:
  my_server:
    sampling: { enabled: true, model: "gemini-3-flash", max_tokens_cap: 4096, timeout: 30, max_rpm: 10, allowed_models: [], max_tool_rounds: 5, log_level: "info" }
```

`max_tool_rounds` prevents infinite tool loops; per-server audit metrics via `get_mcp_status()`. Disable with `sampling: {enabled:false}` for untrusted. [Source: native-mcp.md §Sampling · tools/mcp_tool.py sampling doc]

**CLI**

```bash
hermes mcp add NAME (--url | --command ...) # add stdio or http
hermes mcp list | test NAME | catalog | install NAME | configure NAME | remove NAME
hermes mcp serve   # run Hermes itself as MCP server
```

[Source: `hermes mcp --help` via `hermes_cli/commands.py` + native-mcp.md]

**Hermes vs MCP skill dichotomy**

- **Native MCP client** — for always-on servers configured in `config.yaml` before agent starts; tools globally visible.
- **`mcporter` skill** — ad-hoc one-off MCP calls without persistent config (mentioned in native-mcp.md as alternative). [Source: native-mcp.md opening "For ad-hoc ... see the `mcporter` skill"]

---

## 6. Cron / Loop / Harness vs Hermes-Agent — Differences

Hermes runs **four durable/background companions** alongside the conversation loop. Confusing them loses data. Reference: `skills/autonomous-ai-agents/hermes-agent/references/background-systems.md`.

| System | File | Scope | Durability | What it schedules | How to invoke | Must outlive process? |
|--------|------|-------|------------|-------------------|---------------|-----------------------|
| **Cron (scheduler)** | `cron/jobs.py` + `cron/scheduler.py` | One profile's `~/.hermes/cron/jobs.json` | **Durable** (SQLite/JSON + output `cron/output/{id}/{ts}.md`, `.tick.lock`, `ticker_heartbeat`) | `duration` ("30m","2h"), "every ..." phrase, 5-field cron (`0 9 * * *`), ISO timestamp; per-job `skills`, `model`/`provider`, `script` (`no_agent` script-only), `context_from`, `workdir`, multi-platform delivery | Tool `cronjob`, CLI `hermes cron list/add/edit/pause/resume/run/remove`, slash `/cron`, gateway creation | **Yes** — ticker thread/process survives; 3-min hard interrupt per run; skip_memory by default |
| **Delegation** | `tools/delegate_tool.py` + `agent/delegation_context.py` | Single parent turn, parallel children | **Not durable** — process-local; parent exit kills children | Parallel subagents with isolated context + terminal | `delegate_task(goal,context)` single; `delegate_task(tasks=[...])` batch capped `delegation.max_concurrent_children` (default 3, floor 1, warns >10 linearly); `background=true` hands re-entry; roles `leaf` vs `orchestrator` bounded by `max_spawn_depth` | **No** — use `cronjob` or `terminal(background+notify)` for durable |
| **Curator** | `agent/curator.py` + `tools/skill_usage.py` + `.usage.json` | Signal: only `created_by:"agent"` (background fork) skills | Optional | Idle marking (`stale` after `stale_after_days`), `.archive` moves (`archive_after_days`), tar.gz backup, optional aux-model umbrella consolidation (`curator.consolidate` off by default, zero-token deterministic sweep mandatory). Never deletes (max archive), pinned exempt, protected `"plan"` always exempt, suppressed `_org` prevents reseeding | `hermes curator status/run/pause/resume/pin/unpin/archive/restore/list-archived/prune/backup/rollback` + slash `/curator` | No (periodic) |
| **Kanban** | hermes_cli/kanban*.py + `tools/kanban_tools.py` | Per board SQLite (hard isolation), tenant = soft namespace | **Durable** | Tasks (`create`,`assign`,`link`,`complete`,`block`,`unblock`,`archive`), dispatcher inside gateway (`kanban.dispatch_in_gateway: true`) promotes/claims/spawns profile workers, auto-blocks after `failure_limit` (default 2) | `hermes kanban <verb>`; workers gated to `HERMES_KANBAN_TASK` see `kanban_*` tools | **Yes** — board as boundary |
| **Loop-Engineering** (+ Harness + Auto-Continue) | Skills `loop-engineering` + `hermes-harness` + `auto-continue` (user-owned, not core daemon) | `.hermes/loops/<id>/` per loop | **File-durable** (ledger.md + state.json + invariants.md) but execution ephemeral per delegate/cron | Principle *"No measurement = no loop"*; provides 4 harness artefacts: Ledger, Evaluator (separate delegate), Invariants, Stop condition. `hermes-harness/scripts/scaffold-loop.sh` creates those; `loop-engineering/references/*` + `hermes-harness/references/harness-patterns.md` guide evaluator split + stop. `auto-continue` watchdog (`check-and-continue.sh`) detects missing `— Güven: %X · <seviye>` footer and auto re-fires job (max_continues, cooldown_growth linear). Scaffolding + watchdog-setup.md manual 3 steps | `bash ~/.hermes/skills/hermes-harness/scripts/scaffold-loop.sh <id> --target 80 --iters 20` + `hermes cron create --schedule "every 10m" --prompt "Watchdog: ...check-and-continue.sh"` + `delegate_task` child must emit footer | Loop execution itself not durable; persistence is via ledger + cron re-fire |
| **Hermes-Agent core** | `run_agent.py` + `agent/` + `model_tools.py` | One profile's conversation + sessions/state.db | **Durable sessions** (SQLite + JSONL transcripts, checkpoints `hermes checkpoints`) but loop must be built externally | Not a scheduler — the LLM reasoning engine driven by system prompt and tool_calls. Called from CLI, TUI backend, gateway per message, ACP, proxy, batch runner. Handles skill index, memory injection, compaction, delegation spawning | `hermes` chat, `-q`, `--resume`, `-w` worktree, `hermes chat -q '...'`, `terminal(hermes chat ...)` spawning, `/model` etc. | Controlled externally (cron/kanban/delegate spawn it) |

### 6.1 Why loop-* skills exist when Hermes already loops

Hermes's own loop repeats because **model does not persist across turns** — each turn is a new life; context must be carried externally distilled. Raw `while true` with no extern metric degenerates to *"same bug fixed 3× claiming done"*. Loop-engineering enforces:

- **Measurement before iteration** — numeric `score/latency/pass_rate` outside model (`"Sef tabaga bakmiyorsa ..."`.
- **Evaluator ≠ producer** — separate provider/task produces independent measurement (evaluator split, same as harness's second `delegate_task` or different `provider`).
- **Ledger distilled 3-4 lines/iter** — not raw history (token economy: 80% control+research, 10-15% write).
- **Invariants frozen** — commit format, test must-pass, files not to touch.
- **Stop condition** — `max_iters/hours/token/score≥target`.
- **Ledger transport** — next iteration's prompt receives previous distilled note, not full history.

This is **orchestration discipline**, not infrastructure — complements, doesn't replace cron/delegate.

[Hermes-harness vs Loop-engineering distinction]: `hermes-harness` is concretescaffolder (scripts `scaffold-loop.sh`, `create-tester-cron.sh`, ledger/state/invariants/watchdog); `loop-engineering` is class-level orchestration taxonomy (loop vs graph vs tournament vs queue decision tree). They are companion skills (see loop-engineering's Related, and hermes-harness `related_skills: [loop-engineering]`). [Source: /root/.hermes/skills/loop-engineering/SKILL.md · /root/.hermes/skills/hermes-harness/SKILL.md · ~/.hermes/skills/hermes-harness/references/harness-patterns.md · auto-continue/SKILL.md]

### 6.2 Cron invariants (that differ from harness loops)

Hermes cron build includes:

- Per-job `skills` override (pin skill list for that fire)
- `workdir` scoping (project `AGENTS.md` picked up)
- `script` pre-run data collection (even `no_agent=True` whole job is script)
- `context_from` chaining (output of A fed into B)
- Framed delivery header/footer (not mirroring into target gateway session, preserving role alternation)
- `.tick.lock` cross-process; `TICKER_INTERVAL_SECONDS = 60` shared heartbeat between ticker and `hermes cron status` alarm.
- Forced `skip_memory=True` for cron sessions.

None of these belong to `hermes-harness` loops; harness manually composes with `delegate_task` batch + `todo` + `execute_code` RPC, while cron uses scheduler's own `jobs.py` store.

[Source: skills/autonomous-ai-agents/hermes-agent/references/background-systems.md §§Cron,Cron invariants · cron/jobs.py `TICKER_INTERVAL_SECONDS`, `use_cron_store` · hermes_cli/cron.py]

### 6.3 Summary of responsibilities

| Concern | Who |
|---------|-----|
| Long-lived scheduled work that must survive restarts → | **Cron** |
| Parallel exploration inside one turn → | **Delegation** |
| Housekeeping of procedural memory (stale/archive/merge) → | **Curator** |
| Multi-profile work queue with human-in-loop → | **Kanban** |
| Iterative autonomous refinement to a metric target → | **Loop harness + auto-continue** |
| Reasoning, tool dispatch, memory, compaction, prompt assembly → | **Hermes-Agent core** |

---

## 7. How Lokma Can Adapt Auto-Skill-Discovery

### 7.1 Lokma baseline (from Docs/)

Lokma (`/mnt/apopic/lokma`) is described as **"innovative agentic coding harness (CLI + Web) — multi-provider, themeable, open-source"` — architecture: monorepo `packages/lokma-core` (agent loop) + `lokma-ai` (multi-provider) + `lokma-shared` (Zod schemas, WS protocol) + `lokma-web` (`web/` + `server/` Fastify + WS) + `lokma-tui` (Ink). Planned stacks: Next.js+Fastify+flexlayout (slot A recommended) vs alternatives; themes `themes/*.json` → CLI (Chalk) + Web (CSS vars); features speced in `Docs/20-*`..`25-*` (plugin Cordis-inspired kernel ~300 lines, pane system, provider/model/session/usage, MCP, hooks, etc.). Status 2026-08-31: Docs web harness set 6 English docs + raw 195KB, stack pick blocks Phase 0. [Source: /mnt/apopic/lokma/README.md · /mnt/apopic/lokma/Docs/00-LOKMA-KONTEKST.md · /mnt/apopic/lokma/Docs/02-TEKNIK-KARARLAR.md · 20-WEB-HARNESS-overview.md · 23-PLUGIN-SYSTEM-deepseek-cordis.md · 24-WEB-PANE-SYSTEM-and-orchestration.md]

Lokma explicitly wants **best harness × best model** and "everything-is-a-plugin" Cordis semantics (service keys, `inject`, `waterfall` events), shared core between CLI+Web.

### 7.2 Hermes pattern, Lokma-mapped

| Hermes pattern | Lokma equivalent proposal | Why it fits |
|----------------|---------------------------|-------------|
| `~/.hermes/skills/` single source, `get_hermes_home()` profile-aware | `~/.lokma/skills/` + `.lokma/skills/` project-local + `LOKMA_HOME` env fallback | Lokma plans `lokma doctor` / `lokma theme set` CLI; need per-profile and per-repo skills; existing Lokma Docs already mandate `Docs/` single-source doc pin, so `skills/` parallels that |
| Frontmatter `---` YAML mapping `name,description,...` with hard validator | Reuse `SKILL.md` exactly (agentskills.io compatibility) so `hermes→lokma` or `agentskills→lokma` port is copy-paste; add Lokma-only fields under `metadata.lokma` (e.g. `web_components`, `theme_tokens`) instead of new file type | Keeps hub interop (90k+ skills discovered 2026-08-31) and lets Lokma browse `skills.sh` directly |
| `SKILL_PROMPT_DESC_LIMIT` 57-char trigger + `"Use when ..."` rule | Same 60-char description hardline + lint (`lokma skill lint`) | Already specced lightweight skill authoring with enforceable tests (`tests/skills/test_<skill>_skill.py`), see Hermes authoring skill tests/docs regen steps |
| Platform/environment gating (`platforms, environments`) | Reuse `platforms: [linux,macos,windows,web]` (add `web`), `environments: [kanban,docker,web]` (add `web`) where `web` means web harness renderer present; evaluate via `LOKMA_SURFACE=cli|web|gateway` env check analogous to `_detect_environment` | Lokma has dual-surface problem (CLI+Web share core, some skills need renderer like `read_terminal`); `environments: [web]` achieves "*only show when web pane available*" reversible via explicit preload |
| Disabled / quarantine / excluded / support-path pruning | Keep all 4 gates; add `lokma skills config` per-platform disabled (route `web` distinct from `cli`) — already in Lokma `22-WEB-FEATURES-provider-model-session.md` model for per-platform skills split | Allows user to keep `git-pr-ops` on CLI but off on gateway, etc. |
| Prompt builder `build_skills_system_prompt()` stable tier index `<available_skills>` | Build same in `lokma-core/prompt_builder.ts` (or `.py`): scan `~/.lokma/skills` + `skills.external_dirs` (extra dirs from `lokma config`) + `.lokma/skills` project dirs; emit `<available_skills>` same wrapping ("Before replying, scan ... you MUST load ... even if you think you can do with basic tools") preserved verbatim for tone alignment | That mandatory-scan paragraph IS the routing policy — it's human-auditable prompt-engineering, requires zero vector DB, preserves caching (stable prefix) |
| Three tiers `skills_list → skill_view → skill_view(file_path)` | Port trio 1:1 to `lokma` tool names: `skills_list`, `skill_view`, `skill_manage` — include identical `linked_files` {references,templates,assets,scripts} structure so helpers like `templates/plugin.js`, `references/cli-reference.md` port | Lokma spec `22-WEB-FEATURES` already calls out `skills` as top-level provider; this gives exact contract for `lokma-ai` adapters to expose |
| Snapshot cache `.skills_prompt_snapshot.json` + provider-aware LRU | Port both with adjustment: key on `(skills_dir, platform, enabled_toolsets, lokma_surface)` + snapshot invalidates on `skills/.usage.json` write + `skill_manage` success always clears snapshot (`clear_skills_system_prompt_cache(clear_snapshot=True)`) — identical in Lokma | Keeps per-turn cost constant regardless of skills count (183 on host cost: a few hundred tokens index) |
| Curator (`created_by:"agent"` staleness, `.archive`, pinned) | Reuse verbatim but rename config `curator.*` → `lokma.curator.*`; ported protected builtin list should be `{plan,theme}` replacing `{"plan"}` (plan slash must never archive). Optional aux-model consolidation remains opt-in `consolidate:false` default (cost control already flagged in Hermes billing docs) | Saves user from skill forest without surprise deletions; recovery via `.archive` vital for "ballandır" iterative harness where agents will create many skills |
| Hub browsing 90k+ (`hermes skills browse/search/inspect/install/tap`) | Implement `lokma skills` subcommands mirror: `browses/search/inspect/list/check/update/audit/uninstall/snapshot/tap/config` plus `lokma skills trust/untrust` for `./.lokma/skills` project trust (copied from Hermes `hermes skills trust`). Hub source still `skills.sh` (skills-hub client reusable — file `tools/skills_hub.py` has HTTP+ETag caching) | Reuse `agentskills.io` registry — no new marketplace needed on day 1; `tap` lets teams host private Lokma-dist registries via GitHub repo as source |
| Explicit preload `--skills` / `-s` per run | Add `lokma --skills code-review,security-audit "review PR #12"` (and `lokma chat -s plugin-system` ) plus per-job `--skills` on `lokma cron`/`lokma task` — same bypass for environment gate | Dispatcher-pinned specialist skill is a documented use case ("load-bearing force-loads e.g. dispatcher pinning a task to a specialist skill via --skills must always succeed" in skill_utils comment) |
| Tool ↔ skill separation (tool narrow waist, skill workflow) | Honor same waist: keep `lokma-core` toolset small (`read_file,write_file,patch,terminal,hermes_skills`) — expand skills `hermes-as-engine`, `hermes-as-service` DSL for app-based plugins via `ctx.register_tool`, not core tools | Matches Lokma philosophy "Plugin system: everything-is-a-plugin" (`23-PLUGIN-SYSTEM-deepseek-cordis.md`) — skills become the plugin's docs, tools the plugin's runtime |
| MCP native client (mcp_tool.py) auto-registers `mcp_*` tools global | Port 1:1: config `mcp_servers` in `~/.lokma/config.yaml`, background event loop per server, `mcp_{server}_{tool}` naming, same security filtering & hard caps; gate `text_to_speech` / `browser` style. Consider `lokma mcp catalog` catalog file reuse from Hermes `mcp_catalog.py` (mcp-registry + spec scanning) | SDL: `Lokma MCP (4 transports, dynamic tools)` already specced in `25-WEB-ROADMAP.md` Phase 2; Hermes design gives battle-tested implementation including `streamable_http` fallback fix (finding re '$MCP_NEW_HTTP` gating bug) and daemon cleanup |

### 7.3 Implementation sketch — what to ship in Lokma Phase 0-2

**Phase 0 (monorepo scaffold)** — minimal files to make routing compile and test green:

```
packages/lokma-core/
  skill/
    constants.ts            # HERMES_HOME→LOKMA_HOME, SKILLS_DIR, SKILL_SUPPORT_DIRS, EXCLUDED_*, SKILL_PROMPT_DESC_LIMIT=60
    skill_utils.ts          # parseFrontmatter (BOM strip, yaml load), skillMatchesPlatform, skillMatchesEnvironment, getAllSkillsDirs, getDisabledSkillNames, iterSkillIndexFiles, isSkillSupportPath, BOM/UTF8-sig, platformMap
    prompt_builder.ts       # buildSkillsSystemPrompt() → <available_skills> block; _buildSkillsManifest, _load/_writeSnapshot, caching LRU + snapshot
    skill_commands.ts       # scanSkillCommands() for slash completion (complete.slash catalog)
  skill_store.ts            # read/write sidecar .usage.json w/ file locking (fcntl/msvcrt-js) + state ACTIVE/STALE/ARCHIVED/PINNED
  prompt/
    assembly.ts             # stable/context/volatile join — skills index in stable tier
packages/lokma-cli/
  commands/skills.ts        # browse/search/inspect/list/check/update/audit/uninstall/trust/untrust/browse/tap/config (wrap skills_hub client)
toolset.ts                  # TOOLSETS definition + _LOKMA_CORE_TOOLS (include skills_list/skill_view/skill_manage + mcp_* injection hook)

Docs/30-SKILL-SYSTEM-lokma-adaption.md  # this spec's Loki-local copy (portable knowledge)
Docs/raw/31-hermes-agent-skills-raw.md  # (this file's eventual mirrored location — already /tmp)
```

**Phase 1 (core loop in browser)** — wiring so `lokma-ai` sees skills:

- `lokma-core` `AIAgent`-equivalent (`runLoop()`) calls `prompt_builder.buildSkillsSystemPrompt()` at session start and on compression rebuild.
- Tool registry exposes `skills_list`, `skill_view` to LLM; system prompt already instructed mandatory scan.
- Wire hub client `skills_hub` (search/browse against `skills.sh`) as background fetch for `lokma skills` CLI — but **not** for loop; loop routing is purely prompt-index based (no retrieval API latency).
- Smoke test: `lokma --skills dummy "use dummy"` forces inject even when env gate would hide it.

**Phase 2 (parity)** — `skill_manage`, curator, bundles, sync, MCP:

- Port `skill_manager_tool.ts` validation + guards (`guard_agent_created`, `pinned_guard`, `background_review_write_guard`, `curator_consolidation_delete_guard`, `pathSecurity hasTraversal/validateWithinDir`, caps 100k + 1MiB, atomicWrite, security scan hook via `skillsGuard.scanSkill`, audit ledger `skill_ledger.recordMutation`, `clearSkillsCache`, telemetry `bump_patch/record_created`, debounced `maybePushSkills`).
- `lokma curator` daemon period (30s TTL + hourly sweep) + `lokma bundles` alias.
- MCP native client: lazy import of JS `mcp` SDK (`@modelcontextprotocol/sdk`), filtered env stdin, error redaction, `MCP_HARD_RESULT_CAP_CHARS = 2_000_000`, `keepalive_interval` and sampling gates.
- Web dashboard `lokma dashboard serve` embeds shared Ink-like TUI panel but skill panel surfaces live: `lokma skills` + MCP catalog UI (reuse `native-mcp.md` reference UI by porting).
- Pane system consideration: if a skill ships `templates/pane.tsx` style artifact, `skill_view(file_path)` for assets lets web preview render it via `open_preview` tool (already in Lokma pane spec flexlayout + Monaco).

### 7.4 Paste-ready code refs for Lokma engineers

**a. Frontmatter parser — UTF-8 BOM + fallback** (mirror `agent/skill_utils.py::parse_frontmatter`):

```ts
export function parseFrontmatter(content: string): [Record<string, any>, string] {
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1) // BOM
  let frontmatter: Record<string, any> = {}, body = content
  if (!content.startsWith("---")) return [frontmatter, body]
  const end = content.slice(3).search(/\n---\s*\n/)
  if (end === -1) return [frontmatter, body]
  const yamlContent = content.slice(3, end + 3)
  body = content.slice(end + 3 + 5) // past "\n---\n"
  try { frontmatter = yamlLoad(yamlContent) ?? {} } catch {
    // fallback key:value
    for (const line of yamlContent.trim().split("\n")) {
      const i = line.indexOf(":"); if (i === -1) continue
      frontmatter[line.slice(0,i).trim()] = line.slice(i+1).trim()
    }
  }
  if (typeof frontmatter !== "object" || Array.isArray(frontmatter)) frontmatter = {}
  return [frontmatter, body]
}
```

**b. Platform/environment gating** (mirror `skillMatches*`):

```ts
const PLATFORM_MAP = { macos: "darwin", linux: "linux", windows: "win32", web: "web" } as const
export function skillMatchesPlatform(fm: any, current: string) {
  const plats = fm.platforms; if (!plats?.length) return true
  const list = Array.isArray(plats) ? plats : [plats]
  return list.some((p:string) => current.startsWith(PLATFORM_MAP[p.toLowerCase()] ?? p.toLowerCase()))
}
const KNOWN_ENVS = new Set(["kanban","docker","s6","web"])
export function skillMatchesEnvironment(fm: any, active: Record<string,boolean>) {
  const envs = fm.environments; if (!envs?.length) return true
  const list = Array.isArray(envs) ? envs : [envs]
  for (const raw of list) {
    const e = String(raw).toLowerCase().trim()
    if (!KNOWN_ENVS.has(e)) return true // unknown tag => fail open
    if (active[e]) return true // OR semantics like platforms
  }
  return false // none active => hidden
}
// Offer-time only: explicit skill_view/--skills load bypasses this gate.
```

**c. Support-dir prune (so references/ templates/ not scanned as skills)**

```ts
const SKILL_SUPPORT_DIRS = new Set(["references","templates","assets","scripts"]) as const
function isSkillSupportPath(p: string, root: string) {
  const parts = p.split("/"); // assume POSIX normalized
  for (let i=1;i<parts.length-1;i++) {
    if (!SKILL_SUPPORT_DIRS.has(parts[i] as any)) continue
    const skillRoot = parts.slice(0,i).join("/")
    if (fs.existsSync(path.join(root, skillRoot, "SKILL.md"))) return true
  }
  return false
}
```

**d. Mandatory system prompt block (verbatim reuse — localization note)**

Keep English for harness reasons (model training corpus), but Lokma's project instruction may stay Turkish — the skill index itself is in English (harness language). If Lokma ships Turkish skill names, keep descriptions bilingual prefix: first clause triggers English-trained router.

**e. `skills_list`/`skill_view` tool schemas for lokma-ai OpenAI adapter**

```json
{"name":"skills_list","description":"List skills with metadata (progressive disclosure tier 1).","parameters":{"type":"object","properties":{}}}
{"name":"skill_view","description":"Load a skill's full SKILL.md — tier 2 — or a linked file via file_path — tier 3. Always call skills_list first if you don't know the skill name.","parameters":{"type":"object","properties":{"name":{"type":"string","description":"Skill name or category/name path"},"file_path":{"type":"string","description":"Linked file e.g. references/api.md"}},"required":["name"]}}
{"name":"skill_manage","description":"Create, update, or delete skills — procedural memory. See SKILL.md frontmatter and body structure. Use patch with old_string/new_string for surgical fix.","parameters":{"type":"object","properties":{"action":{"enum":["create","patch","delete","write_file","remove_file"]},"name":{"type":"string"},"content":{"type":"string"},"category":{"type":"string"},"file_path":{"type":"string"},"file_content":{"type":"string"},"old_string":{"type":"string"},"new_string":{"type":"string"},"replace_all":{"type":"boolean"}},"required":["action","name"]}}
```

### 7.5 Adaption risks & mitigations (in Hermes's own pitfall language)

| Pitfall | Hermes lesson | Lokma mitigation |
|---------|---------------|------------------|
| Infinite skill forest (agent creates skill each turn) | Curator `archive_after_days` + consolidation off by default + capacity; `plan` protected | Lokma: same + `lokma curator pin` for user-bloated skills; `create` confirms with user before write (schema prompt: *"Confirm with user before create/delete"*). Enforce approval gate `skills` similar to `write_approval.evaluateGate` |
| Prompt bloat (183 skills indexed) | Index is `name: desc` only; full bodies on demand; placement in stable tier cached | Posture-driven demotion (keep names, drop descs) when surface narrow; same in Lokma when web harness hides CLI skills (single-leg layout) |
| Cache poisoning / stale index | Snapshot + LRU invalidation on `skill_manage` + TTL 30s; `clear_skills_system_prompt_cache(clear_snapshot=True)` on success | Same + also clear on `plugins.enabled` toggle and `mcp_servers` change |
| `../` traversal / symlink rmtree escape | `path_security.validateWithinDir`, `hasTraversalComponent`, `_validateDeleteTarget` + `is_junction` gate; Kilo Code #11240 port | Copy `tools/path_security.py` → `packages/lokma-core/skill/path_security.ts` verbatim (POSIX + Win drive handling) |
| Prompt injection inside SKILL.md | `_INJECTION_PATTERNS` warning + quarantine for project skills | Add `skillsGuard.scanSkill` to `skill_view` load (warn tag + block `UNSUPPORTED` if quarantine) |
| Skill duplication forest competition | Extending beats sibling; forbids router/index hub skill (`No router / index / hub skills` rule) | Same in `Docs/30-SKILL-SYSTEM-lokma-adaption.md` style guide; lint enforces `related_skills` must resolve in-repo |
| Silent overwrite on project vs local collision | Project wins explicitly; else ambiguous bare-name refusal | Document precedence (`project > local > external`) in Lokma's skill index header comment + same refusal UX hinting `category/name` |
| Telemetry loss under concurrency | `fcntl` RLock + atomic `os.replace` on `.usage.json` | In Lokma Node, `fs.writeFile(temp) + fs.rename` + OS lock (`proper-lockfile` or `fs.promises` + `lockfile`) |

### 7.6 Minimum verifiable definition of done for Lokma

When the following pass, Lokma has equivalent auto-discovery:

- [ ] `lokma skills list` returns categorized `name: description` with platform filter; stock host ~7 bundled skills visible post-monomorphic init
- [ ] Prompt printed with `LOKMA_DEBUG_PROMPT=1 lokma -q "tip: plan"` contains `<available_skills>` stable block (same mandatory paragraph)
- [ ] Model that receives that prompt calls `skill_view(name="plan")` at least once on relevant tasks (verify via JSONL `tool_calls` in session transcripts like Hermes `state.db` FTS5 search `session_search`)
- [ ] `skill_view` loads `references/` path successfully; `skill_manage` create → file appears at `~/.lokma/skills/<name>/SKILL.md` with frontmatter validated; patch unique-match enforced via fuzzy fallback; delete refuses when `pinned` or `essential` (plan/lokma-agent)
- [ ] `LOKMA_HOME` override respected so profile-scoped run (`LOKMA_HOME=/tmp/a lokma --skills dummy "hi"`) lists dummy while main home does not
- [ ] `lokma --skills demo ...` injects demo even when `environments: [kanban]` would hide it from index (explicit-bypass proven)
- [ ] `.usage.json` sidecar increments `view_count`/`patch_count`, curator sweep marks idle→stale→archive with recoverable `.archive/` and `lokma curator restore`
- [ ] `lokma mcp list` + `mcp_filesystem_*` tools appear after `mcp_servers` config without restart? Hermes requires restart; Lokma can allow live-reload via `/reload-mcp` like Hermes — implement `skill_view`-off but similar HOT-reload

### 7.7 Turkish UI vs English harness note (Lokma Rule #7)

Lokma Docs rule from `00-LOKMA-KONTEKST.md` Rule 7: "Docs & code English from 2026-08-31 01:45 (chat stays Turkish)". Skill adaptation honors same split:

- SKILL.md bodies + descriptions + system-prompt block + tool schemas → **English** (harness lingua franca, model best).
- End-user replies from Lokma harness when surface (`LOKMA_SURFACE=cli` Turkish prompt) → **Turkish** response, but after loading English skill the agent must still reason in Turkish-facing UX while obeying English procedure. (Document this duality in `Docs/30-*` skill header comment.)

---

## 8. Appendix — Key File Map & CLI Cheatsheet

### 8.1 File map (what to read when debugging skills on Hermes; paths also valid on installed host `/usr/local/lib/hermes-agent`)

| Path (installed) | Role |
|------------------|------|
| `agent/prompt_builder.py` | `build_skills_system_prompt()`, `build_skills_system_prompt_inner()`, `+ _skills_prompt_snapshot_path()`, `+ clear_skills_system_prompt_cache()` — THE index |
| `agent/skill_utils.py` | `parse_frontmatter` (BOM-safe), `skill_matches_platform`, `skill_matches_environment`, `get_all_skills_dirs`, `iter_skill_index_files`, `is_skill_support_path`, `EXCLUDED_SKILL_DIRS`, `SKILL_SUPPORT_DIRS`, `get_disabled_skill_names`, disabled normalization |
| `tools/skills_tool.py` | `skills_list()`, `skill_view(name, file_path)`, `_find_all_skills`, scan cache 30s, injection detection, env passthrough, credential file gate, plugin skill branch |
| `tools/skill_manager_tool.py` | `skill_manage(action, name, content, category, file_path, old_string, new_string)`, validation, all guards, snapshot clear, telemetry, ledger, sync push debounce |
| `tools/skill_usage.py` | `.usage.json` sidecar, `STATE_ACTIVE/STALE/ARCHIVED`, `PROTECTED_BUILTIN_SKILLS`, `.bundled_manifest`, `.hub/lock.json`, `latest_activity_at` |
| `tools/skill_ledger.py` | append-only JSONL ledger for every mutation |
| `tools/skills_guard.py` | `scan_skill`, `should_allow_install`, `format_scan_report` — security gating |
| `tools/skills_hub.py` | `browse/search/inspect/install/tap/snapshot` + `HubLockFile` |
| `tools/path_security.py` | `has_traversal_component`, `validate_within_dir` |
| `tools/mcp_tool.py` | `discover_mcp_tools`, `MCP_HARD_RESULT_CAP_CHARS`, `_OSV_MALWARE_CHECK_TIMEOUT_S`, filtered env, naming `mcp_{server}_{tool}`, reconnect, sampling gates |
| `agent/curator.py` | background sweeps, snapshot/tar.gz backup, aux consolidation |
| `toolsets.py` | `TOOLSETS`, `_HERMES_CORE_TOOLS` — the narrow-waist exposure |
| `run_agent.py` | `AIAgent` loop + tool dispatch glue |
| `hermes_cli/commands.py` | `COMMAND_REGISTRY` (all slash commands) |
| `skills/autonomous-ai-agents/hermes-agent/SKILL.md` | Routing Table hub — the "load matching reference" doctrine |
| `skills/autonomous-ai-agents/hermes-agent/references/{native-mcp.md, background-systems.md, ...}` | Deep dives on MCP, cron/curator/kanban/delegation |
| `.hermes/skills/.usage.json` | Telemetry live file — view with `cat ~/.hermes/skills/.usage.json | jq` |
| `.hermes/skills/.skills_prompt_snapshot.json` | Disk snapshot — invalidates on manifest drift |
| `website/docs/developer-guide/prompt-assembly.md` | System prompt 3-tier diagram (stable/context/volatile) + platform_hints |
| `website/docs/developer-guide/creating-skills.md` | Authoring hardline (60-char desc, bundled vs optional, body order) |
| `website/docs/developer-guide/adding-tools.md` | Two-file tool add + which-file-does-what guidance |

### 8.2 Hermes CLI quick-reference affecting skills

```bash
# browse & discovery (human)
hermes skills browse               # 90666 loaded, official ⭐, page 1/4534
hermes skills search "mcp git*"    # query (supports site: / intitle:)
hermes skills inspect official/security/1password  # preview without install
hermes skills list                 # 183 on test host (77 builtin +106 local)
hermes skills check / update / audit / uninstall <id>
hermes skills tap add <github-repo>
hermes skills tap remove / config
hermes skills trust / untrust <path>  # project skill trust
hermes skills config               # enable/disable per platform (interactive)
hermes skills snapshot export|import

# bundles
hermes bundles list|create|delete  # one /<name> → many skills

# curator
hermes curator status|usage|run|pause|resume|pin <name>|unpin <name>|archive <name>|restore <name>|list-archived|prune|backup|rollback

# MCP
hermes mcp add <name> --command "npx ..." | --url https://...
hermes mcp list|test <name>|catalog|install <name>|configure <name>|remove <name>

# explicit skill preload for one run
hermes --skills randevona,isletme "fix booking"
hermes chat -q --skills arxiv "find papers on GRPO" | cat

# debug prompt index (not CLI flag — code hook)
# from python:
from agent.prompt_builder import build_skills_system_prompt
print(build_skills_system_prompt())
# or observe on disk
cat ~/.hermes/skills/.skills_prompt_snapshot.json | python -m json.tool
```

[Source: `hermes skills --help` · `hermes --help` `--skills` global flag · `hermes curator --help` · `hermes mcp --help` · captured terminal outputs 2026-08-31]

### 8.3 Real skill samples from registry (2026-08-31 scrape)

Discovered via `hermes skills browse` page 1:

| # | Id | Description excerpt | Tier |
|---|----|---------------------|------|
| 1 | `official/security/1password` | Set up and use 1Password CLI (op). Use when ... | optional |
| 2 | `official/finance/3-statement-model` | Build fully-integrated 3-statement models | optional |
| 8 | `official/creative/ascii-art` | Official optional skill (...live repo; run...) | optional → also bundled under `creative/ascii-art` (duplicate) |
| ... | 90666 total | 139 official optional | |

Also captured `hermes skills inspect hermes-agent` collision of two community forks `skills-sh/wihy/hermes-agent-skill/hermes-agent` vs `skills-sh/nousresearch/hermes-agent/hermes-agent` — shows community skill naming governance issue (full identifier disambiguates).

[Source: `hermes skills browse` stdout · `hermes skills inspect hermes-agent` stdout · live terminal capture]

---

## 9. References — Cited Sources

- **Repository root:** `https://github.com/nousresearch/hermes-agent` commit `dd401e0f` (Hermes Agent v0.20.6 up to 495 behind on host) — `README.md` (§Quick Install, §Getting Started, §Documentation table, §Migrating from OpenClaw) [Local clone: `/tmp/hermes-agent-repo/README.md` · installed: `/usr/local/lib/hermes-agent/README.md`]
- **Docs site:** `https://hermes-agent.nousresearch.com/docs/` — `website/docs/developer-guide/prompt-assembly.md` (primary for skill index tier), `architecture.md`, `creating-skills.md`, `adding-tools.md`, `user-guide/skills/*` [Local: `/usr/local/lib/hermes-agent/website/docs/developer-guide/*` · `/tmp/hermes-agent-repo/website/docs/developer-guide/prompt-assembly.md`]
- **Core AGENTS.md:** `/tmp/hermes-agent-repo/AGENTS.md` (or `/usr/local/lib/hermes-agent/AGENTS.md`) — narrow waist / caching sacred / project structure / AIAgent loop / tool addition in 2 files / config sections / skin engine / plugins discovery timing pitfall
- **Skill authoring hardline:** `skills/software-development/hermes-agent-skill-authoring/SKILL.md` (frontmatter MUST starts at byte 0, description ≤60, platforms audit table, related_skills resolve, workflow, verification checklist) [Source: `/root/.hermes/skills/software-development/hermes-agent-skill-authoring/SKILL.md`]
- **Hermes-Agent hub skill:** `skills/autonomous-ai-agents/hermes-agent/SKILL.md` (routing table: "Every shipped feature one line each: /docs/llms.txt", Key Paths) + `references/background-systems.md` (Delegation/Cron/Curator/Kanban 4 systems), `references/native-mcp.md`, `references/cli-reference.md`, `references/configuration.md`, `references/webhooks.md`, etc. [Source: `/root/.hermes/skills/autonomous-ai-agents/hermes-agent/SKILL.md` · `.../references/*`]
- **Loop system skills:** `skills/loop-engineering/SKILL.md` (kitchen model, decision tree, harness 4 mandatory), `skills/hermes-harness/SKILL.md` (Quick Scaffold, what scaffold-loop.sh creates, 3 required post-steps), `skills/auto-continue/SKILL.md` (watchdog logic, Güven footer regex `^— Güven: %[0-9]+ ·`, policy table) [Source: `/root/.hermes/skills/{loop-engineering,hermes-harness,auto-continue}/SKILL.md`]
- **Prompt builder:** `/usr/local/lib/hermes-agent/agent/prompt_builder.py` (searchable markers: `build_skills_system_prompt`, `_build_skills_system_prompt_inner`, `_skills_prompt_snapshot_path`, `_build_skills_manifest`, `clear_skills_system_prompt_cache`, `SKILL_PRUNED`, `_skill_should_show` environment gate)
- **Skill utils:** `/usr/local/lib/hermes-agent/agent/skill_utils.py` (full `EXCLUDED_SKILL_DIRS`, `SKILL_SUPPORT_DIRS`, `ORG_MIRROR_DIR_NAME`, `is_skill_support_path`, `parse_frontmatter` BOM handling, `skill_matches_platform/environment`, `get_disabled_skill_names`, `ESSENTIAL_SKILLS={"hermes-agent"}`)
- **Skills tool:** `/usr/local/lib/hermes-agent/tools/skills_tool.py` (`_SKILLS_CACHE_TTL_SECONDS=30.0`, `_INJECTION_PATTERNS`, `skills_list`/`skill_view` schemas, candidate Strategies 1/1b/2/3, ambiguous collision refusal, quarantine gate, plugin `namespace:bare` branch, `file_path` traversal guard, `linked_files` enumeration, `required_environment_variables` collection, `register_env_passthrough`, `register_credential_files`)
- **Skill manager tool:** `/usr/local/lib/hermes-agent/tools/skill_manager_tool.py` (`MAX_NAME_LENGTH=64`, `MAX_SKILL_CONTENT_CHARS=100_000`, `MAX_SKILL_FILE_BYTES=1_048_576`, `VALID_NAME_RE`, `ALLOWED_SUBDIRS`, guards `_pinned_guard`, `_background_review_write_guard`, `_curator_consolidation_delete_guard`, gate `_apply_skill_write_gate` staging, `SKILL_MANAGE_SCHEMA`, `_maybe_debounced_sync_push` 5s debounce)
- **Usage sidecar:** `/usr/local/lib/hermes-agent/tools/skill_usage.py` (`STATE_ACTIVE/STALE/ARCHIVED`, `PROTECTED_BUILTIN_SKILLS={"plan"}`, `.bundled_manifest`, `.hub/lock.json`, `.curator_suppressed`, `_usage_file`, `record_created(agent_created=is_background_review())`)
- **MCP client:** `/usr/local/lib/hermes-agent/tools/mcp_tool.py` (`_MCP_HARD_RESULT_CAP_CHARS=2_000_000`, `_OSV_MALWARE_CHECK_TIMEOUT_S=12.0`, `_get_mcp_stderr_log` → `~/.hermes/logs/mcp-stderr.log`, `stdio` vs `http`/`sse` transports, `mcp_{server}_{tool}` naming, reconnect exponential `1/2/4/8/16s`, `_MCP_AVAILABLE` via `find_spec`, sampling `max_tool_rounds`)
- **Toolsets:** `/usr/local/lib/hermes-agent/toolsets.py` (`_HERMES_CORE_TOOLS` includes `skills_list/skill_view/skill_manage`, `TOOLSETS` includes `web,terminal,file,skills,cronjob,...`, `desktop_ui`, `kanban`) + `tools/registry.py` import-time registration
- **Cron store:** `/usr/local/lib/hermes-agent/cron/jobs.py` (`TICKER_INTERVAL_SECONDS=60`, `_current_cron_store` profile-scoping via `use_cron_store`, `.tick.lock`, `TICKER_HEARTBEAT_FILE`, `ONESHOT_RUN_CLAIM_TTL_SECONDS=1800`, per-profile `get_hermes_home().resolve()`)
- **CLI evidence:** Captured `hermes --help` (≈30 top-level commands including `skills, bundles, curator, mcp, cron, kanban, setup, portal`), `hermes skills --help` (14 verbs), `hermes skills list` (183 enabled: 77 builtin +106 local), `hermes skills browse` (90666 loaded, 139 official optional), `hermes skills inspect hermes-agent` (collision demonstrates governance), `hermes --version` v0.20.6, live `~/.hermes/skills/.usage.json` sample (auto-continue 2/2, autonomous-web-testing 14/14) [Source: terminal captures 2026-08-31]
- **Website work-with-skills guide:** `website/docs/guides/work-with-skills.md` (how users interact with skills) implied but sourced via `prompt-assembly.md` + `creating-skills.md` + `architecture.md` chain
- **Lokma project:** `/mnt/apopic/lokma/README.md`, `/mnt/apopic/lokma/Docs/*.md` (`00-LOKMA-KONTEKST.md`, `01-PROJE-TANIMI.md`, `02-TEKNIK-KARARLAR.md`, `20-WEB-HARNESS-overview.md`, `21-WEB-STACK-alternatives.md`, `22-WEB-FEATURES-provider-model-session.md`, `23-PLUGIN-SYSTEM-deepseek-cordis.md`, `24-WEB-PANE-SYSTEM-and-orchestration.md`, `25-WEB-ROADMAP.md`, `raw/*`) — for adaption context §7.1

---

> **Craft note:** This dossier was assembled from live host introspection (`/usr/local/lib`, `/root/.hermes`, `hermes` CLI) plus a shallow clone at `/tmp/hermes-agent-repo` rather than `web_extract` scraping, because the repo's filesystem is the ground truth (docs site is a build artifact of the same markdown). Where a network extraction would add live `https://github.com/nousresearch/hermes-agent` page shape, the README quoted is identical. For Lokma readers wanting an online anchor, verify against `/docs/llms.txt` and `/docs/llms-full.txt` (prompt_builder §Scope & Verification points to those as cheapest verification targets — always fetch via `web_extract` or `curl -s https://hermes-agent.nousresearch.com/docs/llms.txt`).

— End of research. **Next step for Lokma:** copy this file into `Docs/raw/31-hermes-skills-raw.md` (or the `/tmp` → project sync described in Rule 5 memory.fermag), then run Phase 0 scaffold once stack pick A settled.

