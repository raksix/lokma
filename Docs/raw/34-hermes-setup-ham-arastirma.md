# Hermes Agent Installation & Setup Flow — Deep Research
> **Purpose:** Reverse-engineer Hermes Agent's installer + interactive wizard so Lokma can mirror it as `lokma init / lokma setup` with optional checkboxes.  
> **Sources scraped 2026-08-31:** docs site, hosted installers, live CLI (`hermes --help`, `hermes doctor`, `hermes config`, `hermes setup --help`), and the on-disk checkout at `/usr/local/lib/hermes-agent` (FHS root install) + `/tmp/install.sh` & `/tmp/install.ps1` (fetched from `https://hermes-agent.nousresearch.com/install.sh[.ps1]`).  
> **Canonical doc roots cited throughout:**  
> - https://hermes-agent.nousresearch.com/docs/  
> - https://hermes-agent.nousresearch.com/docs/getting-started/installation  
> - https://hermes-agent.nousresearch.com/docs/getting-started/quickstart  
> - https://hermes-agent.nousresearch.com/docs/user-guide/configuration  
> - https://hermes-agent.nousresearch.com/docs/user-guide/features/tools  
> - https://hermes-agent.nousresearch.com/docs/user-guide/messaging  
> - https://hermes-agent.nousresearch.com/docs/integrations/providers  
> - https://github.com/NousResearch/hermes-agent (README + `install.sh` / `install.ps1` + `cli-config.yaml.example`)  

---

## 1. `install.sh` — Linux / macOS / WSL2 / Android (Termux) — What It Installs

### 1.1 Entry points & supported invocations

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --skip-browser --no-skills --branch main
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --ensure node,browser
HERMES_HOME=/data/hermes curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
sudo curl -fsSL https://hermes-agent.nousresearch.com/install.sh | sudo bash  # root FHS layout
```

Source: https://hermes-agent.nousresearch.com/docs/getting-started/installation and header comment of `/tmp/install.sh` (lines 1-20, `set -e`, `PYTHONPATH`/`PYTHONHOME` unset guard, `UV_NO_CONFIG=1`). The script detects non-interactive mode (`[ -t 0 ]` → `IS_INTERACTIVE`) so `curl | bash` doesn't `read -p` → EOF → abort under `set -e`.

### 1.2 CLI flags (full set from `install.sh --help`)

| Flag | Effect |
|------|--------|
| `--no-venv` | Skip venv creation |
| `--skip-setup` | Skip `hermes setup` wizard after deps install |
| `--skip-browser` / `--no-playwright` | Skip Playwright/Chromium + `browser-use` install; browser tools stay unavailable until `npx playwright install chromium` |
| `--skip-computer-use` | Skip `cua-driver` (Computer Use) pre-install; lazy-installs when tool enabled |
| `--no-skills` | Seed **no** bundled skills and write `$HERMES_HOME/.no-bundled-skills` so future `hermes update` never injects them |
| `--branch NAME` | Clone branch (default `main`) |
| `--commit SHA` | Pin checkout to commit after clone (ignored if it would roll back; `--force-commit` overrides) |
| `--manifest` / `--stage NAME` / `--json` / `--non-interactive` | Stage protocol for desktop bootstrap driver (see §1.8) |
| `--include-desktop` | Also build `apps/desktop` → `Hermes.app` |
| `--dir PATH` | Override code dir (default per-user `~/.hermes/hermes-agent`, root ` /usr/local/lib/hermes-agent`) |
| `--hermes-home PATH` | Data dir (default `~/.hermes`, or `$HERMES_HOME`) |
| `--ensure DEPS` | Install only `node`, `browser`, `ripgrep`, `ffmpeg` (comma-separated), no clone/venv |
| `-h, --help` | Prints FHS layout notes |

Cited: `/tmp/install.sh` lines 31-212 (argument parse + help).

### 1.3 Hard prerequisites (user must provide)

- **All platforms:** `git` (script auto-installs it when missing via `brew install git`, `apt-get install -y git`, `dnf install -y git`, `pacman -S git`; on sudo-needs-password hosts it prompts `Install git? [y/N]` and falls back to `/dev/tty` read when `curl | bash` is non-interactive).
- **Linux:** `curl` + `xz-utils` (needed to unpack `node-v*.tar.xz`).
- **Desktop app:** `g++` / `build-essential` (compiles `node-pty` and other native addons). The installer probes `g++ --version` and offers `apt install build-essential` / `dnf install gcc-c++` / `pacman -S base-devel`.
- No manual install of `uv`, `Python`, `Node`, `ripgrep`, `ffmpeg` required — script owns them.

Cited: https://hermes-agent.nousresearch.com/docs/getting-started/installation#prerequisites and `/tmp/install.sh` lines 638-880.

### 1.4 Managed `uv` (fast Python package manager)

```sh
managed_uv="$HERMES_HOME/bin/uv"        # NOT ~/.local/bin, NOT on PATH
curl -LsSf https://astral.sh/uv/install.sh -o /tmp/uv.sh
UV_UNMANAGED_INSTALL="$HERMES_HOME/bin" sh /tmp/uv.sh
```

- Always installed to `$HERMES_HOME/bin/uv`; runtime update path `hermes_cli/managed_uv.py` looks in the same place so `install.sh` ↔ `hermes update` stay in sync.
- Termux branch: skipped entirely → uses stdlib `venv + pip`.

Cited: `/tmp/install.sh` lines 555-620.

### 1.5 Python 3.11 via `uv` (no sudo)

```sh
PYTHON_VERSION="3.11"    # /tmp/install.sh line 59
NODE_VERSION="26"        # /tmp/install.sh line 60
"$UV_CMD" python find 3.11  ||  "$UV_CMD" python install 3.11
"$UV_CMD" venv venv --python 3.11
```

- `uv python find` probes both uv-managed and system interpreters; if missing, `uv python install` downloads a hermetic build.
- Venv lives at `$INSTALL_DIR/venv`; later `uv sync --locked` (hash-verified, Tier 0) or `uv pip install -e ".[all]"` populates it. Lockfile restores `package-lock.json` churn to keep `git status` clean.

Cited: `/tmp/install.sh` lines 638-660, 1552-1600, 1700-1770.

### 1.6 Node.js 26 LTS (browser + WhatsApp bridge)

- Acceptable system Node: `22.22+`, `24.11+`, or `26+` (nanoid 6 + @babel 8.x ranges). Anything else is replaced.
- Homes: installed to `$HERMES_HOME/node/` (`bin/node`, `bin/npm`, `bin/npx`), then symlinked into the **command link dir** (`~/.local/bin` or `/usr/local/bin` when FHS).
- Fetched as `node-v26.x.x-linux-x64.tar.xz` (or `-darwin-*` / `-arm64`) from `https://nodejs.org/dist/latest-v26.x/`, falling back to `.tar.gz` on detection failure.
- Sets npm's global prefix to the link dir (`$HERMES_HOME/node/etc/npmrc` → `prefix=<link_dir>`) so `npm install -g` survives upgrades.
- Also installs **TUI deps** (`ui-tui/package.json` → `npm install --silent` with 600 s timeout) and **browser deps** (`package.json` → `npm install`).

Cited: `/tmp/install.sh` lines 890-1090, `install_node()` + `check_node()`, and https://hermes-agent.nousresearch.com/docs/getting-started/installation (notes "Node.js v26" / "existing system Node 22.22+, 24.11+, or 26+ is used as-is").

### 1.7 ripgrep + ffmpeg (system packages)

```sh
need_ripgrep=true  if ! command -v rg
need_ffmpeg=true   if ! command -v ffmpeg
```

- **Termux:** `pkg install ripgrep ffmpeg`
- **macOS:** `brew install ripgrep ffmpeg`
- **Linux:** single combined `sudo apt/dnf/pacman` call for both (`apt install -y ripgrep ffmpeg`), with three branches: (a) passwordless sudo → auto-install, (b) sudo-needs-password + interactive TTY → `prompt_yes_no "Install ripgrep for faster file search? [Y/n]"`, (c) non-interactive without TTY → `prompt_yes_no` via `/dev/tty`, else warn.
- Fallback for ripgrep: `cargo install ripgrep`.
- Warnings: missing rg → grep fallback; missing ffmpeg → TTS voice messages limited.

Cited: `/tmp/install.sh` lines 1152-1340.

### 1.8 Playwright Chromium, Browser Use CLI, cua-driver

**Chromium:**
- After `npm install`, runs `npx playwright install chromium` (+ `--with-deps` on apt when sudo is passwordless; otherwise installs system libs separately and prints admin command `sudo npx playwright install-deps chromium`).
- Arch family: `sudo pacman -S nss atk at-spi2-core cups libdrm libxkbcommon mesa pango cairo alsa-lib`.
- Fedora/RHEL/openSUSE: prints manual `dnf`/`zypper` command, then `npx playwright install chromium` without `--with-deps`.
- `AGENT_BROWSER_EXECUTABLE_PATH` in `.env` set when a system browser is detected — then bundled Chromium is skipped.

**Browser Use CLI:**
```sh
UV_TOOL_BIN_DIR="$HERMES_HOME/bin" uv tool install browser-use   # best-effort, 600 s timeout
```

**Computer Use (cua-driver):**
```sh
curl -fsSL https://raw.githubusercontent.com/trycua/cua/main/libs/cua-driver/scripts/install.sh | bash   # 660 s timeout
```
Pre-installs so `hermes tools → Computer Use` is a config flip.

Cited: `/tmp/install.sh` lines 2443-2680.

### 1.9 Install layout (per-user vs FHS root)

| Install type | Code lives at | `hermes` binary | Data dir | How detected |
|--------------|---------------|----------------|----------|--------------|
| Per-user (normal) | `~/.hermes/hermes-agent/` | `~/.local/bin/hermes` (symlink to `venv/bin/hermes`) | `~/.hermes/` | `id -u != 0` |
| Root-mode (`sudo curl … | sudo bash`) | `/usr/local/lib/hermes-agent/` | `/usr/local/bin/hermes` | `id -u == 0` on Linux |

Root layout keeps Docker bind-mounts lean (`/root/` stays small) and matches Claude Code / Codex CLI FHS. Existing installs at `$HERMES_HOME/hermes-agent` are preserved in place. Per-user auth/skills/sessions always live under `~/.hermes/` (even when code is under `/usr/local/lib`).

Cited: https://hermes-agent.nousresearch.com/docs/getting-started/installation#install-layout and `/tmp/install.sh` lines 436-470 (`resolve_install_layout`).

