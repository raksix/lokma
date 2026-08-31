# Setup — Optional Stack & Connections (Hermes-Inspired)

> **Inspired by:** [`nousresearch/hermes-agent`](https://github.com/nousresearch/hermes-agent) — `install.sh` (3,678 lines) / `install.ps1` (5,012) · `hermes setup` TUI · `config.yaml.example` (1,986) · `hermes_cli/setup.py` (3,876)
> **Raw:** `raw/34-hermes-setup-ham-arastirma.md` (1,190 lines) · `raw/35-hermes-browser-search-ham-arastirma.md` (1,349) · `raw/36-hermes-connections-ham-arastirma.md` (964)
> **Companion:** `26-CONFIG-and-CREDENTIALS.md` · `21-WEB-STACK-alternatives.md` · `23-PLUGIN-SYSTEM-deepseek-cordis.md`

---

## 1. What Hermes Does at Setup (and What Lokma Copies)

Hermes' `install.sh` installs a **managed Python 3.11 via `uv`** (`$HERMES_HOME/bin/uv`), Node 26 tarball, `ripgrep`/`ffmpeg` (apt/brew/dnf/pacman + cargo fallback), Playwright Chromium + Browser Use CLI + `cua-driver`. On Windows, `install.ps1` uses MinGit (~45 MB) + 3-rung `uv` installer + 8.3 short-path fix.

`hermes setup` is an **interactive TUI wizard** that asks:

| Group | What It Asks | Required? |
|-------|--------------|-----------|
| **Model provider** | Pick at least one (Anthropic/OpenAI/Google/Ollama/OpenRouter/Atlas) + API key | ✅ Required (at least one) |
| **Terminal backend** | `local` · `Docker` · `SSH` · `Singularity` · `Modal` · `Daytona` · `Vercel Sandbox` | ✅ One chosen |
| **Gateway / messaging** | Telegram/Discord/Slack/WhatsApp/Signal — token + allowlist | ☐ Optional |
| **Browser** | Enable `browser_use_cli` / Playwright / `nous-gateway` fires | ☐ Optional |
| **Web search** | `SearXNG` · `Exa` · `Brave` · `Tavily` · `Firecrawl` | ☐ Optional (fallback chain) |
| **MCP servers** | `hermes mcp add` / `hermes mcp catalog` (70 entries) — stdio vs HTTP, auth types | ☐ Optional |
| **Memory / vault** | Enable FTS5 + vault sync (`memory.fermag.com.tr` equivalent) | ☐ Optional |
| **Skills** | Bundled vs optional vs hub (`agentskills.io`) | ☐ Optional |

Wizard writes `~/.hermes/config.yaml` (`_config_version: 39`, ~1,897 lines live) + `auth.json`/`credentials`. `hermes doctor` then probes each subsystem, `hermes config set/get` edits layered config.

---

## 2. Lokma's `lokma init` / `lokma setup` — Same Idea, Checkboxes

Lokma mirrors this as **`lokma init`** (first run) and **`lokma setup`** (reconfigure). Both are **Ink TUI** (same as DSH/Hermes), keyboard-driven, with **checkbox sections** — space to toggle, enter to confirm.

```
┌─ lokma setup ─────────────────────────────────┐
│  ■ Core (required)                            │
│    ☑ Provider — pick at least one             │
│    ☑ Terminal backend — local / docker / ssh  │
│  □ Browser (optional)                         │
│    ☐ Browser Use CLI (Playwright + CDP)       │
│    ☐ Headless Chromium pool                   │
│  □ Web Search (optional)                      │
│    ☐ SearXNG (self-hosted docker :8889)       │
│    ☐ Exa (keyless free-tier fallback)         │
│    ☐ Brave / Tavily / Firecrawl               │
│  □ Gateway / Connections (optional)            │
│    ☐ Telegram  ☐ Discord  ☐ Slack             │
│    ☐ WhatsApp (Baileys QR) ☐ Signal          │
│  □ MCP & Skills (optional)                     │
│    ☐ MCP catalog (70 servers)                 │
│    ☐ Skill hub (agentskills.io)               │
│  □ Memory & Vault (optional)                   │
│    ☐ FTS5 session_search + compaction         │
│    ☐ Vault sync (memory.fermag.com.tr)        │
└───────────────────────────────────────────────┘
  [Space] toggle  [Enter] confirm  [q] quit
```

**Flags mirror Hermes:** `lokma setup --quick` (defaults) · `--reset` (wipe) · `--only browser,search` · `--skip gateway,mcp`

### 2.1 What Each Checkbox Controls

| Checkbox | What It Enables | Config Key | Env Fallback |
|----------|----------------|------------|--------------|
| **Provider** | `providers[]` + `credentials.json` AES-GCM entry, `provider_routing` + `fallback_providers` | `providers` · `model.default` | `LOKMA_API_KEY` · `ANTHROPIC_API_KEY` |
| **Terminal backend** | `terminal.backend` (`local`/`docker`/`ssh`/`modal`…) | `terminal.backend` | — |
| **Browser** | `browser.enabled`, `browser.backend` (`browser_use_cli`/`playwright`/`cdp`), `BU_CDP_URL` | `browser.*` | `BU_CDP_URL` |
| **Web search** | `webSearch.backend` (`searxng`/`exa`/`brave`/`tavily`…), `webSearch.fallbackChain` | `webSearch.*` | `SEARXNG_URL` · `EXA_API_KEY` |
| **Gateway** | `gateway.enabled`, per-platform `gateway.telegram.token` etc | `gateway.*` | `TELEGRAM_BOT_TOKEN` … |
| **MCP** | `mcp.servers[]` (stdio/HTTP, auth: header/OAuth/mTLS) | `mcp.servers` | — |
| **Memory/vault** | `memory.enabled`, `vault.url`, `vault.apiKey` | `memory.*` · `vault.*` | `LOKMA_VAULT_URL` |
| **Skills** | `skills.autoDiscover`, `skills.hub` | `skills.*` | — |

All keys live in `~/.lokma/config.json` (layered: `~/.lokma/config.json` > `.lokma/settings.json` > `env` > `flags`) — see `26-CONFIG-and-CREDENTIALS.md`. Secrets are **never** in `config.json`; they go to `~/.lokma/credentials.json` (AES-GCM, `0600`).

---

## 3. Browser Subsystem

### 3.1 What Hermes Has

- `browser_registry` dispatches 3 built-ins: `agent-browser` (Playwright) · `browser_use_cli` (Browser Use CLI 3.0) · `nous-gateway` fires
- `browser_exec` = Browser Use CLI 3.0: Python helpers `new_tab` / `js` / `fill_input` / `capture_screenshot` + `BH_AGENT_WORKSPACE` append-to-file harness; CDP is the raw escape hatch; supports local vs cloud vs `BU_CDP_URL` attachment, isolated sessions (300–1800 s timeout)

### 3.2 Lokma's Browser Options (Optional)

| Option | What It Is | When to Pick |
|--------|-----------|--------------|
| **Browser Use CLI** | `browser-use` 3.0 + Playwright Chromium, same as Hermes | General web automation, form filling, scraping |
| **Playwright direct** | Raw `playwright-core` + `chromium` headless pool | Deterministic E2E (also used by Testing harness `33-*`) |
| **CDP attachment** | `BU_CDP_URL=http://127.0.0.1:9222` — attach to existing Chrome | Debugging, user-profile browser |

Setup asks **“Enable browser harness?”** → if yes → **“Pick backend”** (default: `browser_use_cli`). If skipped, browser tools are simply not injected into the agent's `<available_skills>` (see `27-*`).

`lokma doctor` probes: `chromium --version`, `npx browser-use --help`, `curl $BU_CDP_URL/json/version`.

---

## 4. Web Search Subsystem

### 4.1 What Hermes Has

`hermes_web_search` / `web_extract` with **8 backends** probed live: `searxng` · `exa` · `brave_free` · `tavily` · `firecrawl` · `parallel` · `ddgs` · `xai`. Registry at `agent/web_search_registry.py` + `plugins/web/*`. Config env: `SEARXNG_URL` · `EXA_API_KEY` · `BRAVE_API_KEY` etc. Gateway can also expose web search as a tool.

**Fallback chain:** `searxng` (self-hosted `docker :8889`) → `exa` (keyless free-tier) → `brave_free` → `ddgs` (no key). If `SEARXNG_URL` is down, Hermes silently falls back to Exa.

### 4.2 Lokma's Web Search Options (Optional)

Setup asks **“Enable web search?”** → if yes → **“Pick backend(s)”** with fallback order:

```
[1] SearXNG (self-hosted docker :8889)  — private, no API key, needs docker
[2] Exa (keyless free-tier)             — zero-config fallback, cited in 35-*
[3] Brave Search API                    — needs BRAVE_API_KEY
[4] Tavily / Firecrawl / Parallel       — optional, needs key
```

Stored as `webSearch: { enabled, primary: "searxng", fallbackChain: ["exa","brave_free"], env: { SEARXNG_URL, EXA_API_KEY } }`.

Agent sees `web_search` + `web_extract` only if enabled. `web_extract` is fetch + readability (no LLM summarization) — same contract as Hermes.

`lokma doctor` probes: `curl -fsS $SEARXNG_URL/search?q=test` → fallback check.

---

## 5. Gateway / Connections

### 5.1 What Hermes Has (35 Platforms, Tiered)

Single `hermes gateway` process: per-chat SQLite session store → `AIAgent`, delivery ledger, TUI↔gateway DB bridge (`state.db`, `group_sessions_per_user`, `/pause`/`/resume`). Messaging matrix includes Telegram (BotFather privacy toggle), Discord (intents), Slack (Socket Mode + manifest), WhatsApp (Baileys QR + debounce), Signal (`signal-cli` SSE), plus 30 more.

Credentials: Bot tokens, OAuth scopes, allowlists. Commands: `hermes gateway setup/run/install/systemd_watchdog`.

### 5.2 Lokma's Gateway Options (All Optional)

Setup section **“Gateway / Connections”** — each is a checkbox:

- `Telegram` — `TELEGRAM_BOT_TOKEN` + allowlist `gateway.telegram.allowFrom[]`
- `Discord` — bot token + guild intents
- `Slack` — Socket Mode token + manifest
- `WhatsApp` — Baileys QR bridge (pairing code flow)
- `Signal` — `signal-cli` + SSE

None is required. If enabled, Lokma's gateway mirrors Hermes: one `lokma gateway` process, same `state.db` session bridging. If skipped, `gateway.enabled=false` and no gateway process is spawned.

---

## 6. Providers, MCP, Skills, Memory (Optional but Recommended)

| Group | Hermes Source | Lokma Checkbox | Default |
|-------|---------------|----------------|---------|
| **Providers** | `providers:` + `auth.json` + Bitwarden/1Password vaults, `provider_routing` (`sort/only/ignore/order`), `fallback_providers` per-turn, `auxiliary.*` per-task, Nous Portal one-shot | **Required — pick ≥1** | Anthropic + OpenAI |
| **MCP** | `mcp_servers:` via `hermes mcp add` vs `hermes mcp catalog` (70 live), stdio vs HTTP, auth (header/OAuth DCR loopback/mTLS, `identity_header`), tool filtering globs | ☐ Optional — `mcp.servers[]` | off |
| **Skills** | Bundled vs optional vs hub (`agentskills.io`) — `<available_skills>` injection | ☐ Optional — `skills.hub` | bundled only |
| **Memory/vault** | `MEMORY.md`/`USER.md` + FTS5 `session_search` + compaction + `memory-vault-sync.py` | ☐ Optional — `memory.enabled` + `vault.url` | on (local FTS5) |

Provider keys are **always** in `credentials.json` (AES-GCM, `0600`), never in `config.json` — `GET /api/config` returns `keySet: boolean` only (see `26-*`).

---

## 7. `lokma doctor` & `lokma config`

Mirroring `hermes doctor` + `hermes config set/get`:

```bash
lokma doctor                # probes every enabled subsystem, table of ✅/❌
lokma doctor --only browser # probe one group
lokma config get webSearch.primary
lokma config set webSearch.primary exa
lokma config show --json    # layered resolved config (secrets masked)
```

Probe table:

| Probe | Check |
|-------|-------|
| `provider` | `curl` provider base URL + keySet? |
| `browser` | `chromium --version` + `browser-use --help` + `$BU_CDP_URL/json/version` |
| `webSearch` | `curl $SEARXNG_URL/search?q=test` → Exa fallback |
| `gateway` | token present? + `lokma gateway --probe` |
| `mcp` | `mcp.servers[].command` exists? |
| `memory` | `~/.lokma/state.db` WAL + FTS5? |
| `vault` | `curl $VAULT_URL/api/health` + apiKey? |

---

## 8. File & API Map

**Files:**

```
~/.lokma/config.json        # layered config (global) — same shape as Hermes config.yaml
~/.lokma/credentials.json   # AES-GCM 0600 — API keys, tokens, vault apiKey
.lokma/settings.json        # per-project overrides (optional)
~/.lokma/state.db           # SQLite WAL — sessions + FTS5 + delivery ledger
```

**APIs (when Web harness is running):**

```
GET  /api/config              → resolved config (secrets masked → keySet)
PATCH /api/config             → write-through to ~/.lokma/config.json (secrets → credentials.json)
GET  /api/doctor              → { probes: [{ name, ok, latencyMs, error? }] }
POST /api/setup               → run setup wizard non-interactively { enable: { browser, webSearch, gateway } }
```

Web `Settings` page renders the same checkbox groups as the TUI — same `config.json` on disk, live-synced via file watcher (`config/changed` → plugin hot-reload).

---

## 9. Non-Goals

- No re-implementation of SearXNG/Exa/Brave — Lokma is a **registry + fallback chain** over them.
- No mandatory gateway — Lokma runs fine with **zero connections** (local TUI + Web, no Telegram etc).
- No secret leakage — `credentials.json` is `0600`, `GET /api/config` never returns a key.

---

## 10. References

- Hermes install: `https://hermes-agent.nousresearch.com/docs/installation` + live `install.sh`/`install.ps1`
- Hermes setup: `https://hermes-agent.nousresearch.com/docs/quickstart` + `hermes_cli/setup.py`
- Hermes config: `https://hermes-agent.nousresearch.com/docs/configuration` + `cli-config.yaml.example`
- Hermes browser: `https://hermes-agent.nousresearch.com/docs/user-guide/features/browser`
- Hermes web search: `https://hermes-agent.nousresearch.com/docs/user-guide/features/web-search`
- Hermes gateway/messaging: `https://hermes-agent.nousresearch.com/docs/user-guide/messaging/*`
- Lokma config: `26-CONFIG-and-CREDENTIALS.md` · `02-TEKNIK-KARARLAR.md`
