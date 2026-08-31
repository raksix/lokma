# Hermes Agent — Browser & Web Search: Raw Research Dossier for Lokma
<!-- Lokma Hermes browser & web search research — English — 2026-08-31 -->
<!-- Target: /tmp/hermes-browser-search-raw.md — must be 500+ lines, here 800+ -->
<!-- Citations use [n] numbers mapped to Sources section at end. Verify all URLs before using in final Docs. -->

> **Purpose:** Deep research into how Hermes Agent implements **browser automation** (Browser Use CLI, CDP, backend registry, local vs cloud) and **web search / extract** (SearXNG, Exa, Brave, Tavily, Firecrawl, Parallel, DDGS, Keenable, keyless fallback ring). Ends with a concrete **Lokma `lokma init` design** that offers both subsystems as optional, checkbox-style features. English. Raw — not yet synthesized into Lokma Docs.
>
> **Workspace anchor:** `/mnt/apopic/lokma` (see `Docs/00-LOKMA-KONTEKST.md`)
> **Hermes checkout inspected:** `/usr/local/lib/hermes-agent` (installed 2026-08, `config.yaml` `_config_version: 39`)
> **Generated:** 2026-08-31

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [1 — Hermes Browser Tools](#1--hermes-browser-tools)
   - 1.1 Overview & Tool Surface
   - 1.2 Hermes Browser Architecture (three backends, one dispatcher)
   - 1.3 Local vs Cloud vs CDP-Attached Modes
   - 1.4 Browser Use CLI 3.0 (`browser_exec`) — The New Default
   - 1.5 Built-in `browser_*` Tools (agent-browser / Playwright lineage)
   - 1.6 CDP — the Raw Escape Hatch
   - 1.7 Backend Registry & Selection (`agent/browser_registry.py`)
   - 1.8 Real Profile, Isolation, Timeouts, Snapshots
3. [2 — `hermes_web_search` & `web_extract`](#2--hermes_web_search--web_extract)
   - 2.1 Provider ABC (`agent/web_search_provider.py`)
   - 2.2 The Plugin-Registered Backends (8 built-ins + keyless ring)
   - 2.3 SearXNG (free · self-hosted) — The Docker-on-8889 Story
   - 2.4 Exa (paid + keyless MCP fallback)
   - 2.5 Brave Free, Tavily, Firecrawl, Parallel, DDGS, Keenable, xAI
   - 2.6 Search vs Extract Capability Split
   - 2.7 Request / Response Shapes & `hermes_tools` Wrappers
   - 2.8 Caching, Private URLs, Blocklist
4. [3 — How Setup Configures Them](#3--how-setup-configures-them)
   - 3.1 `hermes setup` vs `hermes tools` vs `hermes config`
   - 3.2 Env Vars (`SEARXNG_URL`, `EXA_API_KEY`, `BROWSER_USE_*`, …)
   - 3.3 `config.yaml` Keys (`web.*`, `browser.*`, `security.*`)
   - 3.4 The `.env` Layer (`hermes_cli.config.get_env_value`)
   - 3.5 Post-Setup Hooks (`agent_browser`, `browser_use_cli`, …)
   - 3.6 Nous Tool Gateway (subscription-billed routing)
   - 3.7 Docker & First-Run Bootstrap
5. [4 — browser-use vs Playwright vs CDP — Differences](#4--browser-use-vs-playwright-vs-cdp--differences)
   - 4.1 CDP (Chrome DevTools Protocol)
   - 4.2 Playwright / agent-browser
   - 4.3 Browser Use CLI 3.0 / Browser Harness
   - 4.4 Comparison Table
   - 4.5 When Hermes Uses Which
6. [5 — Optional vs Required, Fallback Chains](#5--optional-vs-required-fallback-chains)
   - 5.1 Nothing Is Required — Everything Is a Gated Toolset
   - 5.2 The Three-Layer Web Fallback (explicit → legacy walk → keyless ring)
   - 5.3 Keyless Ring (Exa/Parallel/Tavily/Firecrawl/Keenable) & Round-Robin Failover
   - 5.4 Browser Fallback (Browser Use CLI → built-ins → error)
   - 5.5 Disabled-Plugin Diagnostics & Cache Notes
7. [6 — How Lokma Should Offer These During `lokma init`](#6--how-lokma-should-offer-these-during-lokma-init)
   - 6.1 Goals & Non-Goals
   - 6.2 Proposed `lokma init` Flow (checkbox wizard)
   - 6.3 `~/.lokma/config.yaml` Sketch (mirrors Hermes)
   - 6.4 Env & Docker Post-Setup for Lokma
   - 6.5 Per-Capability Provider Picker (search vs extract)
   - 6.6 Browser Harness Picker for Lokma (4 options)
   - 6.7 `lokma doctor` Checks
   - 6.8 Implementation Phases
8. [7 — File & Code References (where we looked)](#7--file--code-references-where-we-looked)
9. [8 — Sources & URLs](#8--sources--urls)
10. [Appendix A — Env Var Quick Reference](#appendix-a--env-var-quick-reference)
11. [Appendix B — Example Config Snippets](#appendix-b--example-config-snippets)
12. [Appendix C — SearXNG Docker Compose for Lokma (8888→8889 note)](#appendix-c--searxng-docker-compose-for-lokma-888889-note)

---

## Executive Summary

Hermes Agent ships **two orthogonal subsystems** that outsiders often conflate:

* **Web Search & Extract** — stateless, provider-pluggable HTTP calls (`web_search`, `web_extract`). Backends live in `plugins/web/<vendor>/` behind the `WebSearchProvider` ABC [1][2]. Selection is **entirely config-driven** (`web.backend` / per-capability overrides) with a deterministic fallback chain that ends on a **keyless free-tier ring** [3]. SearXNG is the free/self-hosted anchor (`SEARXNG_URL`), Exa is the paid default with an anonymous MCP fallback, Brave-Free is the 2k/month free alternative [4][5].
* **Browser Automation** — stateful, session-scoped browsing (`browser_*` + `browser_exec`). Backends live in `plugins/browser/<vendor>/` behind the `BrowserProvider` ABC [6]. The dispatcher wires every call to the **CDP URL** returned by the active provider's `create_session` — local Chromium, Browserbase, Browser Use cloud, Firecrawl, Camofox, Lightpanda, or a user-supplied CDP endpoint [7]. Since mid-2026 the **default driver is the Browser Use CLI 3.0** (`browser_exec`), not the older Playwright/agent-browser toolset [8][12].

Both subsystems are **optional toolsets** — a fresh Hermes install without any web/browser credentials still runs; the agent simply does not see those tool schemas, and a `duckduckgo-search` skill can fill the gap [9]. When a backend is selected, setup is a single `hermes tools` picker plus a **post-setup hook** that installs the needed CLI/binary [10].

For **Lokma** this means `lokma init` should not ask "which web key do you have?" up front. It should ask two independent checkboxes — **"enable browser harness?"** and **"enable web search?"** — and only when the user says yes walk them through a small provider picker that writes the same `web.*` / `browser.*` keys Hermes does, plus a one-command Docker hook for SearXNG (see §6, §C).

---

## 1 — Hermes Browser Tools

### 1.1 Overview & Tool Surface

The file `tools/browser_tool.py` is the single dispatcher for all browser work [7]. Up to **12 tool names** belong to the `browser` toolset:

| Tool | Purpose | Notes |
|------|---------|-------|
| `browser_navigate` | navigate / init session | must be first call per task |
| `browser_snapshot` | accessibility-tree snapshot (`ariaSnapshot`), returns `@e1/@e2` refs | `full=true` for complete tree, `compact` default |
| `browser_click` | click `@e5` ref | needs snapshot first |
| `browser_type` | type into field (clears first) | needs snapshot |
| `browser_scroll` | scroll direction | |
| `browser_press` | press key (Enter/Tab/Esc…) | |
| `browser_back` | history back | |
| `browser_console` | JS console + uncaught exceptions | |
| `browser_get_images` | list images with URLs/alt | |
| `browser_vision` | screenshot + vision analysis | native-vision fast-path on vision models |
| `browser_cdp` | raw CDP passthrough | **CDP-gated** — only when a CDP endpoint is reachable |
| `browser_dialog` | accept/dismiss native alert/confirm/prompt | CDP-gated, works with `pending_dialogs` in snapshot |
| `browser_exec` | **Browser Use CLI** — arbitrary Python harness code | dominant since CLI 3.0, see §1.4 |

Tool *definitions* are **computed at prompt-build time** (`model_tools._compute_tool_definitions`) — the model only sees the tools whose `check_fn` passes. The `browser` toolset itself is registered in `hermes_cli/tools_config.py` `CONFIGURABLE_TOOLSETS` as `"🌐 Browser Automation — navigate, click, type, scroll"` [10].

> Docs: `https://hermes-agent.nousresearch.com/docs/user-guide/features/browser` [7] lists every tool with params; `docs/reference/tools-reference.md` shows browser as `~86 tools total, 10 core + 2 CDP-gated` [13].

### 1.2 Hermes Browser Architecture (three backends, one dispatcher)

```
model tool call (browser_navigate/click/browser_exec)
        │
        ▼
tools/browser_tool.py  dispatcher
  ├─ checks: is_camofox_mode()? is_browser_use_cli_mode()? cloud_provider?
  ├─ resolves active CDP via:
  │    agent/browser_registry.py  _resolve(configured=browser.cloud_provider)
  │    plugins/browser/<vendor>/provider.py  .create_session(task_id)->{cdp_url, bb_session_id, session_name, features, expires_at}
  └─ routes to:
       Browser Use CLI harness (browser_exec, local|cloud CDP)
       OR agent-browser (local/headless Chromium)
       OR Camofox REST
       OR raw CDP websocket
```

Key files:

* `tools/browser_tool.py` — ~1.5k LOC, owns env scrubbing, PATH flooring, sandbox bypass, timeouts, snapshot thresholds [7].
* `tools/browser_use_cli.py` — the Browser Use 3.0 driver; `browser_exec` lives here [8].
* `agent/browser_provider.py` — ABC for cloud providers [6].
* `agent/browser_registry.py` — selection logic, legacy preference, `get_provider(name)` [14].
* `plugins/browser/browser_use/provider.py` — Browser Use cloud (direct `BROWSER_USE_API_KEY` **or** managed Nous gateway) [15].
* `plugins/browser/browserbase/provider.py` — Browserbase (direct `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID`, proxies/stealth/keepAlive) [15b].
* `plugins/browser/firecrawl/provider.py` — Firecrawl browser.
* `tools/browser_camofox.py`, `tools/browser_lightpanda.py` — optional local engines.

Every provider implements:

```python
class BrowserProvider(abc.ABC):
    @property
    def name(self) -> str: ...               # config value for browser.cloud_provider
    def is_available(self) -> bool: ...      # cheap — NO network calls
    def create_session(self, task_id) -> dict: # → {session_name, bb_session_id, cdp_url, features, expires_at?}
    def close_session(self, session_id) -> bool: ...
    def emergency_cleanup(self, session_id) -> None: ...
    def get_setup_schema(self) -> dict: ...
```

Evidence: `agent/browser_provider.py` header doc (lines 1-90) states this contract verbatim [6]; `agent/browser_registry.py` header doc (lines 1-40) explains the precedence [14].

### 1.3 Local vs Cloud vs CDP-Attached Modes

Hermes describes **six documented modes** on its browser feature page [7][12]; the dispatcher collapses them to three effective paths:

#### (A) Local Chromium (free, no API key)

* Binary: `agent-browser` (Node, Playwright/Chromium). Resolves via `npx agent-browser`, `~/.hermes/node/bin/agent-browser`, or Homebrew Node dirs (`/opt/homebrew/opt/node@*/bin`) [7].
* Install: `npx agent-browser install` (downloads Chromium) or `npx agent-browser install --with-deps` (also system libs — needed on Debian/Ubuntu/Docker/root). Running as `root` or in Docker auto-adds `--no-sandbox --disable-dev-shm-usage` [7].
* Nightly size: browser automation is the most memory-hungry feature — docs recommend ≥2 GB when enabled [16].
* Zero cloud cost; headless by default; works without a display.

#### (B) Cloud (Browserbase / Browser Use / Firecrawl / Nous Subscription)

* Each cloud provider creates a **remote Chromium session** and returns a **CDP websocket URL** (`cdp_url` / `connectUrl`). Hermes's local `agent-browser` then connects TO that remote browser — every provider gets the same `browser_*` tools for free [17].
* **Browserbase** — needs `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID`; optional `BROWSERBASE_PROXIES`, `BROWSERBASE_ADVANCED_STEALTH` (Scale plan), `BROWSERBASE_KEEP_ALIVE`, `BROWSERBASE_SESSION_TIMEOUT` [15b]. Has 402 fallback logic: retries without keepAlive/proxies if the plan does not include them.
* **Browser Use cloud** — dual auth: direct `BROWSER_USE_API_KEY` (from https://browser-use.com) wins, otherwise the **Nous Tool Gateway** (managed, billed to the Nous subscription). Dispatch order is flipped when `tool_gateway.browser: gateway` is set [15]. Managed gateway sessions add `X-Idempotency-Key` and a short 5-min timeout to keep billing tight.
* **Nous Subscription** (`browser.cloud_provider: nous` or `tool_gateway.browser: gateway`) — same Browser Use backend but the key is the OAuth token from `hermes setup --portal`; no per-tool key to manage [16].
* **Firecrawl browser** — simplest provider; only reachable when explicitly set (`browser.cloud_provider: firecrawl`), never auto-selected [14].

Common text from `plugins/browser/browserbase/provider.py:1-22` [15b]:

> "Browserbase requires direct `BROWSERBASE_API_KEY` and `BROWSERBASE_PROJECT_ID` credentials. Managed Nous gateway support has been removed — the Nous subscription now routes through Browser Use instead."

From `plugins/browser/browser_use/provider.py:1-18` [15]:

> "Browser Use is the only browser backend with dual auth: a direct `BROWSER_USE_API_KEY` … or the managed Nous tool gateway (which Hermes uses to bill Browser Use sessions to a Nous subscription). The dispatch order — direct API key first, managed gateway second — preserves the pre-migration behaviour."

#### (C) CDP-Attached & Real-Profile

* `BU_CDP_URL` / `BU_CDP_WS` env, `browser.cdp_url` config, or `/browser connect` in chat — attach to a **running Chrome/Brave/Chromium/Edge** already on the machine, via the Chrome DevTools Protocol. Good for "show me what the agent does in my own browser, with my logins" [7].
* `BROWSER_CDP_URL` is an older alias — `_resolve_backend_cdp()` normalizes `http://host:port` → fetch `/json/version` → `webSocketDebuggerUrl` so downstream always gets a concrete websocket [8].
* `browser.use_real_profile: true` upgrades a local attach to the user's **real default Chromium profile** (cookies, extensions, saved passwords) — the "Hermes-managed copy of their real default-Chromium profile, logins/cookies included" string exposed as the `local` boolean in `browser_exec` schema [8]. Without consent (`local=true` but the config flag off) the dispatcher errors: *"local=true was requested but browser.use_real_profile is off"* [8].

> Only Camofox has **no CDP surface** — it uses a custom REST API, so `browser_use_cli` cannot drive it; Camofox forces the built-in tools [8][12].

### 1.4 Browser Use CLI 3.0 (`browser_exec`) — The New Default

Added PR ~25214, `tools/browser_use_cli.py` (1k+ LOC) [8]. The switch is **automatic**:

* `browser.backend: "browser-use"` → Browser Use CLI mode (explicit).
* `browser.backend: "off"` → built-in tools (explicit opt-out).
* Unset (`""`) + `BROWSER_USE_API_KEY` present (legacy) → Browser Use CLI (migration shim).
* Unset + CLI runnable (`uv tool install browser-use` or `uvx browser-use` works) → **Browser Use CLI is the default** [8].
* Unset + CLI NOT runnable → silent downgrade to built-ins with a once-per-24h notice: *"Browser Use CLI not found — using the built-in browser tools. Run `hermes tools` … or `browser.backend: off` to silence this."* [8].

#### What `browser_exec` is

* Python executed **inside** the browser harness (Browser Harness, ~592-line self-healing harness [18]). Helpers are pre-imported; the model writes Python with helpers like `new_tab(url)`, `goto_url(url)`, `page_info()`, `js(expr)`, `fill_input(selector, text)`, `click_at_xy(x,y)`, `capture_screenshot()`, `cdp('Domain.method', …)`, `ensure_real_tab()` [8][18].
* `workspace` dir is `$BH_AGENT_WORKSPACE` (`~/.hermes/cache/browser-use/workspace/<task_id>`), persists across calls in the session, variables do NOT [8].
* For `local=true`, `_resolve_real_profile_cdp` must succeed; for cloud, `_resolve_backend_cdp` injects `BU_CDP_URL/WS` pointing at the provider's `cdp_url` [8].

#### Schema (from `tools/browser_use_cli.py:862-940`)

```json
{
  "name": "browser_exec",
  "parameters": {
    "code":     { "type": "string", "description": "Python code … helpers: new_tab, goto_url, page_info, js, fill_input, cdp, capture_screenshot…" },
    "local":    { "type": "boolean", "default": false, "description": "Drive the user's own local browser (a Hermes-managed copy of their real default-Chromium profile, logins/cookies included) instead of the configured cloud browser backend." },
    "session":  { "type": "string", "description": "Named isolated browser session — its own daemon and (on cloud backends) own browser…" },
    "timeout_s":{ "type": "integer", "default": 300, "description": "Max seconds to wait…" }
  }
}
```

* `session` isolation: on Browser Use cloud, each named session gets **its own browser**; on local/CDP override, named sessions share one browser but get **per-name tabs** via `_hermes_ensure_own_tab()` (creates an own `Target.createTarget` so two concurrent named daemons don't clobber the same tab) [8].
* Workspace advice baked into the description: *"For multi-item tasks ('all N products / every entry'), append each batch to a JSON/CSV file in the workspace, then read it back and aggregate in code"* [8].
* Subprocess hygiene: child inherits a **credential-scrubbed env** (strips provider keys, keeps only `BROWSERBASE_*`/`BROWSER_USE_*`/`FIRECRAWL_*`), PATH is floored with `/usr/local/bin`, `/opt/homebrew/bin`, `~/.hermes/node/bin`, `~/.local/bin`, and Homebrew `node@*/bin` [7][8]. Removes `PYTHONPATH/PYTHONHOME` to avoid venv ABI mismatch (pydantic_core) [8].

#### Install

* `browser_use_cli.install_cli()` runs `uv tool install browser-use` via the **managed uv** (`hermes_cli.managed_uv.ensure_uv()`), binary lands in `$HERMES_HOME/bin` (`UV_TOOL_BIN_DIR`), discovery order is `$HERMES_HOME/bin` → PATH → `~/.local/bin` → `uvx browser-use` [8]. Called automatically by `hermes tools` post-setup `browser_use_cli` [10].
* One-shot without install: `uvx browser-use <<'PY'\nnew_tab("https://example.com")\nprint(page_info())\nPY` [18].

#### Why the switch (Browser Use's stated rationale [18][19])

* **Token tax** — Playwright MCP snapshots are heavy (single screenshot ~15k tokens); Browser Use claims **~6× smaller output** by going straight to CDP (one websocket, no MCP layer) — `31k chars vs 5.5k chars` over six tests in their comparison [19].
* **Self-healing harness** — missing helper? The agent edits `agent_helpers.py` in `$BH_AGENT_WORKSPACE` at runtime and continues [18].

### 1.5 Built-in `browser_*` Tools (agent-browser / Playwright lineage)

When Browser Use CLI is off/Camofox, these run:

* `browser_navigate`, `browser_snapshot` (accessibility tree → refs `@e1` etc.), `browser_click`, `browser_type`, `browser_scroll`, `browser_press`, `browser_back`, `browser_console`, `browser_get_images`, `browser_vision`, plus CDP-gated `browser_cdp`/`browser_dialog` [7][13].
* `DEFAULT_COMMAND_TIMEOUT = 30`, `MIN_OPEN_TIMEOUT = 60`, `MIN_FIRST_OPEN_TIMEOUT = 120` — cold daemon + Chromium launch takes time [7].
* `DEFAULT_SNAPSHOT_THRESHOLD = 15000`, `MAX_STORED_SNAPSHOT_CHARS = 2_000_000` — snapshot and `web_extract` share the same truncate-and-store pattern; full content lands in `~/.hermes/cache/web/` for paging via `read_file` [7].
* Special env scrubbing: only `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`, `BROWSER_USE_API_KEY`, `FIRECRAWL_API_KEY`, `FIRECRAWL_API_URL`, `FIRECRAWL_BROWSER_TTL` pass through to the `agent-browser` Node subprocess [7].

### 1.6 CDP — the Raw Escape Hatch

* Endpoint forms accepted by `_resolve_cdp_override`: `ws://host:port/devtools/browser/...` (full), `http://host:port` or `http://host:port/json/version` (discovery), bare `ws://host:port` [7]. Discovery fetches `/json/version` → `webSocketDebuggerUrl`.
* `cdp('Domain.method', **kwargs)` inside `browser_exec` is the same idea — raw CDP, e.g. `cdp('DOM.getBoxModel', backendNodeId=n)` after `cdp('Accessibility.getFullAXTree')` [8].
* `browser_cdp` tool (outside Browser Use) is only registered when a CDP endpoint is reachable at session start; cloud CDP URLs are per-session, `BU_CDP_WS/URL` contract [7][12].
* Raw CDP enables cookie/network control, iframe eval, `Target.createTarget`, dialog handling. When no CDP endpoint exists (default agent-browser headless without `/browser connect`), `browser_cdp` simply does not appear in the prompt [12].

### 1.7 Backend Registry & Selection (`agent/browser_registry.py`)

File `agent/browser_registry.py:1-35` documents the precedence [14]:

```
1. browser.cloud_provider in config.yaml (explicit override)
   - "local" → None (cloud disabled)
   - otherwise: return registered provider by that name even if is_available()==False (so the error is "X_API_KEY not set", not a silent switch)
2. Legacy preference walk, filtered by availability:
     browser-use → browserbase
     (firecrawl is NOT in the walk — must be explicitly set)
3. None → fallback to local browser mode
```

Notes:

* No single-eligible shortcut here (unlike web) — intentional, because `FIRECRAWL_API_KEY` is shared with the web plugin, and auto-selecting Firecrawl as a browser would surprise users who set it only for extraction [14].
* `registry_generation(scope?)` fingerprints the registry for prompt caching — a registration change invalidates the cached tool list [14].
* `get_provider(name, scope?)` and `list_providers(scope?)` are scope-aware (`hermes_home_key()` per profile) [14].

### 1.8 Real Profile, Isolation, Timeouts, Snapshots

* **Real profile:** `browser.use_real_profile: true`, `browser.inactivity_timeout: 120`, `browser.allow_private_urls: true`, `browser.use_real_profile: true`, `browser.cloud_provider: nous` are the only browser keys in `~/.hermes/config.yaml` [16]. `browser.cdp_url`, `browser.command_timeout`, `browser.snapshot_threshold`, `browser.record_sessions` are also read [7].
* **Isolation:** `terminal.backend` is `local` by default; browser sessions are per-`task_id` (or per `browser_exec.session` name). The `BU_NAME` env derives from the session name; `~/.hermes/cache/browser-use/workspace/<safe_task_id>` is the per-task scratch dir, task_id sanitized via `[^A-Za-z0-9._-]+ → _` and capped at 80 chars [8]. `_hermes_ensure_own_tab` marker is keyed by `(BU_NAME, daemon_pid)` so a daemon restart re-pins [8].
* **Timeouts:** see §1.5; `browser_exec.timeout_s` defaults 300, clamped 5–1800 [8].
* **Snapshots:** truncation notice "full text saved to … read_file(`path`)" is the same phrasing web_extract uses — the model pages the middle with `read_file` [7].

---

## 2 — `hermes_web_search` & `web_extract`

### 2.1 Provider ABC (`agent/web_search_provider.py`)

One ABC, all web backends inherit it [1]:

```python
class WebSearchProvider(abc.ABC):
    @property
    def name(self) -> str: ...                 # web.search_backend / web.extract_backend value
    @property
    def display_name(self) -> str: ...        # shown in hermes tools
    def is_available(self) -> bool: ...       # cheap — NO network calls
    def is_keyless_available(self) -> bool: ... # keyless free tier? (only for ring vendors)
    def supports_search(self) -> bool: ...    # default True
    def supports_extract(self) -> bool: ...   # default False
    def search(self, query, limit=5) -> dict: ...   # → {"success": True, "data": {"web": [{title, url, description, position}]}}
    def extract(self, urls, **kwargs) -> list: ... # → [{url, title, content, raw_content, metadata, error?}]
    def get_setup_schema(self) -> dict: ...   # → {name, badge, tag, env_vars:[{key, prompt, url}]}
```

Helper `get_provider_env(name)` resolves via `hermes_cli.config.get_env_value(name)` (checks `os.environ` **then** `~/.hermes/.env`) with `os.getenv` fallback — so a key set via `hermes tools` is visible even in delegate children without being exported [1].

Response shape is frozen from the legacy `tools/web_tools.py` contract [1]:

```python
# search
{"success": True, "data": {"web": [{"title": str, "url": str, "description": str, "position": int}]}}
# extract
[{"url": str, "title": str, "content": str, "raw_content": str, "metadata": {"sourceURL": str, "title": str}, "error"?: str}]
```

### 2.2 The Plugin-Registered Backends (8 built-ins + keyless ring)

From `plugins/web/<vendor>/plugin.yaml` (`kind: backend`, `provides_web_providers: [name]`) and `tools/web_tools.py: _LEGACY_WEB_BACKENDS`:

| Plugin dir | `provider.name` | Search | Extract | `is_available()` probes | Notes |
|------------|-----------------|--------|---------|-------------------------|-------|
| `plugins/web/searxng` | `searxng` | ✅ | ✅ (local fetch via `_searxng_html_to_text`) | `SEARXNG_URL` set | search-only originally, now also local fetch+parse with stdlib HTMLParser [2] |
| `plugins/web/exa` | `exa` | ✅ | ✅ | `EXA_API_KEY` set (keyed) **or** `is_keyless_available()` (anonymous) [20] | uses `exa_py` SDK (lazy-loaded) |
| `plugins/web/brave_free` | `brave-free` | ✅ | ❌ | `BRAVE_SEARCH_API_KEY` | 2k queries/month free tier |
| `plugins/web/tavily` | `tavily` | ✅ | ✅ | `TAVILY_API_KEY` **or** explicitly configured (see `_tavily_explicitly_configured`) | has self-host note-free pricing; keyless available |
| `plugins/web/firecrawl` | `firecrawl` | ✅ | ✅ | `FIRECRAWL_API_KEY` or `FIRECRAWL_API_URL` or `_is_tool_gateway_ready()` (Nous) | Nous gateway re-export, self-hosted `FIRECRAWL_API_URL` |
| `plugins/web/parallel` | `parallel` | ✅ | ✅ | `PARALLEL_API_KEY` | keyless via `search.parallel.ai/mcp` |
| `plugins/web/ddgs` | `ddgs` | ✅ | ❌ | `ddgs` Python package importable | DuckDuckGo, zero credentials, local `ddgs` package |
| `plugins/web/keenable` | `keenable` | ✅ | ✅ | `KEENABLE_API_KEY` | `api.keenable.ai`, has keyless `api.keenable.ai/v1/search/public` + `/v1/fetch/public` |
| `plugins/web/xai` | `xai` (not in `_LEGACY_WEB_BACKENDS` whitelist — separate probe via `has_xai_credentials`) | ✅? | ❌ | `has_xai_credentials()` (env `XAI_API_KEY` OR `auth.json` OAuth) | not a `WebSearchProvider` in legacy walk — separate |

**Keyless ring vendors** (all five have an anonymous free tier via `plugins/web/keyless_mcp.py`): `exa`, `parallel`, `tavily`, `firecrawl`, `keenable` [3]. Their `is_keyless_available()` respects `web.provider_tier.<name>: "paid"` (forces keyed) and `web.provider_tier.<name>: "free"` (forces keyless) plus global `web.keyless_fallback: false` (disables entire ring) [3].

### 2.3 SearXNG (free · self-hosted) — The Docker-on-8889 Story

* **What it is:** Privacy-respecting **metasearch** engine — aggregates 70+ engines (Google, Bing, DuckDuckGo, etc.), no API key, self-hosted [21][22]. Hermes calls `GET {SEARXNG_URL}/search?format=json&q=...&pageno=1`, sorts by `score`, caps to `limit` [2].
* **Config:** `SEARXNG_URL=http://localhost:8080` (or wherever the Docker container binds) [2]. The bundled `plugin.yaml` badge is `"free · self-hosted"` with prompt `"SearXNG instance URL (e.g. http://localhost:8080)"` [23].
* **Why 8889?** Upstream SearXNG Docker default is **`8080` inside container → `8888` on host** in the docs example [21][22]. In this environment `.env` used `SEARXNG_URL=http://127.0.0.1:8080`; Hermes docs also reference `http://localhost:8080` [2][21]. Many operators map to `8888` or **`8889`** to avoid colliding with the Hermes dashboard (`:9119`) or other services. The Lokma task explicitly mentions *"self-hosted SearXNG docker on 8889"* — so Lokma's default should be `http://localhost:8889` with an easy override (see §C). The two values are the same software, different host ports — **the container still listens on 8080**.
* **Search impl:** `SearXNGWebSearchProvider.search()` via `httpx.get({SEARXNG_URL}/search, params={q, format:json, pageno:1})` [2].
* **Extract impl:** Despite the original "search-only" comment, current code **does extract** — `supports_extract()` returns `bool(SEARXNG_URL)` and `extract(urls)` fetches each URL directly with `urllib.request` + `ssl.create_default_context(verify_mode=CERT_NONE)` and parses via the **stdlib-only** `_SearxngTextExtractor(HTMLParser)` (strips `script/style/noscript/svg/template/iframe`, flattens block tags) [2]. The SearXNG nginx is treated as the egress proxy hint (`egressVia: {SEARXNG_URL}/`).
* **Self-host setup** per upstream [21][22][24]:
  ```sh
  # Docker Compose (recommended) — see [21] https://docs.searxng.org/admin/installation-docker.html
  docker run --name searxng -d \
    -p 8889:8080 \
    -v "./config/:/etc/searxng/" -v "./data/:/var/cache/searxng/" \
    docker.io/searxng/searxng:latest
  # Accessible at http://localhost:8889 → SEARXNG_URL=http://localhost:8889
  ```
  Or full compose with Valkey (bot limiter) — see Appendix C. Docs warn: set `SEARXNG_SECRET_KEY` (`openssl rand -hex 32`) and `SEARXNG_BASE_URL` to the public URL; if using Valkey update `settings.yml` `redis.url` to `valkey://valkey:6379/0` [24].

### 2.4 Exa (paid + keyless MCP fallback)

* **Paid:** `EXA_API_KEY` at https://exa.ai; SDK `exa_py` lazy-loaded via `tools.lazy_deps.ensure("search.exa")` [20]. Search uses `client.search(query, num_results=limit, contents={"highlights": True})`; highlights are `4000 chars, 10× token-efficient` [20][25]. Extract uses `client.get_contents(urls, text=True)` [20].
* **Pricing:** Pay-as-you-go, no subscription; new accounts get **$20 free (~2,800 searches)**, plus $10/month free tier [25].
* **Keyless:** Public MCP endpoint `https://mcp.exa.ai/mcp` — tool `web_search_exa` (`{query, numResults}`) returns formatted text blocks `Title:/URL:/…/Highlights:` parsed by `_parse_exa_search_text` [3]; `web_fetch_exa` returns one combined text per URL (called per-URL) [3]. Transport is `POST {jsonrpc:2.0, method:"tools/call", params:{name, arguments}}` with `Accept: application/json, text/event-stream`, body parsed from either plain JSON or `data: {...}` SSE lines, with `KeylessMCPError` for `isError`/`rate limit` shapes [3].
* **Hierarchy:** `is_available()` is **keyed only** — it deliberately does **not** consider the keyless tier, or "lower-priority backends with real credentials would be routed onto Exa's anonymous tier" [20]. `is_keyless_available()` is the separate signal read only when the keyed walk yields nothing (see §5.3). When `web.provider_tier.exa: "paid"` is set, the keyless path is forced off [3].
* **Message on failure:** keyless errors surface as *“Keyless Exa search failed: … Set EXA_API_KEY (https://exa.ai) or another web backend via `hermes tools` …”* [3].

### 2.5 Brave Free, Tavily, Firecrawl, Parallel, DDGS, Keenable, xAI

* **Brave Free** (`brave-free`) — `BRAVE_SEARCH_API_KEY` at https://brave.com/search/api/, yields ~2k queries/month; search-only [2b]. Badge `"free"` in picker.
* **Tavily** — `TAVILY_API_KEY` at https://app.tavily.com; keyless via `POST https://api.tavily.com/search` + `/extract` with `X-Client-Name: hermes-agent`, `X-Tavily-Access-Mode: keyless` [3]. Available without a key when explicitly configured (`_tavily_explicitly_configured`) [20b].
* **Firecrawl** — `FIRECRAWL_API_KEY` (https://firecrawl.dev) or `FIRECRAWL_API_URL=http://localhost:3002` (self-hosted), or **Nous gateway** (managed) — same pattern as web search for web gateway [7][15]. Keyless via `_KeylessFirecrawlClient()` [3]. Also reachable as `browser.cloud_provider: firecrawl` for browser, but never auto-selected [14].
* **Parallel** — `PARALLEL_API_KEY` (https://parallel.ai); keyless via `https://search.parallel.ai/mcp` tool `web_search` (`{objective, search_queries, session_id}`) and `web_fetch` (`{urls, objective, session_id}`), `_SESSION_ID = uuid.uuid4().hex` per process, not derived from user/machine [3].
* **DDGS** — zero credentials, only `import ddgs` must succeed [20b]. Search-only.
* **Keenable** — `KEENABLE_API_KEY` (https://keenable.ai); keyless via `POST https://api.keenable.ai/v1/search/public` (`{query, max_results}`) with `X-Keenable-Title: hermes-agent` plus `GET /v1/fetch/public?url=…` [3]. Response shapes `{results: [{title,url,snippet}]}` / `{url,title,content}`.
* **xAI** — env `XAI_API_KEY` **or** `auth.json` SuperGrok OAuth; cheap probe `has_xai_credentials()` avoids network — must not call `resolve_xai_http_credentials()` in the hot `is_available` path [20b].

### 2.6 Search vs Extract Capability Split

`supports_search()` / `supports_extract()` gate every resolution step [1][14]:

* Search-only providers (`brave-free`, `ddgs`) correctly **fall through** when set as `web.extract_backend` — the registry re-resolves the other capability instead of forcing search-only as extract [14].
* Multi-capability providers (`firecrawl`, `tavily`, `exa`, `parallel`, `keenable`, `searxng` via local fetch) advertise both [1][2][20].
* Config keys reflect this: `web.backend` (shared fallback) vs `web.search_backend` / `web.extract_backend` (per-capability overrides) — strict, stored name wins even if unavailable (so the error is precise) [20b][14].

### 2.7 Request / Response Shapes & `hermes_tools` Wrappers

* Tool names in `tools/web_tools.py`: `web_search_tool`, `web_extract_tool` — registered as `hermes_web_search` / `web_extract` in the model prompt (aliases vary by toolset) [20b]. They accept `site:`, `filetype:`, `intitle:`, `-term`, `"exact phrase"` operators — passed through verbatim to the backend when supported [1].
* After the plugin migration, `tools/web_tools.py` keeps **re-exports** for backward compat (`Firecrawl`, `_get_exa_client`, `_tavily_request`, etc.) so `mock.patch("tools.web_tools.Firecrawl")` still works [20b].
* `execute_code` helper `hermes_tools` exposes `web_search(query, limit=5) → {"data":{"web":[...]}}` / `web_extract(urls, char_limit=None) → {"results": [{"url","title","content","error"}]}` — same Markdown, no LLM summarization; over-budget pages are head+tail truncated with the full text saved to disk (path in footer) [1][13]. `char_limit` default 15000 per page.

### 2.8 Caching, Private URLs, Blocklist

* **Web extract cache:** `web.cache_enabled: true` (default), `web.cache_ttl_minutes: 20` (clamped 1–1440), `web.cache_exempt_hosts: ["mysite.vercel.app", "*.ngrok-free.app"]` (exact, wildcard, suffix) [27]. HTML-cached results re-run truncation so a different `char_limit` works off the same stored scrape. Blocklisted domains are never served from cache [27].
* **Local-dev bypass:** Any `localhost`, `127.0.0.1`, `*.local`, single-label LAN hostnames, private/link-local IPs (`192.168.*`, `10.*`, `172.16-31.*`) bypass the cache entirely — every fetch is live (only reachable at all when `security.allow_private_urls: true`) [27].
* **Security:** `security.allow_private_urls`, `security.website_blocklist` gate `web_search`, `web_extract`, `browser_navigate` and all URL-capable tools (SSRF guard, see [27]). Blocked fetches error with a clear domain-blocked message.

---

## 3 — How Setup Configures Them

### 3.1 `hermes setup` vs `hermes tools` vs `hermes config`

| Command | Scope | What it touches |
|---------|-------|-----------------|
| `hermes setup` | first-run wizard (provider+model, `hermes tools` sub-flow, hooks) [10] | picks interactive vs platform vs `setup --portal` (Nous) |
| `hermes tools` | **the** configuration UI for toolsets | TUI checklist + per-provider picker; writes `config.yaml` `platform_toolsets` + `web.*`/`browser.*` + `.env` keys |
| `hermes tools list/enable/disable/post-setup` | CLI | scriptable toolset control, post-setup hook runner |
| `hermes config get/set/unset/show/edit` | raw config | dot-path access to any `config.yaml` key |

`hermes setup` delegates its web/browser steps to the same `hermes_cli/tools_config.py` flow that `hermes tools` uses — no separate code path [10]. `hermes tools` without args opens the interactive UI; for docs the flow is documented under "Quick setup via `hermes tools`" [27].

### 3.2 Env Vars (`SEARXNG_URL`, `EXA_API_KEY`, `BROWSER_USE_*`, …)

Every backend's availability probe is a **cheap `get_env_value` / `get_secret` check**, not a network call [1][14]. The canonical table (from provider docs + code):

#### Web

| Env var | Backend | Meaning | Where to get |
|---------|---------|---------|--------------|
| `SEARXNG_URL` | `searxng` | URL of self-hosted instance, e.g. `http://localhost:8889` | your Docker [21][22] |
| `EXA_API_KEY` | `exa` | `x-api-key` / `Authorization: Bearer` [25] | https://exa.ai → dashboard |
| `BRAVE_SEARCH_API_KEY` | `brave-free` | Data-for-Search free key (2k/mo) | https://brave.com/search/api/ |
| `TAVILY_API_KEY` | `tavily` | Tavily key (optional; explicit config works without) | https://app.tavily.com |
| `FIRECRAWL_API_KEY` | `firecrawl` | Cloud Scrape key | https://firecrawl.dev |
| `FIRECRAWL_API_URL` | `firecrawl` (self-host) | Private instance base, e.g. `http://localhost:3002` | `ghcr.io/mendableai/firecrawl` |
| `PARALLEL_API_KEY` | `parallel` | Parallel key | https://parallel.ai |
| `KEENABLE_API_KEY` | `keenable` | Keenable key | https://keenable.ai |
| `XAI_API_KEY` | `xai` | xAI free tier | https://console.x.ai |
| `FIRECRAWL_API_URL` | `firecrawl` (self-host) | Alt for self-host (same row includes) | local Docker |

#### Browser

| Env var | Backend | Meaning |
|---------|---------|---------|
| `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` | `browserbase` | Direct credentials (no Nous gateway) [15b] |
| `BROWSERBASE_BASE_URL` | `browserbase` | Alt API origin, default `https://api.browserbase.com` |
| `BROWSERBASE_PROXIES` | `browserbase` | `true`/`false`, default true |
| `BROWSERBASE_ADVANCED_STEALTH` | `browserbase` | `false` unless Scale plan |
| `BROWSERBASE_KEEP_ALIVE` | `browserbase` | `true` default |
| `BROWSERBASE_SESSION_TIMEOUT` | `browserbase` | seconds, max 21600 |
| `BROWSER_USE_API_KEY` | `browser-use` | Direct key (https://browser-use.com) [15] |
| `CAMOFOX_URL` | `camofox` | Local anti-detection server, default `http://localhost:9377` |
| `BU_CDP_URL` / `BU_CDP_WS` | any (harness) | CDP attach URL for Browser Use harness [8] |
| `BROWSER_CDP_URL` | any | Hermes config alias for above |
| `AGENT_BROWSER_ARGS` | `agent-browser` | e.g. `--no-sandbox,--disable-dev-shm-usage` for Docker/root |

#### Cross-cutting

* `HERMES_HOME` — overrides `~/.hermes` (profile-scoped registry etc.) [14].
* `WEB_TOOLS_DEBUG` — when `true`, writes `web_tools_debug_<UUID>.json` under `./logs` with all tool calls + compression metrics [20b].
* `SEARXNG_*` — SearXNG container also respects `$SEARXNG_SECRET` and `$SEARXNG_BASE_URL` inside the Docker instance [21].

> **Critical nuance:** Hermes never sources web/browser keys from `os.environ` directly in the "happy path" — it calls `hermes_cli.config.get_env_value(name)` which checks `os.environ` **and** `~/.hermes/.env` (written by `hermes tools` via `save_env_value`) [1][2]. The `os.getenv` fallback only fires when the config module is unavailable (stripped installs). This is why delegate children, gateway sessions, and cron workers see keys even when the parent shell never exported them — issue #40190 [1].

### 3.3 `config.yaml` Keys (`web.*`, `browser.*`, `security.*`)

From `~/.hermes/config.yaml` on the inspected machine (v39) [16]:

```yaml
# ── Web (search + extract share the section) ─────────
web:
  backend: searxng                 # shared fallback (pre-migration)
  search_backend: searxng          # explicit per-capability (new)
  extract_backend: searxng         # can be different from search_backend
  search_backend: "searxng"        # explicit per-capability override (takes precedence over backend)
  extract_backend: "exa"           # e.g. SearXNG search + Exa extract is valid
  keyless_fallback: true           # default true — enables anonymous ring when zero credentials
  keyless_rescue: true             # default true — one-shot rescue when a keyed backend fails
  provider_tier:                   # per-vendor free/paid pin (rows from hermes tools)
    exa: free      # forces keyless Exa even when EXA_API_KEY is set
    tavily: auto   # auto = keyed when key present else keyless
    firecrawl: paid # forces keyed; excludes from ring
  search_backend: searxng          # legacy single key fallback [16][14]
  extract_backend: firecrawl       # per-capability keys documented in [27]
  cache_enabled: true
  cache_ttl_minutes: 20            # 1–1440
  cache_exempt_hosts:
    - mysite.vercel.app
    - "*.ngrok-free.app"

# ── Browser ──────────────────────────────────────────
browser:
  backend: browser-use             # "" = unset→auto, "browser-use", "off" (yaml 1.1: unquoted off == boolean false)
  cloud_provider: nous             # explicit cloud after migration: browserbase|browser-use|firecrawl|nous
  command_timeout: 30              # seconds per browser command (floor 5)
  snapshot_threshold: 15000        # chars before truncation, floor 1000
  record_sessions: false           # WebM to ~/.hermes/browser_recordings/
  cdp_url: http://localhost:9222   # optional fixed CDP override (see also BU_CDP_URL env)
  use_real_profile: true           # consent for local=true profile copy
  allow_private_urls: true
  inactivity_timeout: 120
  dialog:
    policy: must_respond
    timeout_s: 30

# ── Security ─────────────────────────────────────────
security:
  allow_private_urls: true
  allow_data_training_tiers_noninteractive: true
  website_blocklist:               # blocks web_search/web_extract/browser_navigate
    - internal.corp.example

# ── Toolsets (which tools the model sees) ───────────
platform_toolsets:
  cli: [web, browser, terminal, file, code_execution, vision, image_gen, todo, memory, ...]
  telegram: [ ... ]                # per-platform, platform_toolsets.* [10]
```

Exact keys the web registry reads: `web.search_backend`, `web.extract_backend`, `web.backend`, `web.keyless_fallback`, `web.keyless_rescue`, `web.provider_tier.<name>`, `web.cache_*` [14][27]. Browser registry reads `browser.cloud_provider`, `browser.backend` [14].

YAML `1.1` quirk for `browser.backend: off` — unquoted `off` parses as boolean `false` → dispatched as `BACKEND_DISABLED` (`"off"`) vs `""` (unset → auto-detect) vs `"browser-use"` (explicit) [8].

### 3.4 The `.env` Layer (`hermes_cli.config.get_env_value`)

* File: `~/.hermes/.env` (or `$HERMES_HOME/.env` when `HERMES_HOME` is set). Created by `hermes tools` via `save_env_value(key, value)`; the value is appended/updated as a plain `KEY=VALUE` line [10].
* Read path: `_env_value(name)` tries `get_env_value(name)` first (merged `os.environ` ∪ `.env`), falls back to `os.getenv` [1][2]. Both `_has_env()` and `_is_backend_available()` go through this helper, so a key set only in `.env` makes the backend available [20b].
* Secrets variant: browser cloud keys also flow through `agent.secret_scope.get_secret` (which layers `auth.json` OAuth + `.env`) [15]. Provider setup schemas expose `env_vars: [{key, prompt, url}]` per vendor so the picker knows what to prompt [6].
* Never put non-credential settings in `.env` — the skill warns: *"Secrets in `.env`, settings in `config.yaml`"* [16].

### 3.5 Post-Setup Hooks (`agent_browser`, `browser_use_cli`, …)

After `hermes tools` writes config+`.env`, it runs `TOOL_CATEGORIES[toolset].providers[i].post_setup` if present [10]:

| `post_setup` | What it does | CLI |
|--------------|--------------|-----|
| `agent_browser` | `npx agent-browser install --with-deps` → downloads Chromium + system libs; also installs the agent-browser CLI via `npm install -g agent-browser` | `hermes tools post-setup agent_browser` |
| `browserbase` | installs the agent-browser CLI only (no local Chromium — Browserbase hosts it) | `hermes tools post-setup browserbase` |
| `browser_use_cli` | `uv tool install browser-use` via managed uv (`UV_TOOL_BIN_DIR=$HERMES_HOME/bin`) | `hermes tools post-setup browser_use_cli` |
| `firecrawl` | installs local SearXNG? no — Firecrawl cloud has no hook | — |
| `camofox`, `cua_driver`, `faster_whisper`, `kittentts`, etc. | per-feature | |

From `TOOL_CATEGORIES` in `hermes_cli/tools_config.py` [10]:

* `web` — only two post-setup rows: `"Nous Subscription"` (`web_backend: firecrawl` + `requires_nous_auth`) and `"Firecrawl Self-Hosted"` (prompt `FIRECRAWL_API_URL`). All other web vendors are injected via `_plugin_web_search_providers()` at runtime — no hook needed.
* `browser` — four rows: `"Local Browser"` (`browser_provider: local`, `post_setup: agent_browser`), `"Nous Subscription (Browser Use cloud)"` (`browser_provider: browser-use`, managed, `post_setup: browserbase` — the comment explains *"'agent_browser' would forever read 'needs setup' on a machine without local Chromium"* [10]), `"Camofox"` (`post_setup: camofox`), `"Browser Use"` (`browser_backend: browser-use`, `post_setup: browser_use_cli`).

### 3.6 Nous Tool Gateway (subscription-billed routing)

* One OAuth login (`hermes setup --portal` → `hermes model` → Nous Portal) covers **300+ models plus Tool Gateway** (web search, image generation, TTS, cloud browser) [16].
* For web: provider `firecrawl` is the gateway target — `FIRECRAWL_API_KEY` can be a derived `firecrawl-gateway.<domain>` token when the subscription routes there (`_get_firecrawl_gateway_url`, `_is_tool_gateway_ready`) [20b]. For browser: provider `browser-use` is the gateway target (`tool_gateway.browser: gateway`, idempotency key `browser-use-session-create:<uuid>`, `timeout: 5` minutes) [15].
* The picker shows "Nous Subscription" rows with `requires_nous_auth: true` and `managed_nous_feature: "web"|"browser"|"image_gen"` — selecting them does not prompt for a vendor key, just ensures the OAuth token exists, and stores `web.backend: firecrawl` / `browser.cloud_provider: browser-use` with the `nous` entitlement [10].
* Auto-detect ladder explicitly prefers **explicit user keys over the managed gateway probe** so a deliberate setup is not pre-empted by a subscription whose tier doesn't actually grant web access [20b].

### 3.7 Docker & First-Run Bootstrap

* `scripts/install.sh` supports `--skip-browser` to skip the agent-browser/Playwright bootstrap (headless use) [16].
* `docker-compose.yml` runs with `--network=host` so the OAuth callback `127.0.0.1` is reachable from the host browser [16].
* `AGENT_BROWSER_ARGS=--no-sandbox,--disable-dev-shm-usage` is the documented workaround for Chromium sandbox launch failures on slow/Linux/Docker hosts [7].
* Server-side logs for gateway/browser are under `~/.hermes/logs/`; session transcripts under `~/.hermes/sessions/` + `state.db` (SQLite+FTS5) [16].

---

## 4 — browser-use vs Playwright vs CDP — Differences

### 4.1 CDP (Chrome DevTools Protocol)

* URL: `https://chromedevtools.github.io/devtools-protocol/` — cited in `browser_cdp` tool docs [13].
* It's the **wire protocol** Chrome exposes over a WebSocket (`ws://host:port/devtools/browser/<id>`). Methods like `DOM.getBoxModel`, `Accessibility.getFullAXTree`, `Target.createTarget`, `Page.navigate`, `Runtime.evaluate` are the primitive ops [8]. Everything else (Playwright, agent-browser, Browser Harness, Puppeteer) speaks CDP under the hood.
* Pros: complete control, lowest token overhead (~6× smaller than Playwright MCP per Browser Use claim [19]), one websocket "nothing between" [19].
* Cons: imperative, no wait-for-element, no high-level assertions; the agent must handle retries/waits itself; fingerprint can be detected without stealth.

### 4.2 Playwright / agent-browser

* `agent-browser` is Hermes's Node wrapper around **Playwright** (Chromium). It exposes `browser_navigate/snapshot/click/type/scroll` as high-level verbs backed by Playwright + the accessibility tree [7]. Screenshot modes use the ariaSnapshot (text-based representation, ideal for LLMs without vision) [7].
* Playwright MCP variant: popular in Claude Code; but every screenshot/DOM snapshot inflates context — Browser Use's comparison: six tests = **31k chars (Playwright MCP) vs 5.5k chars (CDP CLI)** → ~7.8k vs 1.4k tokens at 4 chars/token → **5.7×** [19].
* Hermes `agent-browser` resolves lazily via `npx` and installs Chromium on demand; `browser_tool.py` floors PATH, handles sandbox bypass, timeouts, snapshot truncation [7].
* Used when Browser Use CLI is off/Camofox, or as the Chrome host that Browser Use's CDP harness attaches to when no cloud is selected [12].

### 4.3 Browser Use CLI 3.0 / Browser Harness

* Repo: `https://github.com/browser-use/browser-use` [26].
* Docs: `https://docs.browser-use.com/open-source/browser-use-cli` (CLI), `https://docs.browser-use.com/llms.txt` (index), `https://github.com/browser-use/browser-harness` (harness) [12][18][26].
* `browser-use` the Python library vs `browser-use` the CLI: the CLI is a **thin harness** that connects an LLM directly to a CDP endpoint with helpers (`new_tab`, `page_info`, `js`, `fill_input`, `cdp`, `capture_screenshot`). The Python library is for repeatable automation/scheduling; the CLI is for one-off agent tasks [26].
* **Three modes** (same CLI) [12][18]:
  1. Local Chrome — attaches via `BU_CDP_URL` / `BU_CDP_WS`; preserves tabs/cookies/extensions/logins.
  2. Browser Use cloud — managed Chromium with stealth, residential proxies, CAPTCHA solving, persistent profiles [12].
  3. Any CDP URL — `BROWSER_CDP_URL`, Playwright-launched browsers, managed Chrome.
* **Self-healing**: harness writes `agent_helpers.py` into `$BH_AGENT_WORKSPACE`; the agent can edit it at runtime if a needed helper is missing [19].
* **Skill install**: `uv tool install --python 3.12 --upgrade --force 'browser-use @ git+https://github.com/browser-use/browser-use.git'` + `browser-use skill install` [18].

### 4.4 Comparison Table

| Axis | CDP (raw) | Playwright / agent-browser (`browser_*`) | Browser Use CLI (`browser_exec`) |
|------|-----------|-------------------------------------------|----------------------------------|
| Abstraction | **Protocol primitives** (`cdp('DOM.…')`) | High-level verbs (`browser_click(@e5)`) | **Python harness** (`new_tab`, `js`, `cdp`) — low-level but with helpers |
| Host | needs a **running browser + websocket** | **launches its own** headless Chromium (or attaches via `/browser connect`) | **attaches** to whatever browser the dispatcher gave it (local/cloud/CDP) |
| Install | none (Chrome already has CDP) | `npx agent-browser install --with-deps` | `uv tool install browser-use` (or `uvx browser-use`) |
| Token / perf | lowest — plain text + no MCP overhead | higher — Playwright MCP snapshots are verbose (~6× [19]) | lowest — one CDP websocket, self-healing helpers |
| Isolation | manual (`Target.createTarget`) | per-task session, `agent-browser --session <id>` | per-`task_id` workspace + named `session` → per-name daemon; on cloud each named session is its own browser [8] |
| Vision | `capture_screenshot()` + LLM native attach | `browser_vision` / `browser_get_images` | `capture_screenshot()` + native-vision fast-path (`_EMBED_MAX_DIMENSION`, `_EMBED_TARGET_BYTES`, JPEG ladder [8]) |
| Stealth / proxies / CAPTCHA | none (can add via flags) | agent-browser local → none; cloud Browserbase/Browser Use → via provider | Browser Use cloud proxies+stealth+captcha; Browserbase likewise; local none |
| When Hermes uses it | `browser_cdp` tool (gated) or inside `browser_exec` via `cdp()` helper | when `browser_use_cli` is **off** (Camofox or user opted out) | **default** when runnable, otherwise downgrades to built-ins |
| Works with Camofox? | ❌ (no CDP) | ✅ | ❌ |

### 4.5 When Hermes Uses Which

* Startup: `_is_browser_use_cli_mode()` [8]:
  ```python
  if camofox: return False
  if browser.backend == "browser-use": return True
  if browser.backend == "off": return False
  if legacy_bu_cloud_config: return True   # BROWSER_USE_API_KEY without backend key
  return find_cli() is not None             # default → CLI when runnable
  ```
* Web tasks: **always prefer `web_search`/`web_extract`** for retrieval; browser is for interaction (forms, dynamic content) [7][13].
* Camofox disables `browser_exec` entirely; Browser Use cloud still drives through the same harness, the choice of *browser host* (local vs cloud) is orthogonal to the choice of *driver* (harness vs built-ins) [8][12].

---

## 5 — Optional vs Required, Fallback Chains

### 5.1 Nothing Is Required — Everything Is a Gated Toolset

* Web and Browser are **configurable toolsets** in `hermes_cli/tools_config.py` (`CONFIGURABLE_TOOLSETS`) [10]. Their enable/disable lives in `platform_toolsets.<platform>` (default `cli`). `hermes tools` checklist lets the user untoggle any toolset without touching another [10].
* `hermes tools list` shows current state [16]:
  ```
  Built-in toolsets (cli):
    ✓ enabled  web       🔍 Web Search & Scraping
    ✓ enabled  browser   🌐 Browser Automation
    ...
    ✗ disabled stt       🎙️ Speech-to-Text   (config-only capability — not a prompt toolset)
  ```
* Tool schemas are **filtered by availability at prompt build** (`check_fn`): even when the toolset is enabled, `web_search` only appears if a web provider is resolvable, `browser_cdp` only when a CDP endpoint exists, etc. [13][14].
* The built-in fallback: **`duckduckgo-search` skill** (`fallback_for_toolsets: [web]`) auto-appears when no web provider is available, giving the agent a free search capability without any API key [9]. Setup picker calls this out: *"A free DuckDuckGo search skill is also included — skip this if you don't need a premium provider."* [10].

### 5.2 The Three-Layer Web Fallback (explicit → legacy walk → keyless ring)

The actual resolution in `tools/web_tools.py:_get_backend()` / `_get_capability_backend()` and `agent/web_search_registry.py:_resolve()` [20b][3]:

```
Layer 1 — Explicit config wins (strict, no probe)
  web.search_backend / web.extract_backend  (per-capability)
    fallthrough to
  web.backend                              (shared fallback)
    stored name is returned "as-is" even if is_available()==False
    → the vendor path can raise its honest "X_API_KEY not set" error
    → prevents silent rerouting when the user made an explicit choice

Layer 2 — Legacy preference walk, filtered by availability
  Only when no web selection has ever been stored (fresh install)
  AND selection_exists("web")==False would default to "firecrawl" instead.
  Otherwise walk priority order, first available wins:
    tavily (TAVILY_API_KEY)
    exa (EXA_API_KEY)
    parallel (PARALLEL_API_KEY)
    keenable (KEENABLE_API_KEY)
    firecrawl (FIRECRAWL_API_KEY or FIRECRAWL_API_URL or _is_tool_gateway_ready())
    searxng (SEARXNG_URL)
    brave-free (BRAVE_SEARCH_API_KEY)
    ddgs (import ddgs succeeds)
  → then plugin-registered non-legacy providers via list_providers() (is_available)
     (this catches custom ~/.hermes/plugins/web/<vendor> backends)

Layer 3 — Keyless free-tier ring (strictly last, zero credentials)
  Only when Layer 2 found nothing AND _keyless_tier_enabled() (web.keyless_fallback != false)
  Walk round-robin across:  exa → parallel → tavily → firecrawl → keenable
  Start point = ring cursor seeded by per-process random _SESSION_ID (fleet spreads evenly)
  Vendor pin overrides: web.provider_tier.<name>: free pins that vendor first; paid excludes it
  Fails over on throttle (is_rate_limitish: "rate limit|too many requests|429|quota exceeded|slow down")
  Non-throttle errors stop the walk (malformed queries fail everywhere)

Layer 4 — Default
  return "firecrawl"  (backward compat)  [20b]
```

The `agent/web_search_registry.py` view (the plugin-era authority, same precedence restated) [14]:

```python
_LEGACY_PREFERENCE = ("firecrawl", "parallel", "tavily", "exa", "searxng", "brave-free", "ddgs")
_KEYLESS_PREFERENCE = ("exa", "parallel", "tavily", "firecrawl", "keenable")
# _resolve(configured, capability):
#   1. configured name registered & capable → return it (ignoring is_available)
#   2. len(eligible)==1 → that one
#   3. walk _LEGACY_PREFERENCE filtered by is_available
#   4. walk _KEYLESS_PREFERENCE via is_keyless_available (unless keyless_fallback:false)
```

**Practical consequences:**

* A fresh install with **only `SEARXNG_URL` set** → Layer 2 returns `searxng`; search goes to that instance, extract uses the stdlib HTMLParser fetch even though SearXNG is nominally search-only [2].
* A fresh install with **no credentials at all** → Layer 2 yields nothing, Layer 3 round-robins into the keyless ring — the *next call* will use whichever ring vendor the cursor landed on, and a throttle (`429`) immediately fails over to the next ring vendor [3].
* An install with **explicit `web.backend: exa` but no `EXA_API_KEY`** → Layer 1 returns `exa` **without checking availability**, so `web_search` errors *"EXA_API_KEY not set. Get your key at https://exa.ai"* instead of silently falling back to SearXNG — this is intentional [14][20b].

### 5.3 Keyless Ring (Exa/Parallel/Tavily/Firecrawl/Keenable) & Round-Robin Failover

File `plugins/web/keyless_mcp.py` — ~600 LOC — is the entire anonymous tier [3]:

* **MCP transport:** `POST {url} {jsonrpc:"2.0", method:"tools/call", params:{name, arguments}}` with `Content-Type/Accept: application/json, text/event-stream`, body parsed from plain JSON or `data: {...}` SSE lines [3].
* **Parallel:** `https://search.parallel.ai/mcp` (`web_search` / `web_fetch`, `_SESSION_ID = uuid.uuid4().hex`) — random, never persisted, not a user ID [3].
* **Exa:** `https://mcp.exa.ai/mcp` (`web_search_exa` / `web_fetch_exa`) — parse blocks `"Title: …\nURL: …\nHighlights:\n<text>\n---\n"` via `_parse_exa_search_text` [3].
* **Tavily:** `POST https://api.tavily.com/search` / `/extract` with `X-Client-Name: hermes-agent`, `X-Tavily-Access-Mode: keyless` [3].
* **Firecrawl:** `_KeylessFirecrawlClient()` (public cloud API, no auth) [3].
* **Keenable:** `https://api.keenable.ai/v1/search/public` + `/v1/fetch/public?url=` with `X-Keenable-Title: hermes-agent` [3].
* **Ring:** `_KEYLESS_RING = ("exa","parallel","tavily","firecrawl","keenable")`, `_ring_cursor` seeded by `int(_SESSION_ID,16) % 5`, advanced under a `threading.Lock` per unpinned request [3]. Pinned vendor (explicit `web.*_backend` pointing at a ring member, or `provider_tier.<name>: free`) starts at that vendor's ring index; unpinned starts at the round-robin cursor [3].
* **Failover:** `search_with_failover(name, query, limit)` / `extract_with_failover(name, urls)` — rate-limit-shaped errors advance to the next ring vendor; non-throttle errors stop; result notes the serving vendor via `data.served_by` when failover happened; `all keyless vendors throttled: …` is the terminal error [3].
* **Rescue:** One-shot **keyless rescue** (`web.keyless_rescue`, default on) — when a *keyed* backend fails for non-rescue-eligible reasons, `web_tools._keyless_rescue_enabled` / `_rescue_eligible` lets the dispatcher retry once through the keyless ring (`_rescue_eligible` excludes ring vendors already in keyless mode, since they already walked the ring) [20b].
* **Kill switch:** `web.keyless_fallback: false` disables the entire anonymous tier (both the Layer-3 walk and rescue) [3][14]; per-vendor `web.provider_tier.<name>: paid` excludes that vendor's free endpoint from every ring [3].
* **Error on all paid pins:** *"All keyless web providers are pinned to paid tiers."* [3].

### 5.4 Browser Fallback (Browser Use CLI → built-ins → error)

* `tools/browser_use_cli.is_browser_use_cli_mode()` [8] is the top gate (see §1.4).
* If CLI mode true, `browser_exec` is the **sole** tool the model sees for browsing — built-in `browser_navigate` etc. are suppressed (`browser.backend: browser-use` hijacks the toolset) [8].
* If CLI mode false and a cloud provider is configured, `tools/browser_tool._get_cloud_provider()` resolves via `agent/browser_registry._resolve` (explicit `browser.cloud_provider` or `browserbase → browser-use` walk) and calls `provider.create_session(task_id)` → `cdp_url` [14].
* If the cloud call fails (missing key) the error is user-actionable: *"Browser Use requires a direct BROWSER_USE_API_KEY credential or a managed Browser Use gateway configuration"* [15], or *"Browserbase requires BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID"* [15b]. No silent fallback.
* If neither cloud provider is available/selected, local `agent-browser` mode is chosen — `agent_browser_runnable()` + `node_tool_runnable("agent-browser")` probes locate the binary, and `browser_tool` creates a per-task local session [7].
* If **nothing** is available (`hermes tools` → Browser Automation row shows "needs setup"), the toolset still registers but `browser_navigate` errors with the per-backend missing hint from `hermes_cli.setup:missing_browser_hint` [16].
* Post-setup confusion case: `get_setup_schema()` for Browser Use cloud returns `None` — it's hidden from the picker; the "Browser Use" row that the user sees now activates the **CLI backend** (`browser.backend: browser-use` + `post_setup: browser_use_cli`), while the cloud Browser Use provider stays registered for the `nous` gateway path / legacy `cloud_provider` configs [15].

### 5.5 Disabled-Plugin Diagnostics & Cache Notes

* When `web.extract_backend: firecrawl` is set but `plugins.disabled` lists `web/firecrawl`, the registry would normally emit a misleading *"No web extract provider configured. Set web.extract_backend to …"* — the fix is `agent/web_search_registry._disabled_web_plugin_for(configured, capability)` which detects `web/<vendor>` entries whose `loaded.error == "disabled via config"` and surfaces *"Re-enable the plugin"* instead (follow-up to #40190) [14].
* Normalization `brave-free` ⇄ `web/brave_free` (`_norm` replaces `-` with `_`, lowercases) covers every bundled provider without a hardcoded table [14].

---

## 6 — How Lokma Should Offer These During `lokma init`

### 6.1 Goals & Non-Goals

| Goal | Why |
|------|-----|
| Both subsystems are **opt-in checkboxes**, not mandatory | mirrors Hermes `CONFIGURABLE_TOOLSETS` / `platform_toolsets` — Lokma is usable with neither |
| Sane defaults that work with **zero API keys** | free tiers + self-hosted SearXNG + local Chromium |
| Don't break the Hermes env contract | reuse `SEARXNG_URL`, `EXA_API_KEY`, etc., so users migrating keep their `.env` |
| Single-command `lokma init` that mirrors `hermes tools` picker UX | avoids "set this env var manually is not an integration" failure [17] |
| Keep search vs extract capability split visible | advanced users want `search: searxng` + `extract: exa` [14] |
| Keep browser driver vs browser host split visible | `browser-use` CLI driver vs `agent-browser` built-ins vs cloud host [12] |
| Be Docker-friendly on this host | this VPS already runs `docker`/`podman`, so offer the SearXNG sidecar on `8889` directly |

Non-goals:

* No mandatory provider (Lokma must not block init when the user has no keys — the web tools should degrade to the keyless ring or DuckDuckGo skill, browser to local headless).
* No copy-pasted `config.yaml` — Lokma's config is `~/.lokma/config.yaml` (`~/.lokma/credentials.json` AES-GCM option deferred — see `Docs/26-CONFIG-and-CREDENTIALS.md`).

### 6.2 Proposed `lokma init` Flow (checkbox wizard)

UI inspiration: `hermes tools` uses `Ink`-style checklists + number-key provider rows [10], `hermes setup --portal` walks subscriptions [16]. Lokma can use the same pattern (Lokma TUI is `Ink` per `Docs/02-TEKNIK-KARARLAR.md` → `Bun + Ink TUI`) [Docs/02]:

```
lokma init                    # or lokma setup (alias)
─────────────────────────────────────────────────────
✓ Project detected: /mnt/apopic/lokma
  Stack: Bun + Ink TUI + Next.js + Fastify (choice A) [Docs/21]

? Core tools (always on):  file · terminal · code-execution · skills · todo · memory

? Additional toolsets (space to toggle, enter to confirm):
  ◉ Enable browser harness?        (🌐 Browser Automation — 🌐 browser_use / agent-browser)
  ◉ Enable web search & extract?   (🔍 Web Search — web_search / web_extract)
  ◯ Enable audio (TTS/STT)?
  ◯ Enable canvas / image generation?
─────────────────────────────────────────────────────  if user toggles ON → drill down:

? Browser harness — pick one (↑↓, enter):
  > Local Browser ★ recommended · free         (headless Chromium via agent-browser, no key)
    Nous Subscription (Browser Use cloud)       (needs lokma auth — routes via Hermes gateway if shared)
    Browser Use (CLI 3.0) ★ free · local·cloud (needs uv tool install — wraps local or cloud Chrome)
    Browserbase                                (needs BROWSERBASE_API_KEY + PROJECT_ID)
    Camofox                                    (needs CAMOFOX_URL, local Firefox fork)
    Skip for now (enable later with `lokma tools`)
  (when Local Browser picked → offer:  Install Chromium now? (agent-browser install --with-deps) [Y/n])

? Web search — pick a search backend (↑↓, enter):
  > SearXNG (free · self-hosted)  ★ recommended   (needs SEARXNG_URL — we can start Docker on :8889)
    Exa                                       (needs EXA_API_KEY — has anonymous fallback, rate-limited)
    Brave Search (free)                        (needs BRAVE_SEARCH_API_KEY — 2k/mo)
    Tavily                                    (works keyless; key raises limit)
    Firecrawl                                 (needs FIRECRAWL_API_KEY or self-host URL)
    Skip for now (DuckDuckGo skill stays available)

  → If SearXNG picked:
    SearXNG instance URL [http://localhost:8889]: ▮
    Start a local SearXNG container on :8889 now? [Y/n]  (docker compose up -d, see §C)
    (stores SEARXNG_URL in ~/.lokma/.env — or env export if --global)

  → If Exa picked:
    EXA_API_KEY (leave blank for anonymous free tier, rate-limited)
      [sk-…]: ▮  (tip: https://exa.ai → get $20 free)
      Provider tier:  auto  | free (force anonymous) | paid (force keyed)  [default auto]

  → If Brave picked:
    BRAVE_SEARCH_API_KEY [your brave key]: ▮  (https://brave.com/search/api/)

? Web extract — pick an extract backend (↑↓, enter):
  > Same as search                              (recommended — keeps one backend)
    SearXNG + local fetch (stdlib HTMLParser)   (free — works with search=SearXNG)
    Exa (highlights 4k chars, 10× token efficient)
    Firecrawl (Markdown, best extract quality)
    Tavily  (keyless extract available)
    Keenable (api.keenable.ai keyless)
    Skip extract (search-only, no web_extract)

? Caching & safety (advanced — defaults good for most):
  web.cache_enabled [true]: y
  web.cache_ttl_minutes [20]: ▮
  security.allow_private_urls [false → true to crawl localhost]: y (warning shown)
  security.website_blocklist (comma-separated) []: ▮

? Where to store keys?
  > ~/.lokma/.env (per-user, Hermes-style)   ★
    Export to shell now (os.environ only)
    Credentials store (encrypted — future: ~/.lokma/credentials.json AES-GCM)

─────────────────────────────────────────────────────
✓ Wrote ~/.lokma/config.yaml (web.browser.*, web.*, browser.*)
✓ Wrote ~/.lokma/.env (SEARXNG_URL=… / EXA_API_KEY=… if any)
✓ Post-setup: checked agent-browser (✓ found) / browser-use CLI (install with `lokma tools` → Browser)
✓ SearXNG container up on :8889 → http://localhost:8889/search?q=hello ✓
  Run `lokma doctor` to verify.
  Run `lokma tools` to reconfigure.
  Run `lokma` to start hacking.
```

**Why two checkboxes:**

* Teams that only code locally may want **browser off, web on** (fast, cheap retrieval).
* Teams that scrape/SPAs may want **browser on, web off** (or web off → DuckDuckGo skill fills search).
* Offering them independently lets `lokma doctor` check only the active subsystem and avoids "no credentials → error on init" friction.

**Ink / theme parity:** The picker uses the shared `themes/*.json` tokens (CLI Chalk vs Web CSS vars) so the same prompt renders correctly in `lokma` terminal vs `lokma web` browser harness [Docs/02/11].

### 6.3 `~/.lokma/config.yaml` Sketch (mirrors Hermes)

Proposed shape — the downstream `agent.web_search_registry` / `browser_registry` can read the same keys if Lokma imports those modules (or ports them). Keys deliberately reuse Hermes names so existing `SEARXNG_URL` etc. keep working:

```yaml
# ~/.lokma/config.yaml  — produced by lokma init
# Mirrors ~/.hermes/config.yaml structure; validated with Zod in lokma-shared
config_version: 1
model:
  provider: anthropic          # picked earlier in init (lokma model step)
  default: claude-sonnet-5

web:
  # Exactly one of the three layers matters; lokma init writes the explicit layer:
  search_backend: searxng      # searxng | exa | brave-free | tavily | firecrawl | parallel | ddgs | keenable | xai
  extract_backend: searxng     # may differ: e.g. search:searxng + extract:exa
  backend: searxng             # legacy shared fallback (kept for compat)
  keyless_fallback: true       # allow anonymous ring when zero creds — default true
  keyless_rescue: true         # one-shot keyless rescue on keyed failure — default true
  provider_tier:               # pin: free = force keyless, paid = force keyed, auto = key-when-present
    exa: auto
    tavily: auto
  cache_enabled: true
  cache_ttl_minutes: 20
  cache_exempt_hosts:          # staging/tunnel hosts that must always be live-fetched
    - preview.lokma.fermag.com.tr
    - "*.ngrok-free.app"

browser:
  backend: browser-use         # "" | browser-use | off   (yaml 1.1: off == boolean false — Lokma writes "off" quoted)
  cloud_provider: local        # local | browser-use | browserbase | firecrawl | camofox | nous
  cdp_url: ""                  # optional fixed http://127.0.0.1:9222 or ws://...
  use_real_profile: false      # consent flag for local=true profile copy
  allow_private_urls: true
  inactivity_timeout: 120
  command_timeout: 30
  snapshot_threshold: 15000
  record_sessions: false

security:
  allow_private_urls: true
  website_blocklist: []        # e.g. ["internal.fermag.com.tr"]

# Tool visibility — Lokma's equivalent of platform_toolsets
toolsets:
  web: true
  browser: true
  # web=false + browser=false are valid — the harness simply doesn't register those schemas

# Optional encrypted store (phase 2) — mirrors Docs/26-CONFIG-and-CREDENTIALS.md
credentials_store: env         # env | json   (json → ~/.lokma/credentials.json AES-GCM 0600, masked over API)
```

Key invariants Lokma must preserve:

* **Strict explicit config** — when `web.search_backend` is set, the dispatcher returns that provider even if `is_available()` is false, so the error is *"EXA_API_KEY not set"* rather than a silent SearXNG fallback [14]. This is the user-friendly contract; do not "helpfully" fall back past an explicit pick.
* **One-eligible shortcut** — when exactly one provider with that capability is registered **and available**, use it without consulting legacy order [14]. For Lokma this means if only `SEARXNG_URL` is present and no split backends are set, both search and extract resolve to SearXNG directly.
* **`backend: firecrawl` dual meaning** — `web.backend: firecrawl` vs `browser.cloud_provider: firecrawl` are independent; setting one must not imply the other. The registry already enforces this by not putting `firecrawl` in the browser legacy walk [14].

### 6.4 Env & Docker Post-Setup for Lokma

#### Env file

* Default: `~/.lokma/.env` (mirrors `~/.hermes/.env`), loaded through `get_env_value()`-equivalent that checks `os.environ` then the file [1]. Never require the user to export `SEARXNG_URL` manually — write it.
* Alternative: respect existing `SEARXNG_URL` already in `process.env` or `~/.hermes/.env` — if found during init, pre-fill the prompt and avoid overwriting silently.
* Log redaction: Lokma's `hermes_state_common` equivalent should mask `*_API_KEY`/`*_SECRET`/`*_TOKEN` in `terminal` output and `logs/` — never echo raw keys back to the model [16].

#### Docker SearXNG sidecar on :8889

* The task briefing says *"self-hosted SearXNG docker on 8889, keyless Exa fallback"* — meaning Lokma's init should default **host port 8889** (container 8080). This avoids `8080` which is already `SEARXNG_URL=http://127.0.0.1:8080` in this host's `.env` and collides with many dev servers; `8889` is free in remediation notes as a safe sidecar port.
* Offer a `lokma searxng up/down/logs` trio that wraps `docker compose -f ~/.lokma/searxng/docker-compose.yml up -d` — file from Appendix C. On `up`, run `docker compose pull` + healthcheck `wget --spider http://localhost:8889/healthz` then write `SEARXNG_URL=http://localhost:8889` to `~/.lokma/.env`.
* If Docker is not installed, fall back gracefully: *"Docker not found — set SEARXNG_URL to a remote instance, or skip; the anonymous keyless ring will still serve searches."* and point to https://docs.searxng.org/admin/installation-docker.html [21].
* Healthcheck should mirror the upstream compose: `test: ["CMD","wget","--spider","--quiet","http://localhost:8080/healthz"]` inside the container, `SEARXNG_BASE_URL` and `SEARXNG_SECRET_KEY` generated via `openssl rand -hex 32` [21][24].

### 6.5 Per-Capability Provider Picker (search vs extract)

Lokma should match Hermes's `web.search_backend` / `web.extract_backend` split in `lokma tools` [10]:

* Simple users: "Same as search" (default) → Lokma writes both keys to the same value.
* Power users: split example `search: searxng` (free, fast, no key) + `extract: exa` (highlights 4k chars, 10× token efficient) [25] — ideal when the codebase needs both breadth (SearXNG's 70 engines) and quality extraction (Exa's LLM-friendly text).
* Valid splits are enumerated by Lokma's `is_available()` probes at init time — don't offer a provider whose availability check would instantly fail unless the user picks "I'll add the key later" (then write `provider_tier: paid` to signal intent).

### 6.6 Browser Harness Picker for Lokma (4 options)

Mimic `TOOL_CATEGORIES["browser"]` post-setup semantics [10]:

| Lokma label | Wrote | Post-setup |
|-------------|-------|------------|
| **Local Browser** ★ recommended · free | `browser.backend: ""` + `browser.cloud_provider: local` | `agent-browser install --with-deps` (global npm, runs `npx agent-browser install --with-deps`) |
| **Browser Use (CLI 3.0)** | `browser.backend: browser-use` | `uv tool install browser-use` (`UV_TOOL_BIN_DIR=~/.lokma/bin`) |
| **Nous Subscription (Browser Use cloud)** | `browser.cloud_provider: browser-use` + `tool_gateway.browser: gateway` | installs `agent-browser` CLI only (`post_setup: browserbase` semantics) |
| **Browserbase** | `browser.cloud_provider: browserbase` | installs `agent-browser` CLI only, prompts `BROWSERBASE_API_KEY` + `PROJECT_ID` + optional `BROWSERBASE_*` toggles |
| **Camofox** | `browser.cloud_provider: camofox` | prompts `CAMOFOX_URL`, disables Browser Use CLI |
| **Skip** | `toolsets.browser: false` | none |

For **Lokma web harness** (`Docs/24-WEB-PANE-SYSTEM-and-orchestration.md` — the browser preview pane) the selected harness backs the live browser pane. Lokma should also expose a **per-session `local=true` toggle** (the "Drive via local profile" checkbox) whose behavior is exactly Hermes's `use_real_profile` consent + `BU_CDP_WS` path [8]. The pane should hint: *"Local profile browsing reuses your own Chrome — log in once, Hermes sees the logged-in pages."*

### 6.7 `lokma doctor` Checks

Mirror `hermes doctor` / `hermes tools --summary` [10][16]. Checks to run after init and on demand:

```
lokma doctor
─────────────────────────────────────────────
web_search:  searxng @ http://localhost:8889  ✓ reachable (200, 34ms, /healthz)
             SearXNG HTMLParser extract       ✓ stdlib (no bs4 needed)
             EXA_API_KEY                      ○ unset — keyless Exa ring is on (rate-limited)
             BRAVE_SEARCH_API_KEY             ○ unset
             cache /healthz                   ✓ enabled (TTL 20m, 0 exempt hosts)
             website_blocklist                ✓ empty
browser:     agent-browser                    ✓ 1.45.0 @ ~/.lokma/node/bin/agent-browser
             Chromium                         ✓ 128.0.6613.113 (headless)
             browser-use CLI                  ○ not installed — `lokma tools` → Browser Use to install
             Browserbase credentials          ○ unset — cloud disabled (local ok)
             CDP http://127.0.0.1:9222        ○ not listening (expected — start Chrome with --remote-debugging-port=9222 or `lokma browser open`)
             use_real_profile                 ○ false — local=true will error until enabled
toolsets:    web ✓  browser ✓  (both visible to the model)
─────────────────────────────────────────────
Recommendation: you're good to go. For heavy browsing, run:
  `lokma browser install --with-deps` (local Chromium deps) or set a cloud provider.
```

Each line maps to an existing probe: `_is_backend_available(probe)` [20b], `is_available()` per provider [1], `agent_browser_runnable()` / `node_tool_runnable("agent-browser")` [7], `_find_cli()` [8], `has_xai_credentials()` pattern, `security.allow_private_urls` gate.

### 6.8 Implementation Phases

From `Docs/02-TEKNIK-KARARLAR.md` + `Docs/03-YOL-HARITASI.md`, Lokma Phases are:

| Phase | What lands | Relation to browser/web |
|-------|------------|-------------------------|
| **0 — Setup + Scaffolding** (1–2 days) | Monorepo scaffold (`lokma-core`, `lokma-ai`, `lokma-shared` Zod, `lokma-tui` Ink + web shell) | **Lock this research** — add `Docs/31-BROWSER-SEARCH-deep-dive.md` derived from this raw file; add `web` + `browser` keys to `lokma-shared` Zod; scaffold `services/browser.ts` + `services/web.ts` stubs that wrap the Hermes-pattern registries |
| **1 — Core Loop in Browser** (1–2 wks) | Agent loop over WS, `providers/models/sessions/usage`, `flexlayout-react` panes | **Web enabled** — wire `web_search`/`web_extract` through the registry with SEARXNG_URL+EXA fallback; browser pane v1 via `agent-browser` local mode |
| **1.5 — Agents MVP** | per-agent `SOUL.md` + queue | Agents can call web/browser like the main loop (same `toolsets` gate) |
| **2 — Plugins & Safety** | MCP/hooks/skills/plugins/git/terminal/browser v2, memory deep+vault graph, parallel orchestration | **Browser Use CLI** (harness) + cloud providers + CDP attach + Lightpanda; per-capability web picker; extract cache; blocklist; `lokma tools` reconfigure flow |
| **3 — Extras & Polish** | themes/sharing/cloud, 23 ranked extras (marketplace, per-agent browser, adversarial review…) | Per-agent browser sessions (`browser_use_cli.session`), rate-limit observability, paid-tier provider matrix (FAL/DeepInfra style) |

The `lokma init` wizard is a **Phase 0 deliverable** (scaffolding) but its wiring stays thin — it just writes the config and runs post-setup hooks; the heavy registry porting is Phase 1/2.

---

## 7 — File & Code References (where we looked)

> Every path below is from the live `2026-08-31` inspection of this host. Copy a path into `read_file` / `terminal cat` to verify.

**Web providers:**

* `/usr/local/lib/hermes-agent/plugins/web/__init__.py` — "Bundled web search providers — each subdirectory follows `plugins/web/<name>/{plugin.yaml, __init__.py, provider.py}` … auto-load via `kind: backend` and register via `ctx.register_web_search_provider()`" — module doc.
* `/usr/local/lib/hermes-agent/plugins/web/searxng/provider.py` — SearXNG search + stdlib HTMLParser extract (`_SearxngTextExtractor`, `_searxng_html_to_text`, `_searxng_url()`, `SEARXNG_URL=http://localhost:8080`, `search()` via `httpx.get({base}/search, params={q, format:json})`). Lines 1-280 [2].
* `/usr/local/lib/hermes-agent/plugins/web/exa/provider.py` — Exa SDK lazy-load (`_get_exa_client`), `is_available` (keyed only), `is_keyless_available` (`provider_tier != paid`), `search_with_failover` / `extract_with_failover`, `response.results`/`highlights` mapping. Lines 1-300 [20].
* `/usr/local/lib/hermes-agent/plugins/web/brave_free/provider.py` — Brave free.
* `/usr/local/lib/hermes-agent/plugins/web/tavily/provider.py` — Tavily.
* `/usr/local/lib/hermes-agent/plugins/web/firecrawl/provider.py` — Firecrawl (gateway `_KeylessFirecrawlClient`).
* `/usr/local/lib/hermes-agent/plugins/web/parallel/provider.py`, `/plugins/web/keenable/provider.py`, `/plugins/web/keyless_mcp.py` — the keyless ring (600 LOC, `_KEYLESS_RING`, `_ring_cursor`, `search_with_failover`, `mcp_call`, per-vendor `*_search_keyless`/`*_extract_keyless`).
* `/usr/local/lib/hermes-agent/plugins/web/searxng/plugin.yaml`, `/web/exa/plugin.yaml`, `/web/brave_free/plugin.yaml`, `/web/firecrawl/plugin.yaml`, `/web/tavily/plugin.yaml` — (`name`, `kind: backend`, `provides_web_providers`) [23].

**ABC + registry:**

* `/usr/local/lib/hermes-agent/agent/web_search_provider.py` — ABC `WebSearchProvider`, `get_provider_env()` (config-aware, fallback to `os.getenv`), response shape contract. Lines 1-200 [1].
* `/usr/local/lib/hermes-agent/agent/web_search_registry.py` — `_LEGACY_PREFERENCE`, `_KEYLESS_PREFERENCE`, `_resolve(configured, capability)`, `_disabled_web_plugin_for`, `get_active_search_provider()`, `get_active_extract_provider()`, `_keyless_tier_enabled()` (`web.keyless_fallback`). Lines 1-400 [14b].
* `/usr/local/lib/hermes-agent/tools/web_tools.py` — `web_search_tool`, `web_extract_tool`, `_get_backend`/`_get_capability_backend`/`_get_search_backend`/`_get_extract_backend`, `_LEGACY_WEB_BACKENDS`, `_is_backend_available`, `_has_env` / `_env_value` (config-aware), `_keyless_rescue_enabled`/`_rescue_eligible`, `WEB_TOOLS_DEBUG` [20b].

**Browser:**

* `/usr/local/lib/hermes-agent/tools/browser_tool.py` — dispatcher, `agent-browser` local mode, `agent-browser install --with-deps`, PATH flooring (`_SANE_PATH_DIRS`, `_merge_browser_path`), env scrubbing (`_BROWSER_PASSTHROUGH_KEYS`), timeouts, snapshot thresholds, `browser_cdp` gating. Lines 1-400+ [7].
* `/usr/local/lib/hermes-agent/tools/browser_use_cli.py` — `browser_exec` driver, `get_browser_backend()`, `is_browser_use_cli_mode()`, `find_cli()`, `install_cli()` (managed `uv tool install browser-use`), `_workspace_dir`, `_hermes_ensure_own_tab`, `_resolve_backend_cdp`/`_resolve_real_profile_cdp`, `_description_header`/`_dynamic_schema_overrides` (the `local` boolean). Lines 1-600+ [8].
* `/usr/local/lib/hermes-agent/agent/browser_provider.py` — ABC `BrowserProvider` (`create_session`/`close_session`/`emergency_cleanup`/`get_setup_schema`, legacy shims `is_configured`/`provider_name`). Lines 1-140 [6].
* `/usr/local/lib/hermes-agent/agent/browser_registry.py` — `register_provider`, `list_providers`, `get_provider`, `_LEGACY_PREFERENCE = (browser-use, browserbase)`, `_resolve(configured)` (explicit `"local"` short-circuit → legacy walk). Lines 1-220 [14].
* `/usr/local/lib/hermes-agent/plugins/browser/browser_use/provider.py` — Browser Use cloud, dual auth, `X-Idempotency-Key`, `timeout:5` managed mode, `_pending_create_keys`. Lines 1-280 [15].
* `/usr/local/lib/hermes-agent/plugins/browser/browserbase/provider.py` — Browserbase, `keepAlive`/`proxies`/`advancedStealth`/`timeout` with 402 fallback. Lines 1-230 [15b].
* `/usr/local/lib/hermes-agent/plugins/browser/firecrawl/provider.py` — Firecrawl browser.
* `/usr/local/lib/hermes-agent/hermes_cli/tools_config.py` — `CONFIGURABLE_TOOLSETS`, `_DEFAULT_OFF_TOOLSETS`, `_CONFIG_ONLY_TOOLSETS`, `TOOL_CATEGORIES["web"]` (Nous+Self-Hosted injected + plugin-registered rows), `TOOL_CATEGORIES["browser"]` (Local/Nous/Camofox/BrowserUse + plugin rows), post-setup hooks, `hermes tools` checklist → `platform_toolsets` [10].
* `/usr/local/lib/hermes-agent/hermes_cli/config.py` — `load_config`, `load_config_readonly`, `get_env_value`/`save_env_value`, `read_raw_config`, `cfg_get`, Zod-equivalent config check.

**Config on this host:**

* `~/.hermes/config.yaml` (`_config_version: 39`, 1897 lines, last `web: search_backend: searxng`, `extract_backend: searxng`, `browser: inactivity_timeout:120, allow_private_urls:true, use_real_profile:true, cloud_provider:nous`) [16].
* `~/.hermes/.env` / `/root/.browser-use-env` (`BU_CDP_URL=http://127.0.0.1:9222`, `SEARXNG_URL=http://127.0.0.1:8080`, `BROWSERBASE_*`, `EXA_API_KEY` etc. — see `terminal cat /root/.hermes/.env | grep -E SEARXNG|EXA|BRAVE|BROWSER`) — [16][2].

**Skills + sources we consulted:**

* `/root/.hermes/skills/autonomous-ai-agents/hermes-agent/SKILL.md` (v3.2.0) + `references/configuration.md` for the skill's `routing table` and `Hard Invariants` (prompt caching, `.env` vs `config.yaml`) [16].
* `/root/.hermes/cache/terminal-output/` (all 57k-char `web_tools` dumps etc. live here).

---

## 8 — Sources & URLs

Cite these in the synthesized Docs. Each entry has a stable retrieval note.

**Hermes Agent (official docs + repo)**

* [1] `agent/web_search_provider.py` — WebSearchProvider ABC — `/usr/local/lib/hermes-agent/agent/web_search_provider.py` (local checkout `github.com/NousResearch/hermes-agent` — main branch 2026-08)
* [2] `plugins/web/searxng/provider.py` — SearXNG provider (HTMLParser local extract) — `/usr/local/lib/hermes-agent/plugins/web/searxng/provider.py`
* [3] `plugins/web/keyless_mcp.py` — Keyless free-tier ring — `/usr/local/lib/hermes-agent/plugins/web/keyless_mcp.py`
* [4] `plugins/web/exa/provider.py` — Exa provider (keyed + keyless) — `/usr/local/lib/hermes-agent/plugins/web/exa/provider.py`
* [5] `plugins/web/brave_free/provider.py`, `plugins/web/tavily/provider.py`, `plugins/web/firecrawl/provider.py`, `plugins/web/parallel/provider.py`, `plugins/web/keenable/provider.py` — remaining vendors.
* [6] `agent/browser_provider.py` — BrowserProvider ABC — `/usr/local/lib/hermes-agent/agent/browser_provider.py`
* [7] `tools/browser_tool.py` — Browser dispatcher (agent-browser, timeouts, PATH, env scrubbing)
* [8] `tools/browser_use_cli.py` — Browser Use CLI driver (browser_exec, harness, install, real-profile)
* [9] Skill fallback pattern — `hermes_cli/tools_config.py` `TOOL_CATEGORIES` comment + `duckduckgo-search` skill's `fallback_for_toolsets: [web]` — see `docs/user-guide/features/web-search` quick-setup row [27]
* [10] `hermes_cli/tools_config.py` — Toolset registry + `hermes tools` picker — `/usr/local/lib/hermes-agent/hermes_cli/tools_config.py` (`CONFIGURABLE_TOOLSETS`, `TOOL_CATEGORIES`, `post_setup`)
* [11] Browser feature docs — `https://hermes-agent.nousresearch.com/docs/user-guide/features/browser` [12 in web_search block]
* [12] Web Search & Extract docs — `https://hermes-agent.nousresearch.com/docs/user-guide/features/web-search` (retrieved via curl + llms.txt extraction, covers SearXNG/Exa/Brave/Tavily/Parallel)
* [13] Tools reference — `https://hermes-agent.nousresearch.com/docs/reference/tools-reference` (86 tools, 12 browser tools, 2 CDP-gated)
* [14] `agent/browser_registry.py` — Browser provider registry — `/usr/local/lib/hermes-agent/agent/browser_registry.py`
* [14b] `agent/web_search_registry.py` — Web provider registry — `/usr/local/lib/hermes-agent/agent/web_search_registry.py`
* [15] `plugins/browser/browser_use/provider.py` — Browser Use cloud (dual auth) — `/usr/local/lib/hermes-agent/plugins/browser/browser_use/provider.py`
* [15b] `plugins/browser/browserbase/provider.py` — Browserbase cloud — `/usr/local/lib/hermes-agent/plugins/browser/browserbase/provider.py`
* [16] Live config — `~/.hermes/config.yaml` (v39, `web.*`, `browser.*`, `security.*`), `hermes tools list`, `hermes config` output — inspected 2026-08-31 on this host
* [17] `docs/developer-guide/browser-provider-plugin.md` — `https://hermes-agent.nousresearch.com/docs/developer-guide/browser-provider-plugin` (register(ctx).register_browser_provider, cdp_url contract)
* [18] `docs/user-guide/features/web-search` llms.txt index — `https://hermes-agent.nousresearch.com/docs/llms.txt` (entry "Web Search & Extract" → `/docs/user-guide/features/web-search`)
* [19] Hermes tool gateway — `https://hermes-agent.nousresearch.com/docs/user-guide/features/tool-gateway` (Nous subscription covers web/image/TTS/browser)
* [20] `tools/web_tools.py` + re-exports — `_get_backend`, `_LEGACY_WEB_BACKENDS`, `_is_backend_available`, `_keyless_rescue` [20b]
* [20b] `tools/web_tools.py:190-430` — the legacy candidate ladder and keyless walk (called from above)
* [27] `docs/user-guide/features/web-search` HTML render (caching / cache_exempt_hosts / SearXNG setup + `hermes tools` flow) — fetched 2026-08-31

**Browser Use (external)**

* [12] Browser Automation page — `https://hermes-agent.nousresearch.com/docs/user-guide/features/browser` already covers Browser Use mode verbatim; counted above as [11].
* [18] Browser Use CLI docs — `https://docs.browser-use.com/open-source/browser-use-cli` (three modes, local Chrome with cookies, `uv tool install`, `uvx browser-use`, `browser-use --doctor`, `BU_CDP_URL/WS`) + ancestor LLM harness narrative.
* [19] Browser Use CLI 3.0 token-tax claim — `https://alphasignal.ai/news/browser-use-cli-3-0-cuts-agent-token-usage-6x-with-direct-chrome-access` (31k vs 5.5k chars, 6× [quoted in review]; primary source is [18] + harness `https://github.com/browser-use/browser-harness`).
* [26] Browser Use Python library vs CLI — `https://github.com/browser-use/browser-use` — "One-off tasks → CLI. Repeatable automation → Python library."
* Browser Harness — `https://github.com/browser-use/browser-harness` (~592-line self-healing harness).
* CDP — `https://chromedevtools.github.io/devtools-protocol/` (cited in Hermes `browser_cdp` docs [13]).
* Browser Use Cloud — `https://cloud.browser-use.com` (3 concurrent browsers free tier, proxies, captcha) — referenced in [18].

**SearXNG (external)**

* [21] SearXNG Docker — `https://docs.searxng.org/admin/installation-docker.html` (Container compose preferred, Manual instancing, `docker run -p 8888:8080 -v ./config/:/etc/searxng`, `docker.io/searxng/searxng:latest`, `$SEARXNG_SECRET`, `$SEARXNG_BASE_URL` [captured excerpt]).
* [22] SearXNG step-by-step — `https://docs.searxng.org/admin/installation-searxng.html` (copy `utils/templates/etc/searxng/settings.yml`, `server.secret_key`, `limiter`, `image_proxy`, `valkey://localhost:6379/0`).
* [23] SearXNG plugin.yaml — `/usr/local/lib/hermes-agent/plugins/web/searxng/plugin.yaml` (`web-searxng`, `provides_web_providers: [searxng]`, `free · self-hosted` badge).
* [24] Self-hosting guide (community) — `https://selfhosting.sh/apps/searxng/` — compose with `SEARXNG_BASE_URL=http://localhost:8080/`, `FORCE_OWNERSHIP`, `healthcheck: wget --spider http://localhost:8080/healthz`, `config/settings.yml` (`use_default_settings:true`, `server.base_url`, `redis.url: redis://valkey:6379/0`, `search.safe_search`, `autocomplete`).
* SearXNG GitHub — `https://github.com/searxng/searxng` + `https://searx.space/` (public instance list — cited in `get_setup_schema` `url: https://searx.space/` [2]).
* Source RST — `https://github.com/searxng/searxng/blob/master/docs/admin/installation-docker.rst` (same as [21]).

**Exa (external)**

* [25] Exa Search API guide — `https://exa.ai/docs/reference/search-api-guide` (types `auto|instant|fast|deep-lite|deep|deep-reasoning`, `contents.highlights: 4000 chars, 10× token efficient`, `EXA_API_KEY` env, `curl https://api.exa.ai/search` with `Authorization: Bearer`).
* [25b] Exa pricing — `https://exa.ai/docs/reference/pricing` ($7/1k requests, $20 free new accounts ~2.8k searches, $10/month free tier).
* Exa keyless MCP — `https://mcp.exa.ai/mcp` (`web_search_exa`, `web_fetch_exa` via JSON-RPC `tools/call` — confirmed via `plugins/web/keyless_mcp.py` parse logic [3]).
* Exa dashboard — `https://dashboard.exa.ai/api-keys`.

**Other vendors**

* Brave Search API — `https://brave.com/search/api/` (free, 2k/mo — cited in `brave_free/provider.py` tag).
* Tavily — `https://app.tavily.com/home` (`api.tavily.com/search` + `/extract`, `X-Tavily-Access-Mode: keyless` — see [3]).
* Firecrawl — `https://docs.firecrawl.dev/introduction` (cloud + self-host `FIRECRAWL_API_URL=http://localhost:3002`, derived `firecrawl-gateway.<domain>` for Nous).
* Parallel — `https://docs.parallel.ai` (`search.parallel.ai/mcp` — see [3]).
* Keenable — `https://api.keenable.ai` (`/v1/search/public` with `X-Keenable-Title: hermes-agent` — see [3]).

**General Hermes docs used as background**

* Configuration — `https://hermes-agent.nousresearch.com/docs/user-guide/configuration` ( `config.yaml` vs `.env`, `model.*`, `web.*`/`browser.*` sections — see also `docs/llms-full.txt` line 5769-5828).
* Hermes Agent SKILL.md — `https://github.com/NousResearch/hermes-agent` + local `~/.hermes/skills/autonomous-ai-agents/hermes-agent/SKILL.md` (v3.2.0, "Secrets in `.env`, settings in `config.yaml`" hard invariant).
* Hermes install.sh — `https://hermes-agent.nousresearch.com/install.sh` (`--skip-browser`, Node 26, OpenRouter, etc. — `docs/llms-full.txt` lines 138-302).
* Configuration page excerpted in `docs/llms-full.txt` via curl (lines `web:{ backend: firecrawl … search_backend: "searxng" }`, `browser:{ command_timeout, record_sessions, ... }`).

> Citation format: `[n]` numbers above map to the readable source; for the synthesis pass, re-fetch each URL and assert the quote still matches — all were live on 2026-08-31. The `plugins/web/keyless_mcp.py` ring and `tools/web_tools.py` ladder are the source of truth for fallback behavior; the hosted docs sometimes lag the code by one PR.

---

## Appendix A — Env Var Quick Reference

```
# ── Web ───────────────────────────────────────────────
SEARXNG_URL=http://localhost:8889          # self-hosted (Lokma default; Hermes default :8080)
EXA_API_KEY=sk-…                           # https://dashboard.exa.ai/api-keys
BRAVE_SEARCH_API_KEY=BSA…                  # https://brave.com/search/api/
TAVILY_API_KEY=tv_…                        # https://app.tavily.com
FIRECRAWL_API_KEY=fc-…                     # https://firecrawl.dev  OR
FIRECRAWL_API_URL=http://localhost:3002    # self-hosted Firecrawl
PARALLEL_API_KEY=…                         # https://parallel.ai
KEENABLE_API_KEY=…                         # https://api.keenable.ai
FIRECRAWL_BROWSER_TTL=1800                 # browser TTL (seconds) — passed to agent-browser child

# ── Browser ───────────────────────────────────────────
BROWSERBASE_API_KEY=…                      # https://browserbase.com
BROWSERBASE_PROJECT_ID=prj_…
BROWSERBASE_BASE_URL=https://api.browserbase.com
BROWSERBASE_PROXIES=true
BROWSERBASE_ADVANCED_STEALTH=false
BROWSERBASE_KEEP_ALIVE=true
BROWSERBASE_SESSION_TIMEOUT=600
BROWSER_USE_API_KEY=…                      # https://browser-use.com
CAMOFOX_URL=http://localhost:9377          # Camofox anti-detection
BU_CDP_URL=http://127.0.0.1:9222           # managed alias, also BROWSER_CDP_URL / BU_CDP_WS
AGENT_BROWSER_ARGS=--no-sandbox,--disable-dev-shm-usage

# ── SearXNG container (not seen by Hermes directly) ──
SEARXNG_BASE_URL=http://localhost:8889/
SEARXNG_SECRET_KEY=<openssl rand -hex 32>
SEARXNG_BUILD_REF=                         # pinned image ref (optional)

# ── Cosmetic / debug ──────────────────────────────────
HERMES_HOME=~/.hermes                      # profile root
WEB_TOOLS_DEBUG=true                       # web_tools_debug_UUID.json in ./logs
ANONYMIZED_TELEMETRY=false                 # set by browser_use_cli._base_subprocess_env
```

All values flow through `hermes_cli.config.get_env_value` → `os.environ` ∪ `~/.hermes/.env` → fallback `os.getenv` [1]. `agent.secret_scope.get_secret` adds the auth.json OAuth layer for `BROWSER_USE_API_KEY` via Nous gateway [15].

---

## Appendix B — Example Config Snippets

### Hermes: SearXNG + local Chromium (the cheapest useful setup on this VPS)

```yaml
# ~/.hermes/config.yaml
web:
  backend: searxng
  search_backend: searxng
  extract_backend: searxng   # local fetch via HTMLParser, no Exa needed
  keyless_fallback: true
  keyless_rescue: true
  cache_enabled: true
  cache_ttl_minutes: 20
browser:
  backend: ""                # unset → browser_use CLI when runnable, else built-ins
  cloud_provider: local      # disable cloud
  use_real_profile: false
  allow_private_urls: true
  command_timeout: 30
  snapshot_threshold: 15000
security:
  allow_private_urls: true
  website_blocklist: []
```

```sh
# ~/.hermes/.env — single line needed for web to work
SEARXNG_URL=http://localhost:8889
# Docker ran: docker run -p 8889:8080 -v ./searxng/config:/etc/searxng searxng/searxng:latest
# Verify: curl http://localhost:8889/search?format=json\&q=test | jq
```

### Hermes: SearXNG search + Exa extract (recommended when extraction quality matters)

```yaml
# ~/.hermes/config.yaml
web:
  search_backend: searxng         # 70 engines, free
  extract_backend: exa            # highlights 4k chars, Markdown
  provider_tier:
    exa: auto                     # use EXA_API_KEY when present, else keyless free tier
  cache_enabled: true
```

```sh
# ~/.hermes/.env
SEARXNG_URL=http://localhost:8889
EXA_API_KEY=sk-…                  # optional — omit to stay on anonymous free tier (rate-limited)
```

### Hermes: Brave free (no self-host)

```yaml
# ~/.hermes/config.yaml
web:
  backend: brave-free
```

```sh
# ~/.hermes/.env
BRAVE_SEARCH_API_KEY=BSA…
```

### Lokma (proposed): `~/.lokma/config.yaml` after `lokma init` with both subsystems on

```yaml
# ~/.lokma/config.yaml — produced by lokma init (see §6.3)
config_version: 1
web:
  search_backend: searxng
  extract_backend: exa
  backend: searxng
  keyless_fallback: true
  keyless_rescue: true
  provider_tier: { exa: auto }
  cache_enabled: true
  cache_ttl_minutes: 20
  cache_exempt_hosts: ["*.ngrok-free.app"]
browser:
  backend: browser-use           # Lokma user picked Browser Use CLI in init
  cloud_provider: local
  use_real_profile: false
  command_timeout: 30
toolsets: { web: true, browser: true }
```

```sh
# ~/.lokma/.env
SEARXNG_URL=http://localhost:8889
EXA_API_KEY=sk-…                 # blanks allowed — ring covers it
```

### Self-hosted Firecrawl override (both Hermes and Lokma, same shape)

```yaml
web:
  extract_backend: firecrawl     # search can still be searxng
```

```sh
FIRECRAWL_API_URL=http://localhost:3002   # no FIRECRAWL_API_KEY needed for self-host
```

---

## Appendix C — SearXNG Docker Compose for Lokma (8888→8889 note)

From `https://docs.searxng.org/admin/installation-docker.html` [21] and `https://selfhosting.sh/apps/searxng/` [24]. Lokma's copy lives at `~/.lokma/searxng/docker-compose.yml` and bins `localhost:8889` (host)→`8080` (container). If you use the upstream default `8888`, change **only the host side** (`- "8889:8080"` → `- "8888:8080"`; also `SEARXNG_BASE_URL`/`SEARXNG_URL` accordingly).

```yaml
# ~/.lokma/searxng/docker-compose.yml  — Lokma SearXNG sidecar (8889)
# Source: https://docs.searxng.org/admin/installation-docker.html [21]
#         + https://selfhosting.sh/apps/searxng/ [24]
# Run: docker compose -f ~/.lokma/searxng/docker-compose.yml up -d
# Check: curl -s http://localhost:8889/healthz && curl -s "http://localhost:8889/search?format=json&q=test" | jq
services:
  searxng:
    container_name: lokma-searxng
    image: docker.io/searxng/searxng:latest
    ports:
      - "8889:8080/tcp"               # Lokma convention: 8889 on host, 8080 in container
    volumes:
      - ./config:/etc/searxng          # settings.yml + limiter.toml
      - ./data:/var/cache/searxng      # cache/runtime (persisted)
    environment:
      # REQUIRED: must match server.base_url in settings.yml
      - SEARXNG_BASE_URL=http://localhost:8889/
      # REQUIRED: generate once with `openssl rand -hex 32`
      - SEARXNG_SECRET_KEY=CHANGE_ME_REPLACE_WITH_OUTPUT_OF_OPENSSL_RAND_HEX_32
      - FORCE_OWNERSHIP=true
    depends_on:
      valkey:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--spider", "--quiet", "http://localhost:8080/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
    cap_drop: [ALL]
    cap_add: [CHOWN, SETGID, SETUID]

  valkey:
    container_name: lokma-searxng-valkey
    image: docker.io/valkey/valkey:8.0-alpine
    volumes:
      - valkey-data:/data
    command: valkey-server --save 30 1 --loglevel warning
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 5s
    cap_drop: [ALL]
    cap_add: [SETGID, SETUID]

volumes:
  valkey-data:
```

```yaml
# ~/.lokma/searxng/config/settings.yml  — minimal (mirror [24])
# See also utils/templates/etc/searxng/settings.yml in git://searx — copy then set secret_key.
use_default_settings: true
server:
  base_url: "http://localhost:8889/"      # must match SEARXNG_BASE_URL above
  secret_key: "CHANGE_ME_REPLACE_WITH_OUTPUT_OF_OPENSSL_RAND_HEX_32"
  limiter: true
  image_proxy: true
redis:
  url: redis://valkey:6379/0              # must be valkey service name, not localhost
search:
  safe_search: 0
  default_lang: ""
  autocomplete: "google"
```

**Why `8889` and not `8080`?**

* The SearXNG image exposes **8080 inside** the container; the host bind is free to move [21].
* Upstream docs use `8888:8080` but this VPS already has `SEARXNG_URL=http://127.0.0.1:8080` pointing at a different service, and Lokma's brief explicitly says *"self-hosted SearXNG docker on 8889"*. Using **8889** gives a clean separation: Loki's dev server can still bind `8080`, the Hermes dashboard stays on `9119`, and Lokma's sidecar stays reachable at `8889` without `iptables` churn.
* The `SEARXNG_URL` the model sees **must** match the host port (`http://localhost:8889` for `8889:8080`). The only consequence of picking `8888` or `8889` is one integer in `docker-compose.yml` + one env value — the SearXNG internals are identical [21].

**Manual-run equivalent (no compose, from docs [21]):**

```sh
mkdir -p ~/.lokma/searxng/config ~/.lokma/searxng/data
# generate secret
openssl rand -hex 32    # paste into compose + settings.yml above
docker run --name lokma-searxng -d \
  -p 8889:8080 \
  -v "$HOME/.lokma/searxng/config:/etc/searxng" \
  -v "$HOME/.lokma/searxng/data:/var/cache/searxng" \
  -e SEARXNG_BASE_URL=http://localhost:8889/ \
  -e SEARXNG_SECRET_KEY="$(openssl rand -hex 32)" \
  docker.io/searxng/searxng:latest
# Without Valkey the limiter falls back to in-memory — add a valkey container for production.
docker logs lokma-searxng -f
curl -s "http://localhost:8889/search?format=json&q=hello" | head -c 500
```

**Lokma init automation:**

```ts
// packages/lokma-core/src/services/searxng.ts (sketch)
export async function ensureSearxngDocker(hostPort = 8889): Promise<string> {
  const composeFile = join(homedir(), ".lokma/searxng/docker-compose.yml");
  if (!existsSync(composeFile)) writeDockerCompose(composeFile, hostPort); // template from above
  if (!which("docker")) return "docker not found — set SEARXNG_URL manually";
  const secret = existsSecret(composeFile) ? readSecret(composeFile) : randomHex(32);
  await sh(`docker compose -f ${composeFile} up -d --pull always`);
  await waitHealthy(`http://localhost:${hostPort}/healthz`, { timeout: 30000 });
  const url = `http://localhost:${hostPort}`;
  await saveEnvValue("SEARXNG_URL", url); // ~/.lokma/.env
  return url;
}
```

---

## Closing Notes for the Lokma Synthesizer (the next agent)

1. This file is **raw research** — don't commit it verbatim into `Docs/`. Synthesize a **tighter** spec into `Docs/31-BROWSER-SEARCH-deep-dive.md` (~200 lines) and a **2-page `lokma init` design doc** in `Docs/26-CONFIG-and-CREDENTIALS.md` (§5 onward).
2. The `8889` convention is intentional — keep it in `Docs/02-TEKNIK-KARARLAR.md` as the decided SearXNG port; the Docker template lives in Appendix C above.
3. For `lokma init`, reuse **Hermes's env names verbatim** (`SEARXNG_URL`, `EXA_API_KEY`, `BROWSERBASE_*`, etc.) — no `_LOKMA`-prefixed aliases. That way `.env` sharing (`~/.hermes/.env` ↔ `~/.lokma/.env` via symlink or copy) works zero-config for Hermes users.
4. Keep the **capability split** (`search_backend` vs `extract_backend`) as two rows in `lokma tools` (not one). The simplest UX is still "Same as search" pre-selected.
5. Keep **`browser.backend: "browser-use"` as the default Browser Use driver** (like Hermes), but Lokma's init must **offer "Local Browser (free)" as the highlighted index-0 choice** — same rationale as `hermes_cli/tools_config.py` browser category comment: pressing Enter on a fresh install must land on the free/no-key path [10].

---

*End of raw dossier. Line budget: target 500+, actual ~820+ (including this footer). All citations above were live on 2026-08-31; re-crawl before freezing Docs.*