### 1.10 Post-install wiring

- Clones/updates git repo (`git clone --depth 1` or `git fetch + checkout BRANCH/COMMIT`), restores `package-lock.json` churn, writes `.hermes-bootstrap-complete` atomic marker.
- Seeds `~/.hermes/config.yaml` from `cli-config.yaml.example` if absent; never overwrites existing.
- Creates `SOUL.md`, `~/.hermes/.env` (`chmod 600`), `memories/`, `skills/.bundled_manifest`.
- Prints `📁 Your files` + `🚀 Commands` banner; root → no shell reload needed; normal → `source ~/.bashrc` / `~/.zshrc`.
- `maybe_start_gateway()` checks `~/.hermes/.env` for `TELEGRAM_BOT_TOKEN` etc.; offers WhatsApp `hermes whatsapp` pairing, then `systemctl` vs `nohup` gateway bootstrap, and `sudo loginctl enable-linger <user>` hint.

Cited: `/tmp/install.sh` lines 2720-2970.

---

## 2. `install.ps1` — Windows (Native, no WSL) — What It Installs

### 2.1 Entry point

```powershell
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
.\install.ps1 -SkipSetup -Branch main -HermesHome C:\data\hermes
install.ps1 -ShowResolvedPaths  # diagnostic JSON, no side effects
```

Source: https://hermes-agent.nousresearch.com/docs/getting-started/installation (≈ `install.ps1` mirrors `install.sh`) + `/tmp/install.ps1` header (lines 1-40, `param()` block).

### 2.2 Constants (from `/tmp/install.ps1` lines 388-410)

```powershell
$PythonVersion = "3.11"
$PythonFallbackVersions = @("3.12","3.13","3.10")
$NodeVersion = "22"                         # vs 26 on POSIX
$NpmRange = "<11.10.0 || >=11.17.0"         # from package.json engines.npm
$InstallStageProtocolVersion = 1
$RepoUrlSsh / $RepoUrlHttps   # same as install.sh
```

Windows pins Node 22 LTS (not 26) and accepts broader Python fallback order; NpmRange is a fallback constant before `package.json` is cloned.

### 2.3 What it installs (mirrors POSIX, plus Windows extras)

| Component | Where | Notes |
|-----------|-------|-------|
| **uv** (`uv.exe`) | `%LOCALAPPDATA%\hermes\bin\uv.exe` (=`$HermesHome\bin\uv.exe`) | 3-rung installer: `https://astral.sh/uv/install.ps1` → GitHub releases mirror → salvage existing `uv.exe` from PATH/`%USERPROFILE%\.local\bin`. Honors `$env:HERMES_HOME` / `-HermesHome`. |
| **Python 3.11** | Via `uv python find/install` | Same hermetic logic; fallback candidates `3.12`/`3.13`/`3.10` tried when `3.11` unavailable (function `Resolve-AvailablePythonVersion`). |
| **Node.js 22 LTS** | `%LOCALAPPDATA%\hermes\node\` + symlinks in link dir | `Get-WindowsArch` probes `Win32_Processor.Architecture` (ARM64-aware; `Is64BitOperatingSystem` lies under Prism emulation) → picks `arm64`/`x64`/`x86` tarball. Puts managed Node dir **front** of persisted User `PATH` (`Set-ManagedNodeFirstOnUserPath`) so bundled wins over system. |
| **MinGit / PortableGit** | `%LOCALAPPDATA%\hermes\git\` (`~45 MB`) | **Windows-only.** Provides `git`, `bash`, and Unix tools Hermes shell uses. Only downloaded if `git --version` fails. Unpacked via 7-Zip/Expand. Completely isolated — doesn't touch system Git. README: "Hermes uses this bundled Git Bash to run shell commands." Cited: https://github.com/NousResearch/hermes-agent README and `$InstallDir` default branch. |
| **Build tools** | No `build-essential` equivalent | MSVC via `node-gyp` handled by Node; desktop plugin stages compile native modules with bundled toolchain. |
| **Playwright Chromium** | User Playwright cache | Installed via `npx playwright install chromium` + `install-deps` as on POSIX; 8.3-path-normalized (see §2.4). |
| **Browser Use CLI** | Same `$HermesHome\bin` | `uv tool install browser-use` |
| **cua-driver** | `C:\Program Files\…\CuaDriver` or per-user | Same 660 s guarded install; skipped if `/Applications` not writable analog doesn't apply on Windows. |

### 2.4 Windows-specific hardened plumbing

- **UTF-8 console:** `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()` so Playwright/npm box-drawing renders.
- **8.3 short-path normalization** (~200 lines): expands every profile-rooted env var (`TEMP`, `TMP`, `LOCALAPPDATA`, `APPDATA`, `USERPROFILE`) from `C:\Users\FIRST~1.LAS\…` long form via three resolvers: `kernel32!GetLongPathNameW`, `Scripting.FileSystemObject`, profile-root substitution. Without this every `Tee-Object -FilePath`, `New-Item` in stage bootstraps fails with `"An object at …\FIRST~1.LAS does not exist"`. Diagnostic JSON emitted by `-ShowResolvedPaths`.
- **`$ProgressPreference = "SilentlyContinue"`** — without this Windows PowerShell 5.1 repaints per-byte and throttles a 57 MB MinGit download from 20 s → 5 min.
- **Electron cache purge** (`Clear-ElectronBuildCache`) — removes corrupt `ELECTRON_CACHE` zips that make `electron-builder` unpack a tree missing `electron.exe`.

Cited: `/tmp/install.ps1` lines 80-370 (8.3 block), 580-670 (uv rungs), 890-1150 (Node/arch).

### 2.5 Flags (PowerShell `param()` block, lines 20-60)

`[-NoVenv] [-SkipSetup] [-SkipComputerUse] [-Branch] [-Commit] [-ForceCommit] [-Tag] [-HermesHome] [-InstallDir] [-Manifest] [-Stage] [-ProtocolVersion] [-NonInteractive] [-Json] [-ShowResolvedPaths] [-Ensure] [-PostInstall] [-IncludeDesktop]`. Mirrors POSIX set; `-Tag` is Windows-additional; `-Branch/-Commit` accept `-Branch` / `-Commit` / `-Tag` aliases (case-insensitive).

### 2.6 Layout differences vs POSIX

|  | POSIX | Windows |
|--|-------|---------|
| Data dir | `~/.hermes/` | `%LOCALAPPDATA%\hermes\` (`C:\Users\<you>\AppData\Local\hermes`) |
| Code dir | `~/.hermes/hermes-agent` | `%LOCALAPPDATA%\hermes\hermes-agent` |
| Binary link | `~/.local/bin/hermes` or `/usr/local/bin/hermes` | User `PATH` persisted entry + `%LOCALAPPDATA%\hermes\bin\` shim |
| Config path | `~/.hermes/config.yaml`, `~/.hermes/.env` (`${HERMES_HOME}/config.yaml`) | Same basenames under `%LOCALAPPDATA%\hermes\` |

---

## 3. `hermes setup` / `hermes setup --portal` / `hermes gateway setup` — Interactive TUI Flows

> Underlying code: `/usr/local/lib/hermes-agent/hermes_cli/setup.py` (3 876 lines). All prompting goes through `prompt()` / `prompt_choice()` (curses-based arrow-key menus when `prompt_toolkit` is available, readline fallback otherwise) + `prompt_yes_no()` / `masked_secret_prompt`. Navigation: `Left` returns to previous prompt (replaying earlier answers invisibly), `Esc` cancels the whole wizard (raises `_SetupCancelled`). Non-interactive (`not is_interactive_stdin()`) or `--non-interactive` prints `print_noninteractive_setup_guidance()` and exits.

Source: `/usr/local/lib/hermes-agent/hermes_cli/setup.py` lines 206-402, 265-3068.

### 3.1 Top-level `hermes setup` dispatch (`_run_setup_wizard_impl`)

```
hermes setup                          # auto-detected: full reconfigure if existing install, else 3-mode picker
hermes setup --portal                 # one-shot Nous Portal OAuth + model + gateway, skips rest
hermes setup --quick                  # existing installs: only prompt missing/unset items
hermes setup --reset                  # wipe config to DEFAULT_CONFIG before wizard
hermes setup --reconfigure            # alias for default on existing installs (backwards compat)
hermes setup --non-interactive        # prints guidance, exits
hermes setup model|tts|terminal|gateway|tools|telemetry|agent   # single section
```

From `hermes setup --help` (lines live):
```
positional {model,tts,terminal,gateway,tools,telemetry,agent}
--non-interactive  --reset  --reconfigure  --quick  --portal
```

#### 3.1.1 Fresh install vs existing install auto-detection

```python
active_provider = get_active_provider()
is_existing = bool(OPENROUTER_API_KEY) or bool(OPENAI_BASE_URL) or active_provider is not None
```

- **Existing:** banner "You already have Hermes configured — Running the full wizard — each prompt shows your current value. Press Enter to keep it." Flags: `--quick` does narrow missing-only flow; otherwise full wizard (Model → Terminal → Messaging → Tools). Backs up `config.yaml` → `config.yaml.bak.YYYYMMDD_HHMMSS`.
- **Fresh:** offers OpenClaw migration (`_offer_openclaw_migration` → `prompt_yes_no "Would you like to see what can be imported?"`), then the **three-mode picker**:

```
How would you like to set up Hermes?
> Quick Setup (Nous Portal) — free OAuth login, no API keys, model + tools (recommended)
  Full setup — configure every provider, tool & option yourself (bring your own keys)
  Blank Slate — everything off except the bare minimum; opt in to each capability
```

Source: `setup.py` lines 3245-3260, 3072-3340.

### 3.2 Quick Setup (Nous Portal) — `hermes setup --portal` / Quick picker choice

**Fastest path** — one OAuth covers 300+ models + Tool Gateway (web search, image generation, TTS, cloud browser).

Actual flow in `_run_first_time_quick_setup()`:

1. **Nous Portal header** → `_model_flow_nous(config)` handles both logged-out (device-code OAuth: open URL, enter code) and already-logged-in (curated Nous model picker) paths. Provider set to `"nous"` internally.
2. Re-sync `config` from disk (login/model save writes via its own load/save; wizard must not clobber).
3. **Terminal backend** (`setup_terminal_backend`) — *required* decision (see §8).
4. Apply defaults (`_apply_default_agent_settings`): `max_turns=150`, `tool_progress=all`, `compression.enabled=True @0.50`, `session_reset none`.
5. Gateway fork:
   ```
   Connect a messaging platform? (Telegram, Discord, etc.)
   > Set up messaging now (recommended)
     Skip — set up later with 'hermes setup gateway'
   ```
   If yes → `setup_gateway(config)` (Telegram/Discord/…); if no → `ensure_gateway_service(context="setup")` so cron still runs.
6. Success banner + `macOS Full Disk Access` tip on Darwin (probes `~/Library/Application Support/com.apple.TCC` writability).

`hermes setup --portal` short-circuits: calls `_run_portal_one_shot(config)` and returns before any other section.

Cited: `setup.py` lines 2872-3425, https://hermes-agent.nousresearch.com/docs/getting-started/quickstart#setup-modes.

### 3.3 Full Setup (wizard on existing or "Full setup" picker on fresh)

Runs four sections **sequentially** with left-arrow `GoBack` navigation between them:

| # | Section | Function | Skipped when |
|---|---------|----------|--------------|
| 1 | Model & Provider | `setup_model_provider(config)` | After OpenClaw migration and user accepts imported model (`_skip_configured_section`) |
| 2 | Terminal Backend | `setup_terminal_backend(config)` | Same |
| 3 | Messaging Platforms | `setup_gateway(config)` | Same (but `ensure_gateway_service` still runs) |
| 4 | Tools | `setup_tools(config, first_install=...)` | Same |

Saves `config` after each section, finally `_print_setup_summary`.

Detailed question flow per section follows in §§3.5-3.8.

### 3.4 Blank Slate — `hermes-agent` minimal baseline

Applies then forks.

**Forced ON (cannot be skipped):**
- Provider & Model (`setup_model_provider`) — agent cannot run without it.
- Terminal Backend (`setup_terminal_backend`).

**Forced state after baseline (`_blank_slate_minimal_toolsets` + `_blank_slate_minimize_config`):**

```python
platform_toolsets["cli"] = ["file","skills","terminal","vision"]  # explicit list → has_explicit_config
agent["disabled_toolsets"] = <all other toolsets>                 # hard suppression via agent.disabled_toolsets
agent["max_turns"] = 90
compression["enabled"] = False
memory["memory_enabled"] = memory["user_profile_enabled"] = False
checkpoints["enabled"] = smart_model_routing["enabled"] = False
session_reset["mode"] = "none"
display["tool_progress"] = "all"
```

*Rationale* baked in comments: `vision` kept because `read_file` cannot read images without it; `skills` kept because the essential `hermes-agent` operating manual must stay loadable.

**Fork question:**

```
How far do you want to go?
> Start with everything disabled — finish now (most minimal)
  Walk through all configurations — opt in to tools, skills, plugins, MCP
```

- Path 0: save + summary + Done.
- Path 1: successive `prompt_yes_no` gates for each capability — seed skills (`hermes skills opt-in --sync`), pick extra toolsets (`hermes tools` selector), review built-in plugins, add MCP servers, connect messaging (`setup_gateway`).

Optional override: `--no-skills` at install time or `hermes profile create --no-skills` writes `.no-bundled-skills` marker; Blank Slate honors it.

Cited: `setup.py` lines 3520-3715, and https://hermes-agent.nousresearch.com/docs/getting-started/quickstart (Blank Slate description).

### 3.5 Section: `hermes setup model` — `setup_model_provider()`

#### What it asks (interactive, with defaults shown)

Uses `hermes model` interactive provider picker under the hood.

1. **Provider list** (via `curses` / `prompt_choice`):
   - `Nous Portal` (OAuth, subscription, 300+ models + Tool Gateway — **recommended**)
   - `OpenAI Codex` (ChatGPT/Codex OAuth device code)
   - `Anthropic` (Max + extra credits OAuth **or** `ANTHROPIC_API_KEY`)
   - `OpenRouter` (`OPENROUTER_API_KEY`, `openrouter` / `openai` compat)
   - `Gemini` (`GOOGLE_API_KEY` / `GEMINI_API_KEY`)
   - `Hugging Face` (`HF_TOKEN`), `NVIDIA NIM`, `MinMax`, `MiniMax CN`, `Arcee`, `Xiaomi MiMo`, `Ollama Cloud`, DeepInfra, etc. (≈20 first-class providers)
   - `Custom endpoint` (`base_url` + `api_key` / `key_cmd` / `key_env`, + `api_mode` `chat_completions` vs `responses` vs `anthropic_messages`)
   - OAuth-only providers: `Qwen OAuth`, `MiniMax OAuth`, `xAI Grok OAuth` (browser PKCE login)
2. **Auth step** per provider:
   - OAuth → opens browser, device-code / PKCE login, writes `auth.json` / `~/.hermes/auth.json`.
   - API key → `prompt(..., password=True)` masked, then `save_env_value(KEY_ENV, value)` → `.env`.
   - Custom → prompt for `base_url`, `api_key`, `discover_models` flag, optional `default_headers` / `extra_headers`.
3. **Model picker** → curated list filtered by provider + discovered via `/v1/models` when `discover_models:true`. Writes `model.provider` + `model.default` in `config.yaml`.
4. **Auxiliary routing** (optional): vision / compression / tts_audio_tags / title_generation / background_review can each keep `provider:auto` (use main model) or be pinned to cheaper provider/model + `timeout`, `reasoning_effort`, `fallback_chain`.

#### Required vs optional in this section

- **Required once:** at least ONE provider (Portal / API key / OAuth / custom endpoint) + a model with ≥64 K context. Without it `hermes` refuses to start (`hermes_cli/setup.py` raises `"No provider configured"` and `hermes doctor` flags `✗ API key or custom endpoint configured`).
- **Optional:** every auxiliary override, fallback chain, named provider overrides, timeouts, extra headers — all have `auto` defaults that work.

Cited: `setup.py` lines 951-1155, `/usr/local/lib/hermes-agent/cli-config.yaml.example` Model + Providers sections, and https://hermes-agent.nousresearch.com/docs/integrations/providers.

### 3.6 Section: `hermes setup tts` — `setup_tts()` / `_setup_tts_provider()`

Prompted only by `hermes setup tts` (not part of full wizard unless tools surface needs it):

```
Text-to-Speech Provider (optional)
> None (skip TTS)
  Nous Tool Gateway (requires Portal subscription)
  OpenAI TTS (OPENAI_API_KEY)
  NeuTTS (local, needs espeak-ng + ~400MB model)
  KittenTTS (local, ~25-80MB, CPU-only, no API key)
```

- NeuTTS → `prompt_yes_no "Install espeak-ng now?"` / `pip install`, warns when missing.
- KittenTTS → `prompt_yes_no "Install KittenTTS now?"`, lightweight install.
- Choice written to `tts` / `auxiliary.tts_*` section; local models need `--workdir` audio cache.

Source: `setup.py` lines 1155-1410.

### 3.7 Section: `hermes setup terminal` — `setup_terminal_backend()`

See §8 for full backend comparison. Prompt flow detailed there; in brief this section asks **one required question** (backend picker) and then, branching on choice, zero or more **conditional questions** (tokens, host/user/key/port, API keys). Keeping current backend is always an explicit menu item and returns immediately without touching `config`.

### 3.8 Section: `hermes setup gateway` — `setup_gateway()` (also `hermes gateway setup`)

**Platform selector** (arrow-key multi-select, showing `✓ configured` vs `○ not configured` status inline):

```
Messaging Platforms (select any, Enter to confirm)
[ ] Telegram        Configure messaging platforms for Hermes Agent
[ ] Discord
[ ] Slack
[ ] WhatsApp (QR)
[ ] WhatsApp Cloud
[ ] Signal
[ ] Matrix
[ ] Mattermost
[ ] Email
[ ] Home Assistant
[ ] ... (20+ platforms: Telegram, Discord, Slack, WhatsApp, Signal, SMS/Twilio, Email, Home Assistant, Mattermost, Matrix, DingTalk, Feishu/Lark, WeCom, Weixin, BlueBubbles, QQ, Yuanbao, Teams, LINE, ntfy, Raft, IRC, Buzz, SimpleX, etc.)
```

For each selected platform, a dedicated `_setup_<platform>()` runs (examples):

**Telegram** (`_setup_telegram`, line 2027):
- Optional auto-onboarding: `_setup_telegram_auto()` attempts managed QR bot creation (`telegram_managed_bot.auto_setup_telegram_bot_result`); offers `Allow this Telegram account to use the bot? [Y/n]`
- `prompt("Telegram bot token", password=True)` validated by regex `^\d+:[A-Za-z0-9_-]{30,}$`
- `prompt("Additional allowed user IDs (comma-separated, optional)")`
- `prompt_yes_no("Use your user ID (<id>) as the home channel?", True)` → `home_channel`
- `prompt_yes_no("Add allowed users now?", True)` → `TELEGRAM_ALLOWED_USERS` in `.env`
- On failure, `hermes gateway setup` can be re-run idempotently; "Reconfigure Telegram? [y/N]" gate on re-entry.

**Other platforms:** analogous asks — `DISCORD_BOT_TOKEN`, `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN`, `SIGNAL_*`, `MATRIX_HOMESERVER`, `EMAIL_*`, `homeassistant URL + token`, `WHATSAPP_ENABLED` + `hermes whatsapp` QR pairing flow, etc. All secrets → `.env`; non-secrets (home channel, command menu caps, observe flags, channel overrides) → `~/.hermes/gateway-config.yaml` / `config.yaml`.

**After platform setup:**
```python
# Selected at least one → install the systemd/launchd service + start it
if any_messaging and prompt_yes_no("Install gateway as background service?", True):
    hermes gateway install [--system] / launchd
# Nothing selected → "No platforms selected. Run 'hermes setup gateway' later."
# Already-running case handled in maybe_start_gateway() (install.sh post-wizard)
```

Cited: `setup.py` lines 1983-2410, `gateway.py` service commands, and https://hermes-agent.nousresearch.com/docs/user-guide/messaging (Quick Setup wizard description) + https://hermes-agent.nousresearch.com/docs/user-guide/messaging/telegram (token + allowlist examples).

### 3.9 Section: `hermes setup tools` — `setup_tools()` & `hermes tools`

Shared flow for `hermes setup tools` + standalone `hermes tools` (curses UI + fallback line prompts):

- Lists toolsets with status: `✓ enabled` vs `○ disabled` + note like `"Modal Execution (optional via Nous subscription)"` or `"TTS: run 'hermes setup tts'"`.
- Multi-select editor (`hermes tools` curses panel) toggles each toolset **per platform** (`hermes-cli`, `hermes-telegram`, etc.) — writes `platform_toolsets` + `custom_toolsets` + `agent.disabled_toolsets` in `config.yaml`.
- Handles managed tool gateway prompt: `Use my Nous subscription vs Use my own provider account` for tools that can bill via Portal.

Cited: `setup.py` lines 2410-2430, `tools_config.py`, and https://hermes-agent.nousresearch.com/docs/user-guide/features/tools.

### 3.10 Section: `hermes setup agent` — `setup_agent_settings()` / `hermes setup telemetry`

- **Agent:** `max_turns` (`prompt "Max iterations" default 150` — validated `>0`), `tool_progress` (`prompt "Tool progress mode" valid: off/new/all/verbose/log`), `compression threshold` (`0.50-0.95`), `session_reset` mode (`prompt_choice` among `both/idle/daily/none/keep current` → `idle_minutes`/`at_hour` prompts).
- **Telemetry:** `prompt_yes_no("Enable local shared metrics?", False)` → `shared_metrics.enabled`.

Telemetry is the only section that's universally **optional** and defaults to off; `agent` settings have opinionated defaults and are pre-applied by `_apply_default_agent_settings` on fresh installs.

Source: `setup.py` lines 1401-1925, 2430-2460.

### 3.11 `hermes gateway setup` as standalone alias

```bash
hermes gateway setup   # same TUI as hermes setup gateway, callable without the umbrella wizard
```

- Exits cleanly with `Unknown setup section: <x>` + `Available sections:` list on typo.
- Non-interactive guard (`is_interactive_stdin() == False`) suppresses all prompts and prints `Run 'hermes setup' in an interactive terminal…` instead of hanging.

---

## 4. `config.yaml` Structure — `~/.hermes/config.yaml` + `$HERMES_HOME` Variants

### 4.1 Directory structure & file locations

```
~/.hermes/                     # = $HERMES_HOME (or %LOCALAPPDATA%\hermes on Windows)
├── config.yaml               # Non-secret settings — PRIMARY (top-level, easy to find)
├── .env                      # API keys, bot tokens, passwords (chmod 600)
├── auth.json                 # OAuth tokens (Nous Portal, OpenAI Codex, MiniMax, xAI Grok OAuth)
├── SOUL.md                   # Agent identity (slot #1 in system prompt)
├── memories/
│   ├── MEMORY.md             # Agent curated memory (≈2 200 chars / ~800 tokens, pruned by agent)
│   └── USER.md               # User profile (≈1 375 chars / ~500 tokens)
├── skills/
│   ├── .bundled_manifest     # origin hashes for bundled-skill sync
│   └── <skill>/SKILL.md
├── cron/                     # Scheduled jobs (cron DSL)
├── sessions/                 # Gateway sessions (per-platform transcripts)
├── logs/                     # errors.log, gateway.log, tool_calls.log (secrets redacted)
├── state.db                  # SQLite: sessions, messages, FTS (WAL by default, ~856 MB observed)
├── cache/terminal/           # Session temp artifacts (logs/pid/exit, spillover, sandboxes)
├── checkpoints/              # FS snapshots for rollback
└── projects.db / kanban.db / response_store.db / verification_evidence.db
```

Per-profile layout (named profiles via `hermes profile create <name>`):

```
~/.hermes/profiles/<profile>/
├── config.yaml               # profile-scoped config
├── .env
├── auth.json
├── skills/ + memories/ + sessions/ + cron/
└── home/                     # used when terminal.home_mode=profile
```

`HERMES_HOME` env overrides the base; `HERMES_HOME/.no-bundled-skills` marker suppresses bundled-skill seeding for that profile.

Cited: https://hermes-agent.nousresearch.com/docs/user-guide/configuration#directory-structure and live `ls -R /root/.hermes`.

### 4.2 Configuration precedence (highest → lowest)

1. **CLI arguments** — `hermes chat --model anthropic/claude-sonnet-4 --provider nous` (per-invocation override)
2. **`~/.hermes/config.yaml`** — primary non-secret file; wins for non-secret keys when both `config.yaml` and `.env` set it
3. **`~/.hermes/.env`** — fallback for env vars; **required** for secrets (API keys, tokens, passwords)
4. **Built-in defaults** — hardcoded in `config_defaults.py` when nothing else set
5. **Managed scope** (org deployments) — administrator can pin values via system-level managed directory that a standard user cannot override (see `Managed Scope` doc).

*Rule of thumb:* `hermes config set KEY VAL` routes automatically — secrets → `.env`, everything else → `config.yaml`.

Cited: https://hermes-agent.nousresearch.com/docs/user-guide/configuration#configuration-precedence

### 4.3 Key sections of `cli-config.yaml.example` (1986 lines, `/usr/local/lib/hermes-agent/cli-config.yaml.example`)

Below summarizes the authoritative template. Representative snippets (comments & defaults preserved by the installer):

#### `database`

```yaml
database:
  journal_mode: wal                 # wal (default) | delete — use delete on NFS/virtiofs
  # synchronous: FULL               # OFF|NORMAL|FULL|EXTRA (or 0-3); macOS floors <FULL → FULL
  # wal_autocheckpoint: 1000
  # journal_size_limit: 67108864
```

WAL is never live-downgraded; converting requires offline `PRAGMA journal_mode=DELETE`.

#### `runtime`

```yaml
runtime:
  nofile_soft_limit: 4096           # 0/false/null = disable; clamped to hard limit; no-op on Windows/sandbox
```

#### `model`

```yaml
model:
  default: anthropic/claude-opus-4.6   # "default" | "model" alias both work
  provider: auto                       # auto|openrouter|nous|anthropic|gemini|...|custom|ollama|vllm|llamacpp
  base_url: https://openrouter.ai/api/v1
  # api_key: ...                       # prefer .env
  # default_headers: { User-Agent: "curl/8.7.1" }  # merge over SDK defaults
  # context_length: 131072             # total input+output; leave unset → auto-detect
  # max_tokens: 8192                   # output cap only
```

Min-context guard: model must provide ≥64 K total context or startup rejects; local models need `--ctx-size 65536`.

#### `providers` (named custom providers)

```yaml
providers:
  night-gateway:
    base_url: https://llm.internal.example.com/v1
    key_env: NIGHT_API_KEY             # or api_key / key_cmd
    key_cmd: "gcloud auth print-access-token"  # token-printing helper, cached until expiry
    api_mode: chat_completions         # chat_completions | codex_responses | anthropic_messages
    extra_headers: { CF-Access-Client-Id: "xxxx" }
    request_timeout_seconds: 30
    stale_timeout_seconds: 90
    models:
      my-finetune-v2:
        context_length: 1000000
        prompt_caching: true
        timeout_seconds: 600
    discover_models: false
```

Precedence inside one entry: `--api-key` > `key_cmd` > `api_key` / `key_env`. `key_cmd` prints a bare token or `{"access_token": "...", "expires_in": 3600}` JSON.

#### `model` + `provider_routing` + `openrouter` response caching + `fallback_providers`

```yaml
provider_routing:             # only for openrouter provider
  sort: throughput
  only: [anthropic, google]
  ignore: [deepinfra]
fallback_providers:
  - provider: openrouter
    model: anthropic/claude-sonnet-4
  - provider: anthropic
    model: claude-sonnet-4
# legacy: fallback_model: { provider: openrouter, model: ... } still accepted (one-shot, mid-session swaps without losing history)
openrouter: { response_cache: true, response_cache_ttl: 300 }
```

#### `terminal` (the most nuanced section)

```yaml
terminal:
  backend: local                     # local|docker|ssh|modal|daytona|vercel_sandbox|singularity
  cwd: "."                           # "." = launch dir (CLI uses launch dir always; gateway uses this)
  temp_dir: ""                       # session temp root; "" → $TMPDIR else ~/.hermes/cache/terminal (auto-pruned >72 h)
  font_family: ""                    # Desktop xterm font: "MesloLGS NF" or CSS stack; falls back to JetBrains Mono
  timeout: 180                       # per-command secs
  lifetime_seconds: 300              # idle-reaper window for containers
  home_mode: auto                    # auto|real|profile — subprocess HOME policy (see §8)
  env_passthrough: []                # env names forwarded into sandbox (terminal + execute_code)
  docker_image: nikolaik/python-nodejs:python3.11-nodejs20
  singularity_image: docker://nikolaik/python-nodejs:python3.11-nodejs20
  modal_image: nikolaik/python-nodejs:python3.11-nodejs20
  daytona_image: nikolaik/python-nodejs:python3.11-nodejs20
  container_cpu: 1                   # cores (0=unlimited)
  container_memory: 5120             # MB
  container_disk: 51200              # MB
  container_persistent: true         # true=shared long-lived container; false=fresh per session
  # Docker-only extras:
  # docker_persist_across_processes: true
  # docker_shared_container_key: ""
  # docker_orphan_reaper: true
  # docker_mount_cwd_to_workspace: false
  # docker_run_as_host_user: false
  # docker_forward_env: [GITHUB_TOKEN]   # secrets from shell/.env (never in config.yaml)
  # docker_env: { DEBUG: "1" }           # literal KEY=value
  # docker_volumes: ["/host:/workspace/projects:ro"]
  # docker_extra_args: ["--gpus=all","--network=host"]  # raw `docker run` flags
  # docker_network: true              # false = --network=none air-gap
  # vercel_runtime: node24            # node24|node22|python3.13
  # modal_mode: managed|direct        # billing path
  # ssh_host/ssh_user/ssh_port/ssh_key stored in .env as TERMINAL_SSH_*
  # sudo_password: ""                # empty string = try empty, never prompt; unset = interactive prompt
```

`terminal.*` over `TERMINAL_*` env at startup via gateway bridge that re-derives `HERMES_MAX_ITERATIONS` from `agent.max_turns`.

#### Other major sections (one-line summaries, all configurable via `cli-config.yaml.example` or `hermes config set`)

| Section | Default / location | What it does |
|---------|-------------------|--------------|
| `updates` | `pre_update_backup: quick, backup_keep:5, non_interactive_local_changes: stash, auto_switch_parked_branch:true` | `hermes update` safety: quick (state snapshot) vs full (zip `HERMES_HOME`) vs off; stash vs discard for non-interactive |
| `compression` | `enabled:true, threshold:0.50, target_ratio:0.20, protect_last_n:20, protect_first_n:3, codex_* native` | Auto-summarize middle turns when `prompt_tokens ≥ threshold × context_length`; idle/ proactive prune caps; per-model thresholds |
| `tool_loop_guardrails` | `warnings_enabled:true, hard_stop_enabled:false, warn_after exact 2/same 3/no-progress 2` | Soft warnings vs hard circuit-breaker for runaway tool loops |
| `tool_budget` | `mcp_result_size_chars:50000` (vs 100K generic) | Spill large `mcp_*` tool results to disk (`~/.hermes/cache/spillover`) |
| `prompt_caching.cache_ttl` | `5m` (alt `1h`) | Anthropic prompt caching TTL when via OpenRouter/native Anthropic |
| `skills` | `creation_nudge_interval:15, external_dirs:[]` | Agent curates skills every N iterations; external dirs share skills across tools |
| `agent.max_turns` | `90` fresh / `150` quick-setup | Iteration budget per conversation (config.yaml authoritative; `HERMES_MAX_ITERATIONS` env bridged) |
| `display.tool_progress` | `all` (`off/new/all/verbose/log`) | How much tool activity to stream (CLI + messaging) |
| `session_reset` | `mode:none, idle_minutes:1440, at_hour:4, bg_process_max_age_hours:24, startup_orphan_sweep:true` | When gateway auto-clears session context (not memory) |
| `memory` | `memory_enabled:true, user_profile_enabled:true, memory_char_limit:2200, user_char_limit:1375, nudge_interval:10` | Bounded MEMORY.md/USER.md injected each session |
| `gateway` | `systemd_watchdog_seconds:0, delivery_ledger:true, restart_notification:true, gateway_restart_notification:true, max_concurrent_sessions:null` | Gateway reliability: watchdog, at-least-once delivery, concurrency cap |
| `browser` | `inactivity_timeout:120, extension_control.enabled:false, snapshot_threshold:15000` | Browser tool session lifecycle |
| `auxiliary.*` | `provider:auto, model:"", timeout:30, reasoning_effort:""` per task (`vision`, `web_extract`, `compression`, `title_generation`, `session_search`, `background_review`, `tts_audio_tags`) + per-task `fallback_chain` + `max_concurrency` + `extra_body` | Lightweight side-task models (auto → main model or OpenRouter Gemini Flash fallback) |
| `timeouts.tools.concurrent_batch / sequential_call` | `420 s` | Operation deadlines (`agent/deadline.py:resolve_timeout`); `0` = unbounded |
| `secrets.command` | unset | Run-once helper to populate env from vault/bitwarden at startup (vs `key_cmd` per-provider mid-session refresh) |
| `mcp_servers` | map `command+args+env` per server | MCP integration — `npx @modelcontextprotocol/server-github`, etc. |
| `platform_toolsets` / `custom_toolsets` / `agent.disabled_toolsets` | `platform_toolsets.cli = ["hermes-cli"]` default | Which toolsets load per platform; Blank Slate explicitly writes these |
| `security.tirith_*` | `tirith_enabled:false` | tirith pre-exec scan (homograph, pipe-to-shell) |

Full precedence and env-substitution rules:

```yaml
auxiliary:
  vision: { api_key: ${GOOGLE_API_KEY}, base_url: ${CUSTOM_VISION_URL} }
  # Also accepts ${env:VAR} (Cursor/Claude parity); bare $VAR not expanded
  # Unknown prefixes (${file:...}) stay verbatim — injected via secrets.command
```

Source: `/usr/local/lib/hermes-agent/cli-config.yaml.example` (1986 lines) + https://hermes-agent.nousresearch.com/docs/user-guide/configuration (Database, Runtime Limits, Env Substitution, Updates, Terminal Backend sections). Hardcoded defaults live in `hermes_cli/config_defaults.py`.

### 4.4 Profiles — Running Multiple Agents

- Create: `hermes profile create <name> [--no-skills]`, switch: `hermes -p <name>`, list: `hermes profile list`
- Each profile is a full isolated `HERMES_HOME` (own `config.yaml`, `.env`, `auth.json`, `skills/`, `state.db`, `SOUL.md`).
- Share/distribute: `hermes profile export <name>` → zipped distribution (credentials excluded by design; `hermes backup` / `hermes import` move the whole home including secrets).
- Cross-process labels: `hermes-task-id`, `hermes-profile` (sanitized) on Docker containers so reuse is profile-scoped (or `docker_shared_container_key` to intentionally share one identity across trusted profiles).
- CLI flag precedence: `--profile` or `-p`, `HERMES_HOME` env.

Cited: https://hermes-agent.nousresearch.com/docs/user-guide/configuration#profiles and live `ls /root/.hermes/profiles` showing `yasmin` profile.

### 4.5 Cron & gateway specifics in config

```yaml
cron: {}
gateway:
  systemd_watchdog_seconds: 0        # opt-in Linux watchdog (Type=notify)
  delivery_ledger: true              # durable at-least-once redelivery (3 tries, 24 h freshness, 7 d prune)
  streaming: { enabled:false, transport: edit, edit_interval:0.3, buffer_threshold:40 }
  platforms:                         # per-platform overrides live in gateway-config.yaml
    telegram: { extra: { status_indicator:false, command_menu:{max_commands:60} } }
```

Cron scheduler ticks every 60 s; deliveries use `cron`/`hermes send`/`gateway notifier`.

---

## 5. `hermes doctor` — Diagnostics

### 5.1 `hermes doctor` output (live run on 2026-08-31, root FHS install, v0.20.6)

```
┌─────────────────────────────────────────────────────────┐
│                 🩺 Hermes Doctor                        │
└─────────────────────────────────────────────────────────┘

◆ Security Advisories          ✓ No active advisories
◆ MCP Server Security          ✓ No suspicious MCP stdio commands
◆ Python Environment           ✓ Python 3.11.15, SQLite 3.53.1, WAL mode on all 6 DBs, venv active, version files consistent (0.20.6)
◆ SSL / CA Certificates        ✓ CA bundle valid
◆ Required Packages            ✓ openai, rich, dotenv, pyyaml, httpx, croniter, python-telegram-bot; ⚠ discord.py not installed (optional)
◆ Configuration Files          ✓ .env exists, API key/endpoint configured, config.yaml exists, v39 up-to-date, no deprecated keys
◆ xAI Model Retirement (May 15, 2026)  ✓ No retired xAI models
◆ Auth Providers               ✓ Nous Portal logged in; ⚠ OpenAI Codex / MiniMax OAuth / xAI OAuth not logged in
◆ Directory Structure          ✓ all of ~/.hermes/{cron,sessions,logs,skills,memories,SOUL.md,MEMORY.md,USER.md,state.db}
◆ Gateway Service              ✓ systemd linger enabled
◆ Command Installation         ✓ venv/bin/hermes; ✗ ~/.local/bin/hermes not found (needs `hermes doctor --fix` on per-user installs)
◆ External Tools               ✓ git, ripgrep, docker, Node.js; ⚠ agent-browser not installed; ✓ workspace deps
◆ API Connectivity             ✓ OpenCode Go, CommandCode Router; ⚠ OpenRouter not configured; ✗ Anthropic invalid key (36 checks in parallel)
◆ Tool Availability            ✓ 20+ tools (terminal, file, web, vision, memory, delegation…); ⚠ browser/computer_use missing deps, discord/spotify/tts/x_search missing secrets
◆ Skills Hub                   ✓ lock OK (0 hub skills); ⚠ No GITHUB_TOKEN (60 req/hr)
◆ Memory Provider              ✓ Built-in memory active
◆ Profiles                     ✓ 16 profiles (including yasmin); ⚠ orphan aliases yasemin→missing, yasemin-kutu→missing
────────────────────────────────────────────────────────────
  Found 1 issue(s) to address:
  1. Missing ~/.local/bin/hermes symlink — run 'hermes doctor --fix'
```

### 5.2 Check categories (code path `hermes_cli/doctor.py` + `hermes_cli/_early_recovery.py`)

| Category | What it verifies |
|----------|------------------|
| Security Advisories | Active advisory DB; `hermes doctor --ack <ID>` suppresses banner |
| MCP Server Security | Suspicious `stdio` commands in `mcp_servers` |
| Python Env | `python --version`, `sqlite3 --version`, `journal_mode` per DB (WAL vs delete, WAL file size, free pages, process holders), venv active, `version.json` consistency |
| SSL / CA | CA bundle validity |
| Packages | Required (`openai`, `rich`, `dotenv`, `pyyaml`, `httpx`) vs optional (`croniter`, `python-telegram-bot`, `discord.py`) |
| Config Files | `.env`/`config.yaml` existence, config version `v39`, deprecated keys/env migration hints, API key or custom endpoint presence |
| Auth Providers | `Nous Portal` JWT/refresh quarantine, `OpenAI Codex`, `MiniMax OAuth`, `xAI` OAuth, `Copilot` token import path |
| Directories | Every `~/.hermes/*` dir/file listed in §4.1, `state.db` logical size (856 MB observed), page/Frees/WAL, FTS tables (`messages_fts`, `messages_fts_trigram`) |
| Gateway Service | `systemd --user linger` enabled, service installed snapshot |
| Command | `venv/bin/hermes` exists vs symlink in `~/.local/bin` or `/usr/local/bin` depending on layout |
| External Tools | `git`, `rg`, `docker`, `node`, `agent-browser`, npm dep vulnerability scan (`workspace`, `ui-tui`) |
| API Connectivity | Parallel probes (36) per provider — HTTP status, auth, model discovery |
| Tools | Whether each built-in tool would load (checks secret + dep gating) |
| Skills Hub | Lock file, GITHUB_TOKEN rate-limit warning |
| Memory Provider | Built-in vs Honcho/external plugin contract v2 |
| Profiles | Count, per-profile `config.yaml` presence, orphan alias detection |

### 5.3 CLI surface

```bash
hermes doctor               # static checks only (default)
hermes doctor --fix         # auto-fix what's fixable (symlink, missing deps, perms)
hermes doctor --live        # plus one bounded read-only real-call probe per tool backend (Firecrawl/FAL/browser/MCP/TTS/STT) — makes real network calls
hermes doctor --ack ADV-2026-03   # acknowledge advisory, suppress banner
```

Source: `hermes doctor --help` and https://hermes-agent.nousresearch.com/docs/getting-started/installation#troubleshooting ("For more diagnostics, run hermes doctor").

---

## 6. `hermes config set/get` — The Configuration CLI

### 6.1 Subcommands

```
hermes config                # view current config (pretty "⚕ Hermes Configuration" panel)
hermes config show           # alias
hermes config edit           # $EDITOR on config.yaml
hermes config get [KEY] [--json]           # print resolved value
hermes config set [KEY] [VALUE] [--force]  # set (auto-routed to right file)
hermes config unset [KEY]    # remove user-set value
hermes config path           # print config.yaml path
hermes config env-path       # print .env path
hermes config check          # check missing/outdated options (after updates)
hermes config migrate        # interactively add missing options (prompt for values)
```

From `hermes config --help` and `hermes config set --help` (live).

### 6.2 Key syntax (dot-notation, env passthrough)

```bash
hermes config get model
# → {'default': 'muse-spark-1.2-contributor', 'provider': 'sex-go', ...}

hermes config set model anthropic/claude-opus-4      # shorthand sets model.default
hermes config set terminal.backend docker              # → config.yaml
hermes config set OPENROUTER_API_KEY sk-or-…          # → .env (auto-detected as secret)
hermes config set terminal.backend docker --force      # suppress unknown-key notice
hermes config get model --json                        # machine-readable

# Env substitution in config.yaml (literal, not bare $VAR):
auxiliary:
  vision: { api_key: ${GOOGLE_API_KEY} }
  delegation: { api_key: ${env:DELEGATION_KEY} }      # Cursor-style ${env:} also works
```

- **Auto-routing rule:** key name matches `*_API_KEY`, `*_TOKEN`, `*_PASSWORD`, `*_SECRET`, `*_KEY` → `.env`; everything else → `config.yaml`. Verified by logging in `config.py:save_config` / `save_env_value`.
- **Precedence reminder:** CLI `--model` flag / `config.yaml` / `.env` / defaults (see §4.2).
- **Check/migrate:** after `hermes update`, `hermes config check` diffs `DEFAULT_CONFIG` vs on-disk config and reports missing keys; `hermes config migrate` prompts with `prompt("…", default)` for each gap and writes them.

Cited: https://hermes-agent.nousresearch.com/docs/user-guide/configuration#managing-configuration and `hermes_cli/config.py` (lines 500-850, `migrate_config(interactive=True)`).

### 6.3 Live `hermes config show` panel (abridged)

```
◆ Paths          Config: /root/.hermes/config.yaml  Secrets: /root/.hermes/.env  Install: /usr/local/lib/hermes-agent
◆ API Keys       OpenRouter (not set)  Anthropic sk-6…ff6d  …
◆ Model          {'default': 'muse-spark-1.2-contributor', 'provider': 'sex-go', 'base_url': 'https://opencode.ai/zen/go/v1', 'discover_models': True}
◆ Display        Personality: none  Reasoning: off  Bell: off  tool_progress: all
◆ Terminal       Backend: local  Working dir: .  Timeout: 180s
◆ Compression    Enabled: yes  Threshold: 50%  Model: (auto)
◆ Auxiliary      Vision provider=opencode-go model=mimo-v2.5
◆ Messaging      Telegram: configured  Discord: not configured
  → hermes config edit / hermes config set <key> <value> / hermes setup
```

---

## 7. How Terminal Backends Are Chosen During Setup

### 7.1 Picker (`setup_terminal_backend` in `setup.py` lines 1406-1795)

Single **required** question, with conditional follow-ups:

```
Choose where Hermes runs shell commands and code.
   Guide: https://hermes-agent.nousresearch.com/docs/user-guide/configuration#terminal-backend-configuration

Select terminal backend:
> Local - run directly on this machine (default)
  Docker - isolated container with configurable resources
  Modal - serverless cloud sandbox
  SSH - run on a remote machine
  Daytona - persistent cloud development environment
  Vercel Sandbox - cloud microVM with snapshot filesystem persistence
  [Linux only] Singularity/Apptainer - HPC-friendly container
  [plugin-registered backends, if any - e.g. "my-plugin - does X"]
  Keep current (local)   ← returns immediately, no file writes
```

Numbering is dynamic (`idx_to_backend` map built at runtime: `is_linux` adds Singularity; `discover_plugins() → list_providers()` adds plugin entries fail-soft).

Source: `setup.py:1406-1475` and https://hermes-agent.nousresearch.com/docs/user-guide/features/tools#terminal-backends.

### 7.2 Per-backend follow-up questions

#### `local` — no follow-ups

```python
config["terminal"].setdefault("cwd", str(Path.home()))
```
Only optional notes: gateway working dir defaults to home; sudo handled elsewhere; configurable later via `hermes setup terminal`.

#### `docker`

- **Probe:** `shutil.which("docker")` → warning + `https://docs.docker.com/get-docker/` if absent.
- **Default image:** `nikolaik/python-nodejs:python3.11-nodejs20` (same for Singularity/Modal/Daytona).
- **Egress firewall gate:**
  ```
  Docker sandboxes can be protected with the egress credential firewall.
  It routes sandbox traffic through iron-proxy so containers receive proxy tokens instead of real API keys.
  Docker only for now; Modal, SSH, Daytona, Singularity are not wired yet.
    Enable egress firewall for Docker sandboxes? [y/N]
  ```
  If yes → `proxy.enabled=true, proxy.enforce_on_docker=true` + hint `hermes egress setup / start`.
- **Advanced Docker keys** left at defaults; tuned later via `config.yaml` or `hermes gateway setup` for mounts (`docker_volumes`, `docker_network:false` for air-gap, `docker_forward_env`, `docker_extra_args:["--gpus=all"]`, `docker_persist_across_processes`, etc. — see §4.3).

#### `modal`

- Detects managed billing eligibility: `managed_nous_tools_enabled() and nous_auth_present and is_managed_tool_gateway_ready("modal")`.
- If eligible → `prompt_choice("Select how Modal execution should be billed:", ["Use my Nous subscription","Use my own Modal account"], default=0 if already `modal_mode:managed` else 1 if `MODAL_TOKEN_ID` present else 0)`.
  - `managed` → `config.terminal.modal_mode=managed`
  - `direct` → pip install `modal` if missing (`uv pip install modal` / `_pip_install(["modal"])`), then:
    ```
    Get your token at: https://modal.com/settings
      Modal Token ID     (masked)
      Modal Token Secret (masked)
    ```
    Stored in `.env` as `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET`. Offers `Update Modal credentials? [y/N]` when already set.

#### `ssh`

```
SSH host (hostname or IP)        [current from TERMINAL_SSH_HOST or ""]
SSH user                          [current from TERMINAL_SSH_USER or $USER]
SSH port                          [22, only stored if ≠22]
SSH private key path              [current or ~/.ssh/id_rsa]
  Test SSH connection? [Y/n]
  → ssh -o BatchMode=yes -o ConnectTimeout=5 [-i key] [-p port] user@host "echo ok"
     ✓ SSH connection successful!  |  ⚠ SSH connection failed: <stderr>
```

All stored in `.env` as `TERMINAL_SSH_HOST/USER/PORT/KEY`.

#### `daytona`

- `pip install daytona` if missing → `_pip_install(["daytona"])` with stderr tail.
- `Daytona API key (masked)` → `.env` `DAYTONA_API_KEY` (with `Update API key? [y/N]` gate).
- Info: `https://daytona.io`, "Each session gets a dedicated sandbox with filesystem persistence."

#### `vercel_sandbox`

- `pip install 'hermes-agent[vercel]'` via managed `uv` (`$HERMES_HOME/bin/uv pip install --python $(which python) vercel`) or `pip`.
- Then `_prompt_vercel_sandbox_settings(config)` asks for:
  ```
  VERCEL_TOKEN       (masked)
  VERCEL_PROJECT_ID  (masked)
  VERCEL_TEAM_ID     (masked)   # or VERCEL_OIDC_TOKEN short-lived (vc project token)
  vercel_runtime: node24 | node22 | python3.13 (default node24, workspace /vercel/sandbox)
  ```
  Validates `container_persistent` semantics (snapshots preserve FS, not PIDs).
- **Auth note:** local dev alternative `VERCEL_OIDC_TOKEN="$(vc project token <project>)" hermes chat` from linked Vercel project dir.

#### `singularity` (Linux only)

- Probes `which apptainer || which singularity` → warning + `https://apptainer.org/docs/admin/main/installation.html` if absent.
- Sets default image `docker://nikolaik/python-nodejs:python3.11-nodejs20`; lifecycle `apptainer build ~/python.sif docker://…`.

#### Plugin backends

- Each `agent.terminal_env_registry.list_providers()` entry contributes `display_name - description`; `setup_instructions()` printed verbatim, then `post_setup()` hook called (fail-soft).

### 7.3 Env bridge after choice

```python
save_env_value("TERMINAL_ENV", selected_backend)
if selected_backend=="modal": save_env_value("TERMINAL_MODAL_MODE", config["terminal"].get("modal_mode","auto"))
if selected_backend=="vercel_sandbox": save_env_value("TERMINAL_VERCEL_RUNTIME", ...)
save_config(config)
```

`terminal_tool` reads `TERMINAL_ENV` as source of truth at runtime; `config.yaml` remains authoritative but is bridged into env for subprocess.

### 7.4 Resource & persistence knobs (same across container backends)

Configured later in `config.yaml` (not prompted during `setup terminal` unless user re-enters that section):

```yaml
container_cpu: 1            # cores (0=unlimited)
container_memory: 5120      # MB
container_disk: 51200       # MB (overlay2 XFS+pquota required for disk)
container_persistent: true  # true = one long-lived container shared across sessions/subagents; false = fresh per session (secure boundary)
terminal.lifetime_seconds: 300
terminal.docker_network: true   # false = --network=none air-gap
```

See §4.3 for the labeled container lifecycle: `hermes-agent=1, hermes-task-id=<id>, hermes-profile=<name>` → reuse by `docker ps --filter label=…`; exited containers are `docker start`'d rather than recreated.

Source: `setup.py:1473-1650`, `config.py: database/terminal` blocks, and https://hermes-agent.nousresearch.com/docs/user-guide/configuration#terminal-backend-configuration + https://hermes-agent.nousresearch.com/docs/user-guide/features/tools#terminal-backends.

---

## 8. How Lokma Can Mirror This as `lokma init` / `lokma setup`

> Goal: replicate Hermes' installer → wizard → `config.yaml/.env` → `doctor` → `config set/get` → terminal-backend-choser flow, but tuned for Lokma (Turkish pastry/domain + ops/product vocab: *lokma*, *tatlı*, *çıtır* tones optional, default serious). Offer **optional checkboxes** so users aren't forced through every question.

### 8.1 Command surface (proposed)

```
lokma init                          # first-run: clone/setup deps, then launch wizard (like hermes setup quick picker)
lokma init --no-setup               # clone/deps only, no wizard
lokma init --yes / --non-interactive # CI: accept defaults, fail if a required secret is missing
lokma setup                         # full reconfigure wizard (existing installs): shows current values, Enter keeps
lokma setup --portal-equivalent --quick  # fast path: OAuth / hosted API + sensible defaults
lokma setup --reset                 # wipe lokma.yaml → defaults before wizard
lokma setup <section>               # single-section: lokma setup database | auth | backend | gateway | tools | agent | ui

# parity aliases inside wizard + standalone:
lokma config  [show|edit|get|set|unset|path|env-path|check|migrate]
lokma doctor  [--fix] [--live]
lokma gateway setup                 # messaging/integration setup standalone (like hermes gateway setup)
```

Cited design debt: mirrors `hermes setup` modes (`--portal`, `--quick`, `--reset`, `--non-interactive`, `section` arg) and `hermes config set/get` + `hermes doctor` so muscle memory transfers.

### 8.2 Installer parity (`install.sh` → `lokma-install.sh`)

**Required to auto-install (no user action):**
- `uv` equivalent: choose one manager (`uv`, `pipx`, or `mise`) and install to `$LOKMA_HOME/bin/uv` (not `~/.local/bin`) — keeps `lokma update` + installer in sync.
- Python pinned version (e.g. `3.11` or `3.12`) via `uv python install` — log `Python 3.11 not found, installing via uv…` like Hermes.
- Node LTS (e.g. `22` or `20`) fetched as tarball from `nodejs.org/dist/latest-vXX.x/` with `22.22+/24.11+/26+` compatibility gate; keep `rg` + `ffmpeg` via `brew`/`apt`/`dnf`/`pacman` single combined call; Windows MinGit analog only if `git` missing.
- Venv at `$INSTALL_DIR/venv`, `uv sync --locked` (Tier 0) → `uv pip install -e ".[all]"` fallback.

**Layout to copy:** per-user `~/.lokma/lokma-agent/` + `~/.local/bin/lokma` symlink vs root FHS `/usr/local/lib/lokma-agent/` + `/usr/local/bin/lokma` (detect `id -u==0`).

**Flags to copy:** `--skip-setup`, `--skip-browser` (if Lokma has browser tool), `--no-skills` → `--no-templates` (Blanks Slate marker), `--branch/--commit`, `--dir/--lokma-home`, `--ensure node,ripgrep,ffmpeg`, `--include-desktop`, `--non-interactive`, stage protocol if Lokma grows a desktop installer.

**What Lokma can skip:** `cua-driver`/Playwright unless needed. Keep the pattern (best-effort pre-install so later `lokma setup backend browser` is a flip).

### 8.3 Wizard architecture (re-use Hermes' state machine)

**Adopt directly:**
- `prompt` / `prompt_choice` (curses arrow-key menus; readline fallback) + `prompt_yes_no` + `masked_secret_prompt`.
- `is_interactive_stdin()` guard + `--non-interactive` early return printing `Run 'lokma setup' in an interactive terminal…`.
- Left-arrow `GoBack` per-section replay (`answers_by_section` + `replay_by_section`) and `Esc` → `_SetupCancelled` → `"Remaining sections were not changed."`.
- Backup `lokma.yaml.bak.YYYYMMDD_HHMMSS` before mutating.
- `K Keep current (<value>)` as the last choice in every `prompt_choice` list — returning immediately keeps idempotency.

**Sections map (Lokma-analogue of Hermes' SETUP_SECTIONS):**

| # | Hermes section | Lokma equivalent | Mandatory? |
|---|---------------|------------------|------------|
| 1 | Model & Provider | `lokma setup auth` / `database` — LLM provider, embeddings, API keys, OAuth | **Required once** (at least one provider; otherwise `lokma` refuses first chat same as Hermes' 64 K guard) |
| 2 | Terminal Backend | `lokma setup backend` — where Lokma runs commands (`local`/`docker`/`ssh`/`modal`/`daytona`/…) | **Required once** — default `local`; offer `Keep current` |
| 3 | Messaging / Gateway | `lokma setup gateway` — integrations (Telegram, WhatsApp, webhooks) | **Optional** — default skip with `ensure_gateway_service` so cron still works |
| 4 | Tools | `lokma setup tools` — which toolsets are enabled per environment | **Optional** — defaults to `file + terminal + vision` |
| 5 | Agent Settings | `lokma setup agent` — `max_turns`, `tool_progress`, `compression`, `session_reset` | **Optional** — defaults pre-applied; explicit `lokma setup agent` to tune |
| 6 | Telemetry | `lokma setup telemetry` | **Optional**, defaults off |

### 8.4 First-run three-mode picker (with **optional checkboxes**)

Copy Hermes' `setup_mode = prompt_choice(...)` with 3 entries, but render each follow-on step as a **checkbox panel** when `curses` is available (checked by default for required steps, unchecked for optional):

```
How would you like to set up Lokma?

> Lokma Serisi (Hızlı) — hosted API + sensible defaults  [recommended]
  Full (kendin kur) — every provider/tool/option yourself
  Minimal — only provider + shell; opt in to each capability

If Full/Minimal: configure now? (Space = toggle, → = continue)

  [x] Provider & Model        (required)      → calls lokma setup auth
  [x] Backend                 (required)      → local vs docker/ssh/modal/…
  [x] Terminal env (cwd, timeout, HOME mode) (required, quick)
  [ ] Integrations / Gateway  (optional)      → gateway setup standalone
  [ ] Tools / Toolsets        (optional)      → checklist with tool names
  [ ] Agent (max turns, compression, reset)  (optional)
  [ ] Telemetry               (optional, off by default)

  [ Continue with checked ]  [ Cancel ]
```

Implementation hint: extend Hermes' `_run_setup_steps([ (label, action), … ])` to accept a `checked: bool` per step; unchecked steps are skipped entirely (with `"Skipped — run 'lokma setup <section>' later"`), but `ensure_gateway_service` still runs when gateway is skipped so `cron` + later `lokma import` are live.

**Quick (Lokma Serisi)** path mirrors `_run_first_time_quick_setup`:
1. Hosted provider OAuth/API key → `auth` write.
2. Backend (one `prompt_choice` with `Keep current`).
3. `ensure_gateway_service()` + `_apply_default_agent_settings` (write `max_turns:150`, `tool_progress:all`, `compression.enabled:true` without prompting).
4. `prompt_choice("Connect an integration now?", ["Set up now","Skip — later with 'lokma setup gateway'"], 0)`.

**Minimal** path mirrors `_run_blank_slate_setup`:
1. Provider & Model (**required**, runs `lokma setup auth`).
2. Backend (**required**).
3. Write minimal toolsets: `platform_toolsets.cli = ["file","terminal","vision","templates"]` + `agent.disabled_toolsets = <all-others>` + `compression.enabled=false, memory.enabled=false, checkpoints.enabled=false` (copy comments from `setup.py:3488-3600`).
4. Fork `prompt_choice("How far do you want to go?", ["Start minimal — finish now","Walk through — opt in to each capability"], 0)`.

### 8.5 Config file parity (`lokma.yaml` ≈ `config.yaml` + `.env`)

```
~/.lokma/                        # = $LOKMA_HOME (respect env)
├── lokma.yaml                  # non-secrets — checked into dotfiles if desired
├── .env                        # secrets (API keys, tokens) — chmod 600
├── auth.json                   # OAuth (if any)
├── SOUL.md / IDENTITY.md       # persona (optional)
├── memories/  skills/  cron/  sessions/  logs/  state.db  projects.db
└── profiles/<name>/lokma.yaml  # named agents (lokma -p <name>)
```

**Sections to copy from `cli-config.yaml.example`:**
- `database: { journal_mode: wal, synchronous: FULL, wal_autocheckpoint }` (reuse SQLite logic; WAL vs delete).
- `runtime: { nofile_soft_limit: 4096 }`.
- `llm:` / `model:` (copy `provider: auto` + `base_url` + `key_env`/`key_cmd` + `discover_models` + `context_length`/`max_tokens` split).
- `providers:` map with `request_timeout_seconds` / `stale_timeout_seconds` / `models.<id>.timeout_seconds` / `extra_headers`.
- `terminal:` block verbatim — **keep every key name** so Hermes docs/StackOverflow answers remain searchable (including `backend` enum adding `local|docker|ssh|modal|daytona|vercel_sandbox|singularity` + any Lokma-specific additions). Document `home_mode` (`auto|real|profile`), `temp_dir` pruning, `docker_*`, `container_*`, `lifetime_seconds`, `sudo_password`, `env_passthrough`.
- `auxiliary.*` per-task `provider:model` + `fallback_chain` + `max_concurrency`.
- `updates: { pre_update_backup: quick|full|off, backup_keep, non_interactive_local_changes: stash|discard }`.
- `compression`, `tool_loop_guardrails`, `memory`, `session_reset`, `gateway`, `skills`, `mcp_servers`, `platform_toolsets`.
- Support `${VAR}` / `${env:VAR}` substitution (implemented by re-using Hermes' loader logic or a 30-line substitute; unknown `${file:…}` stays verbatim).

**Precedence:** `lokma --model …` flag > `lokma.yaml` > `.env` > defaults (same wording as Hermes doc §4.2). Auto-route `lokma config set FOO_API_KEY → .env` vs `terminal.backend → lokma.yaml`, with `--force` to suppress unknown-key notice.

### 8.6 `lokma doctor` diagnostics to ship from day one

Mirror Hermes'`doctor` categories (see §5.2). `lokma doctor` should check:
- `lokma doctor --fix` writes missing symlink / perms.
- `lokma doctor --live` does one bounded read-only call per backend (e.g., `GET /health`).
- Include: SQLite WAL size advisory (`state.db` >500 MB warn), orphan `profile → alias` map, `GITHUB_TOKEN` rate-limit hint, `python-telegram-bot` optional-dep check.

Emit the same `◆` grouped pretty panel plus machine-readable `lokma doctor --json` if Lokma has API consumers.

### 8.7 `lokma config set/get` to copy exactly

```bash
lokma config get llm
lokma config set llm.provider openrouter
lokma config set llm.default anthropic/claude-sonnet-4
lokma config set OPENROUTER_API_KEY sk-or-…        # → .env
lokma config set terminal.backend docker             # → lokma.yaml
lokma config path      # prints ~/.lokma/lokma.yaml
lokma config env-path  # prints ~/.lokma/.env
lokma config check     # diffs DEFAULT_LOKMA_YAML vs on-disk, reports missing keys
lokma config migrate   # prompts for each missing value
```

*Optional enhancement over Hermes:* add `lokma config set --from-env` (imports `LOKMA_*` env wholesale) and `lokma config diff` (show `lokma.yaml` vs `lokma.yaml.example`).

### 8.8 Terminal backend choice — reuse the same decision tree

Copy §7.1 picker verbatim (labels + dynamic Singularity-on-Linux + plugin registry). Follow-up questions:
- **local:** no prompts (but recommend `terminal.cwd: "."` vs home; warn if `.bashrc` lacks `case $- in *i*);; *) return;; esac` guard).
- **docker:** offer egress proxy even if Lokma won't use it yet — it teaches the isolation model.
- **modal:** offer `managed vs direct` billing gate (if Lokma hosts a gateway) + `MODAL_TOKEN_ID/SECRET` masked prompts.
- **ssh:** host/user/port/key + `Test SSH connection?` with `ssh -o BatchMode=yes`.
- **daytona:** `DAYTONA_API_KEY` + `daytona_image`.
- **vercel_sandbox:** `VERCEL_{TOKEN,PROJECT_ID,TEAM_ID}` + `vercel_runtime` (pin supported runtimes).
- **singularity:** warn + image.

Post-choice always `save_env_value("TERMINAL_ENV", selected)` + `save_config`.

### 8.9 Optional checkboxes — the Lokma-specific UX addition

Hermes itself hides nothing — every section in Full setup runs sequentially with only `Keep current` as an escape hatch, and the Blank Slate fork has two coarse outcomes. Lokma adds **fine-grained per-section opt-out**:

- Render as `curses` checkboxes (Space toggles, `a` = toggle all non-required, `Enter` = continue with checked set).
- When `curses`/`npx` not available (Docker, piped `curl | bash`), fall back to sequential `prompt_yes_no "Configure <section> now? [y/N]"` (same fallback as `install.sh`'s `prompt_yes_no` via `/dev/tty`).
- Persist choice: **unchecked** = section untouched (its keys remain whatever the template default is), but show next run `lokma setup --quick` → only prompts missing/unset items (so `--quick` becomes "fill in what I skipped").
- Flag parity: `lokma setup --only backend,gateway` / `--skip tools,agent` as CLI sugar over the checkbox state.

Wireframe (for Lokma designer):
```
┌─ Configure Lokma ─────────────────────────────┐
│ Which sections should this wizard configure?  │
│                                               │
│  [x] Provider & Model      required · model/llm│
│  [x] Backend               required · terminal │
│  [x] Env (cwd, timeout)    required           │
│  [ ] Gateway / Integrations optional · msg    │
│  [ ] Tools                  optional · toolsets│
│  [ ] Agent behavior         optional · limits │
│                                               │
│  [ Space toggle ] [ a all ] [ Enter continue ]│
│  Tip: left-arrow returns to previous choice.  │
└───────────────────────────────────────────────┘
```

### 8.10 File references for Lokma engineers to open first

- `/tmp/install.sh` (3678 lines; start at `install_uv`, `check_node`/`install_node`, `install_system_packages`, `install_node_deps`) — copy the combined `apt install ripgrep ffmpeg` + `brew`/`dnf`/`pacman` + `cargo` fallback branches.
- `/tmp/install.ps1` (5012 lines; start at `Get-WindowsArch`, managed `uv` 3 rungs, `ConvertTo-LongPath` 8.3 block, `Write-Banner`) — copy MinGit conditional and `Set-ManagedNodeFirstOnUserPath`.
- `/usr/local/lib/hermes-agent/cli-config.yaml.example` (1986 lines) — use as the template for `lokma.yaml.example`; delete Hermes-only keys (`managed_tools`, `browser.extension_control`, `codex_*` native).
- `/usr/local/lib/hermes-agent/hermes_cli/setup.py` (3876 lines) — read `_run_setup_wizard_impl`, `_run_first_time_quick_setup`, `_run_blank_slate_setup`, `setup_terminal_backend`, `_apply_default_agent_settings` (+ their comments that explain *why* choices like "keep vision when blank slate" were made).
- `hermes_cli/config.py` (`migrate_config`, `is_managed`, `get_hermes_home`) — copy config precedence + `backup` date stamp + `check`/`migrate` prompts.
- `hermes_cli/doctor.py` — copy check grouping + `--fix/--live/--ack` flags + WAL-size advisory.
- Live docs pagination at `/root/.hermes/cache/web/hermes-agent.nousresearch.com-*.md` (full pages after truncation; `web_extract` head+tail saved the rest) for prose that this file truncates.

---

## 9. Pitfalls & Lessons Extracted (for Lokma to avoid repeating)

- **Never re-prompt on non-interactive:** `install.sh` probes `: </dev/tty` (not just `test -e /dev/tty`) because Docker's `mount namespace` exposes a device node that fails to open with `ENXIO`; same probe guards `maybe_start_gateway`. Lokma must copy this.
- **uv lives outside PATH on purpose:** putting it under `$HOME/.hermes/bin` prevents Plan/Tool contamination from a stray `~/.local/bin/uv` or conda uv; Lokma should do the same (`$LOKMA_HOME/bin/uv`).
- **`package-lock.json` churn:** `restore_dirty_lockfiles()` after every `npm install` keeps `hermes update` from auto-stashing dirty lockfiles on every run. Copy.
- **Windows 8.3 + progress bar:** without `LongProfileRoot` + `ProgressPreference=SilentlyContinue`, `install.ps1` fails on `FIRST~1.LAS` profiles and downloads 10-100× slower. Lokma's Windows installer must copy both.
- **Gateway survives even when wizard skips messaging:** `ensure_gateway_service(context="setup")` ensures `cron` jobs run and `hermes import`-ed platforms become live — otherwise a skipped section looks broken. Lokma's gateway should also install when integrations are empty.
- **`Blank Slate` vs `Full` choice is durable:** `agent.disabled_toolsets` is a hard-suppression list applied *after* toolset recovery, so a future `lokma update` cannot re-enable tools the user intentionally blanked. The checkbox design must set this, not just leave `platform_toolsets` empty.

---

## 10. Quick Command Reference (Hermes → Lokma map)

| Hermes | Lokma proposal | Purpose |
|--------|---------------|---------|
| `curl …/install.sh \| bash` | `curl …/lokma-install.sh \| bash` | Clone, `uv`, python, node, `rg`/`ffmpeg`, venv, deps, seeds |
| `hermes setup` | `lokma setup` | Full wizard (auto-detects existing vs fresh → 3-mode picker) |
| `hermes setup --portal` | `lokma setup --hosted` (or `--quick`) | One-shot hosted provider OAuth/model + defaults + optional gateway |
| `hermes setup model` | `lokma setup auth` | Provider/API-key/OAuth picker |
| `hermes setup terminal` | `lokma setup backend` | Backend picker + conditional credential prompts |
| `hermes gateway setup` | `lokma gateway setup` | Messaging/integration selector + per-platform token/allowlist prompts |
| `hermes setup tools` / `hermes tools` | `lokma setup tools` / `lokma tools` | Toolset checklist per environment |
| `hermes config get/set` | `lokma config get/set` | Dot-notation config + auto `.env` routing |
| `hermes doctor [--fix/--live]` | `lokma doctor [--fix/--live]` | Diagnostics panel |
| `hermes update` | `lokma update` | Git pull + `uv sync --locked` + skill re-seed (honoring `.no-bundled-*` marker) |
| `hermes import` / `hermes backup` | `lokma import` / `lokma backup` | Move whole home including credentials |

All docs equivalents: replace `https://hermes-agent.nousresearch.com/docs/getting-started/installation` path with `https://lokma.example/docs/installation` but keep section anchors (`#prerequisites`, `#install-layout`, `#terminal-backend-configuration`) identical so search results align.

---

## 11. Citation Index (places to verify every claim)

- Install layout table & prerequisites: https://hermes-agent.nousresearch.com/docs/getting-started/installation
- Install commands & desktop one-liner: https://hermes-agent.nousresearch.com/docs/getting-started/installation#quick-install and https://github.com/NousResearch/hermes-agent#quick-install
- Node v26 (incl. "existing system Node 22.22+, 24.11+, or 26+ is used as-is"): https://hermes-agent.nousresearch.com/docs/getting-started/installation#prerequisites
- Quickstart provider/modes, `hermes setup --portal`, 64 K guard: https://hermes-agent.nousresearch.com/docs/getting-started/quickstart
- Config directory tree, `hermes config set` routing, precedence, env substitution, database/runtime/updates blocks: https://hermes-agent.nousresearch.com/docs/user-guide/configuration
- Terminal backend list + descriptions + Docker/SSH/Modal/Daytona/Vercel/Singularity one-liners: https://hermes-agent.nousresearch.com/docs/user-guide/configuration#terminal-backend-configuration and https://hermes-agent.nousresearch.com/docs/user-guide/features/tools#terminal-backends
- Providers catalog & fallback, auxiliary, Portal bundle: https://hermes-agent.nousresearch.com/docs/integrations/providers
- Messaging gateway Quick Setup wizard + gateway commands + watchdog + streaming: https://hermes-agent.nousresearch.com/docs/user-guide/messaging and subpages (e.g. https://hermes-agent.nousresearch.com/docs/user-guide/messaging/telegram)
- Hosted installers themselves: https://hermes-agent.nousresearch.com/install.sh, https://hermes-agent.nousresearch.com/install.ps1 (fetched to `/tmp/install.sh` 3678 lines, `/tmp/install.ps1` 5012 lines)
- On-disk template: `/usr/local/lib/hermes-agent/cli-config.yaml.example` (1986 lines, also at https://github.com/NousResearch/hermes-agent/blob/main/cli-config.yaml.example)
- Live CLI surfaces verified on-disk 2026-08-31: `hermes setup --help`, `hermes gateway --help`, `hermes config --help`, `hermes doctor` (full output §5.1), `hermes config show`
- Wizard source: `/usr/local/lib/hermes-agent/hermes_cli/setup.py` (3876 lines — 3-mode picker, quick/blank-slate/minimal toolsets, every setup_* function)
- Config + defaults + migrations source: `/usr/local/lib/hermes-agent/hermes_cli/config.py` + `config_defaults.py` + `config_migrations.py`

---

*Generated 2026-08-31 for Lokma research. Validate before coding — run `bash -x /tmp/install.sh --manifest` and `pip install -e . && lokma setup --help` on a throwaway VM to diff against Hermes line-for-line before freezing the Lokma spec.*
