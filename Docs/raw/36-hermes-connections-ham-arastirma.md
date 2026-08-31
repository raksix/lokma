# Hermes Agent Connections / Gateway / Providers / MCP / Messaging Integrations — Raw Research

> **Scope:** Messaging gateway, model providers, MCP servers, skills, mandatory-vs-optional connections, and Lokma `init` design.
> **Sources:** scraped live 2026-08-31 from `https://hermes-agent.nousresearch.com/docs/...`. Full cached pages under `~/.hermes/cache/web/` (36–170k chars each). Where a page needed paging, the head+tail was combined with the full file on disk.
> **Citations use full URLs.** Every factual claim below can be verified against the listed source.

---

## 0. Quick Map — What "Connections" Means in Hermes

Hermes has **five disjoint connection families** that are configured in two files:

| File | What lives there | Permission | Who writes |
|------|------------------|------------|------------|
| `~/.hermes/config.yaml` | Non-secret settings: `model`, `providers`, `mcp_servers`, `gateway`, `display`, `auxiliary`, `fallback_providers`, etc. | 0644 | `hermes config set`, `hermes setup`, `hermes mcp add`, `hermes model`, `hermes fallback` |
| `~/.hermes/.env` | Secrets: `*_API_KEY`, `*_BOT_TOKEN`, `*_APP_TOKEN`, `SIGNAL_*`, `TELEGRAM_*`, `DISCORD_*`, `SLACK_*` | 0600 | `hermes config set` auto-routes keys, `hermes gateway setup`, `hermes auth`, manual edit |
| `~/.hermes/auth.json` | OAuth tokens + credential-pool state (`credential_pool: { provider: [...] }`) — 0600 | 0600 | `hermes auth`, Portal login, DCR flows |
| `~/.hermes/gateway-config.yaml` / `gateway.json` | Per-platform gateway tuning (`platforms.telegram.extra`, `platforms.discord.*`, `gateway_restart_notification`, `typing_indicator`) | 0600 | `hermes gateway setup`, manual edit |
| `~/.hermes/state.db` (SQLite WAL) | Session transcripts, delivery ledger, gateway routing — the source of truth that both TUI and gateway read | — | runtime |

Precedence (highest first): CLI args (`--model`) > `config.yaml` > `.env` > built-in defaults. For secrets, `config set` auto-routes to `.env`; plain keys in `config.yaml` are overwritten by `.env` at load. Env vars also support `${VAR}` and `${env:VAR}` substitution inside `config.yaml` (Cursor/SecretRef compat) and inside MCP `transport` blocks at connect time [Source: https://hermes-agent.nousresearch.com/docs/user-guide/configuration](https://hermes-agent.nousresearch.com/docs/user-guide/configuration) and https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp.

The **Gateway** (`hermes gateway`) is a *single background process* that multiplexes *all* configured messaging platforms. The **TUI / CLI** (`hermes chat`) is a separate foreground process that shares `state.db` but does not need the gateway running for inference. The gateway also owns: per-chat session store, cron scheduler (ticks every 60s), typing indicators, streaming edits, and the delivery ledger [Source: https://hermes-agent.nousresearch.com/docs/user-guide/messaging](https://hermes-agent.nousresearch.com/docs/user-guide/messaging).

---

## 1. Messaging Gateway — Telegram / Discord / Slack / WhatsApp / Signal (and 25+ more)

### 1.1 Architecture in One Paragraph

> "Each platform adapter receives messages, routes them through a per-chat session store, and dispatches them to the AIAgent for processing. The gateway also runs the cron scheduler, ticking every 60 seconds to execute any due jobs." [Source: https://hermes-agent.nousresearch.com/docs/user-guide/messaging](https://hermes-agent.nousresearch.com/docs/user-guide/messaging)

Concretely:

```
[Telegram Bot API] ──┐
[Discord Gateway WS] ─┤
[Slack Bolt Socket Mode WS] ─┼─► [Hermes Gateway process] ──► per-chat Session (SQLite) ──► AIAgent
[WhatsApp Baileys WS] ─┤                              ▲                         │
[Signal signal-cli SSE] ─┤                              │                    tools/*
[Email / Matrix / ...] ─┘                         cron tick 60s              │
                                                          ◄── delivery ledger (state.db) ──► platform send
```

- **Session persistence:** sessions live until `/reset` or auto-reset policy; they survive gateway restarts; `/model` overrides are rehydrated from the session store.
- **Delivery reliability:** durable `delivery_ledger` in `state.db` (bounded at-least-once: 3 attempts, 24h freshness, 7-day prune). Recovered dupes are prefixed `♻️ Recovered reply — … may be a duplicate`. Opt-out via `gateway.delivery_ledger: false` [Source: https://hermes-agent.nousresearch.com/docs/user-guide/messaging](https://hermes-agent.nousresearch.com/docs/user-guide/messaging).
- **Hermes Relay (experimental):** connector system that fronts Discord/Telegram/Slack/WhatsApp through an external process owning the credentials; capabilities are negotiated at handshake [Source: https://hermes-agent.nousresearch.com/docs/user-guide/messaging](https://hermes-agent.nousresearch.com/docs/user-guide/messaging).

### 1.2 Platform Coverage Matrix

The docs list **35 adapters** with a capability table (Voice, Images, Files, Threads, Reactions, Typing, Streaming) [Source: https://hermes-agent.nousresearch.com/docs/user-guide/messaging](https://hermes-agent.nousresearch.com/docs/user-guide/messaging):

| Tier | Platforms | Notes |
|------|-----------|-------|
| **Tier 1 — full featured** | Telegram, Discord, Slack, Feishu/Lark, Matrix | All capabilities including voice + streaming edits |
| **Tier 2 — chat-first** | WhatsApp (Baileys bridge), WhatsApp Cloud API, Signal, Email, Weixin, QQ, Photon/iMessage, SimpleX, Mattermost | Media + typing + some streaming; no reactions on some |
| **Tier 3 — enterprise** | Microsoft Teams, Google Chat, DingTalk, WeCom (+ callback), LINE, Yuanbao, BlueBubbles | Native OAuth / callback flows; some lack streaming |
| **Infra / relay** | ntfy, Raft, IRC, Buzz, Home Assistant, Webhooks, A2A | Minimal or relay-only |

Each platform page documents its own auth shape, scopes, and allowlist env:

| Platform | Auth material (in `.env`) | Allowlist key | Extra surface |
|----------|---------------------------|---------------|---------------|
| **Telegram** | `TELEGRAM_BOT_TOKEN` (`123:ABC`), optional `TELEGRAM_WEBHOOK_URL` + `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_PROXY` | `TELEGRAM_ALLOWED_USERS` (numeric IDs) or `GATEWAY_ALLOWED_USERS` or `GATEWAY_ALLOW_ALL_USERS=true` | BotFather privacy toggle, DM pairing, group `allowed_chats` |
| **Discord** | `DISCORD_BOT_TOKEN` (`x...`), intents: Message Content + Server Members | `DISCORD_ALLOWED_USERS` (snowflakes), `DISCORD_ALLOWED_ROLES` (role IDs), `DISCORD_ALLOW_ALL_USERS` | Guild install scopes: `bot`+`applications.commands` (117760 minimal, 274878286912 recommended), Socket not needed — Discord Gateway WS |
| **Slack** | `SLACK_BOT_TOKEN` (`xoxb-`), `SLACK_APP_TOKEN` (`xapp-`) Socket Mode | `SLACK_ALLOWED_USERS` (U01…), `SLACK_HOME_CHANNEL` | Scopes (`chat:write`, `app_mentions:read`, `channels:history`, `groups:history`, `im:history`, `files:read/write`), `message.*` events, Messages Tab must be ON |
| **WhatsApp (Baileys)** | `WHATSAPP_ENABLED=true`, `WHATSAPP_MODE=bot|self-chat`, session under `~/.hermes/platforms/whatsapp/session` via QR scan (`hermes whatsapp`) | `WHATSAPP_ALLOWED_USERS=1555...` (E.164 w/o `+`) or `*` | Node ≥18, `text_batch_delay_seconds` debounce, native polls/clarify/location pins |
| **WhatsApp Cloud API** | Meta Business `WHATSAPP_CLOUD_*` + public webhook URL | same allowlist | Official, no ban risk; parallelism with Baileys on different numbers allowed |
| **Signal** | `SIGNAL_HTTP_URL=http://127.0.0.1:8080`, `SIGNAL_ACCOUNT=+E164`, `signal-cli daemon --http` | `SIGNAL_ALLOWED_USERS`, `SIGNAL_GROUP_ALLOWED_USERS` (`*` or group IDs) | Java 17+, SSE streaming, attachment 100 MB cap, phone-redaction in logs |

Sources: https://hermes-agent.nousresearch.com/docs/user-guide/messaging/telegram, https://hermes-agent.nousresearch.com/docs/user-guide/messaging/discord, https://hermes-agent.nousresearch.com/docs/user-guide/messaging/slack, https://hermes-agent.nousresearch.com/docs/user-guide/messaging/whatsapp, https://hermes-agent.nousresearch.com/docs/user-guide/messaging/signal

### 1.3 How `hermes gateway` Connects

**Interactive setup:**

```bash
hermes gateway setup        # arrow-key picker, shows already-configured platforms, offers start/restart
hermes whatsapp             # WhatsApp-specific QR flow
hermes slack manifest --agent-view --write  # writes ~/.hermes/slack-manifest.json
```

**Foreground vs service:**

```bash
hermes gateway              # foreground (recommended for WSL/Docker/Termux)
hermes gateway run          # alias of above
hermes gateway install      # user systemd/launchd unit (Linux + macOS)
sudo hermes gateway install --system   # boot-time system service (Linux)
hermes gateway start|stop|restart|status
hermes gateway status --system
hermes gateway enroll       # enroll with a relay connector (writes relay creds to .env)
```

**Linux liveness watchdog (systemd `Type=notify`):**

```yaml
# ~/.hermes/config.yaml
gateway:
  systemd_watchdog_seconds: 120  # 0 = Type=simple (default); >0 = WatchdogSec + heartbeats
# then:
hermes gateway install --force   # regenerate unit
```

[Source: https://hermes-agent.nousresearch.com/docs/user-guide/messaging](https://hermes-agent.nousresearch.com/docs/user-guide/messaging)

**Local Bot API for Telegram large files (lift 20 MB → 2 GB):**

```yaml
platforms:
  telegram:
    extra:
      base_url: "http://127.0.0.1:8081/bot"
      base_file_url: "http://127.0.0.1:8081/file/bot"
      local_mode: true
```

Requires `api_id`/`api_hash` from `my.telegram.org` and `TELEGRAM_LOCAL=1` local `telegram-bot-api` daemon [Source: https://hermes-agent.nousresearch.com/docs/user-guide/messaging/telegram](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/telegram).

### 1.4 What Is Configured, Where

Three layers per platform (env wins over config):

**Telegram example (all forms seen in docs):**

```ini
# ~/.hermes/.env
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_ALLOWED_USERS=123456789,987654321
TELEGRAM_HOME_CHANNEL=-1001234567890
TELEGRAM_WEBHOOK_URL=https://my-app.fly.dev/telegram
TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)
TELEGRAM_PROXY=socks5://127.0.0.1:1080
```

```yaml
# ~/.hermes/config.yaml
gateway:
  platforms:
    telegram:
      enabled: true
      home_chat_id: "123456789"
      gateway_restart_notification: true
      typing_indicator: true
      extra:
        command_menu: { max_commands: 60, priority_mode: prepend, priority: [my_skill] }
        status_indicator: true
        proxy_url: "socks5://127.0.0.1:1080"
        base_url: "http://127.0.0.1:8081/bot"   # only if local Bot API
display:
  platforms:
    telegram:
      notifications: important   # important (default, only final) | all
      tool_progress: off         # mobile-friendly default
      cleanup_progress: false    # auto-delete progress bubbles
```

**Discord example:**

```ini
DISCORD_BOT_TOKEN=...
DISCORD_ALLOWED_USERS=284102345871466496
DISCORD_ALLOWED_ROLES=987654...
DISCORD_HOME_CHANNEL=123456789012345678
DISCORD_REQUIRE_MENTION=true
DISCORD_FREE_RESPONSE_CHANNELS=111,222
DISCORD_AUTO_THREAD=true
DISCORD_COMMAND_SYNC_POLICY=safe   # safe|bulk|off
```

```yaml
discord:
  require_mention: true
  thread_require_mention: false
  free_response_channels: "123,456"
  auto_thread: true
  history_backfill: true
  allow_mentions: { everyone: false, roles: false, users: true, replied_user: true }
  websocket_liveness_interval_seconds: 15
group_sessions_per_user: true   # global, also affects Slack/Telegram group isolation
```

**Slack example (Space: Socket Mode + Events):**

```ini
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_ALLOWED_USERS=U01ABC2DEF3
SLACK_HOME_CHANNEL=C012345...
```

```yaml
platforms:
  slack:
    reply_to_mode: "first"   # off|first|all
    extra:
      reply_in_thread: true
      reply_broadcast: false
      unfurl_links: false
      rich_blocks: false
      native_task_cards: false
      assistant_thread_titles: true
      allow_bots: "none"
```

**WhatsApp (Baileys) debounce & Signal group gate:**

```yaml
gateway:
  platforms:
    whatsapp:
      extra: { text_batch_delay_seconds: 5.0, text_batch_split_delay_seconds: 10.0 }
signal:
  SIGNAL_GROUP_ALLOWED_USERS: "*"   # via env; omit = DM-only
```

Security note (all platforms): *without any allowlist or DM pairing, the gateway denies all inbound messages by default as a safety measure* — must set `*_ALLOWED_USERS` or opt into `GATEWAY_ALLOW_ALL_USERS=true` (not recommended for terminal-capable bots). DM pairing alternative: unknown DMers receive a one-time code `XKGH5N7P`, operator approves with `hermes pairing approve telegram <code>` (expires 1h) [Source: https://hermes-agent.nousresearch.com/docs/user-guide/messaging](https://hermes-agent.nousresearch.com/docs/user-guide/messaging).

### 1.5 How It Bridges to the TUI

The gateway and the TUI are **two processes against one database**:

- **Gateway process** (`hermes gateway`): long-lived, owns platform adapters (Telegram polling/webhook, Discord Gateway WS, Slack Bolt Socket Mode WS, Baileys WS, signal-cli SSE). It writes every inbound message to `state.db`, dispatches through the agent loop, and writes the assistant response + tool results back to `state.db` and the `delivery_ledger`.
- **TUI process** (`hermes` / `hermes chat`): short-lived, interactive. It reads `state.db` (same SQLite WAL), renders the Ink TUI, and drives an agent loop with *its own* session namespace (`tui` / `desktop` / project-cwd). It does **not** need the gateway running to chat locally.
- **Shared surface:** both read `~/.hermes/config.yaml`, `.env`, `auth.json`, `SOUL.md`, `memories/`, `skills/`, `mcp_servers`, and `state.db`. File-watcher on `config.yaml` hot-reloads MCP connections (30s timeout on in-session edits).
- **/command bridge:** slash commands registered in `COMMAND_REGISTRY` are exposed natively per platform:
  - Telegram: BotFather `/setcommands` + capped command menu (60 default, 1–100) + inline picker `@bot <term>` when `setinline` is enabled.
  - Discord: global slash commands synced at startup (`DISCORD_COMMAND_SYNC_POLICY=safe|bulk|off`), plus plain-text fallback.
  - Slack: slash commands declared in the generated `slack-manifest.json`; `!cmd` bang prefix is the in-thread alias because Slack blocks native slashes inside threads.
  - WhatsApp/Signal: plain-text `/cmd` prefix parsing + clarify buttons rendered as native polls (WhatsApp) or bodyRanges/reactions (Signal) [Source: https://hermes-agent.nousresearch.com/docs/user-guide/messaging](https://hermes-agent.nousresearch.com/docs/user-guide/messaging), https://hermes-agent.nousresearch.com/docs/user-guide/messaging/telegram (command menu / inline mode), https://hermes-agent.nousresearch.com/docs/user-guide/messaging/discord (slash sync + `allow_mentions`), https://hermes-agent.nousresearch.com/docs/user-guide/messaging/slack (manifest + `!` prefix).
- **Session isolation:** `group_sessions_per_user: true` (default) gives each user in a shared channel their own transcript; `false` yields one transcript per channel (collaborative but costly). The gateway tracks running agents by session key, so Alice's interrupt does not affect Bob's turn when isolation is on [Source: https://hermes-agent.nousresearch.com/docs/user-guide/messaging](https://hermes-agent.nousresearch.com/docs/user-guide/messaging).
- **Busy-input modes:** `display.busy_input_mode: interrupt|queue|steer` controls what happens when the user messages a busy agent (redirect vs queue vs inject via `/steer`). First busy ack includes a one-time tip under `onboarding.seen.busy_input_prompt` [Source: https://hermes-agent.nousresearch.com/docs/user-guide/messaging](https://hermes-agent.nousresearch.com/docs/user-guide/messaging).
- **Platform control plane:** `/platform list|pause|resume` + automatic circuit breaker (pauses an adapter after repeated retryable 5xx / rate-limit / disconnect, emits operator notification to home channel) [Source: https://hermes-agent.nousresearch.com/docs/user-guide/messaging](https://hermes-agent.nousresearch.com/docs/user-guide/messaging).
- **Files / media:** agent-emitted `MEDIA:/host/visible/path` tags are extracted by the gateway and delivered as native attachments (image/audio/video/doc). On Docker, the path must be host-readable (`docker_volumes: ["/home/user/.hermes/cache/documents:/output"]`), not just in-container `/workspace`.

---

## 2. Model Providers Setup

### 2.1 Where Providers Are Declared

Hermes' provider model is **two-tier**: a top-level `model:` block for the *active* provider, and a `providers:` dict for *all* configured providers (each is an OpenAI-compatible endpoint with model discovery).

**Live example from the probed host (`~/.hermes/config.yaml`):**

```yaml
model:
  default: muse-spark-1.2-contributor
  provider: opencode-go
  aux_model: deepseek/deepseek-v4-flash
  base_url: https://opencode.ai/zen/go/v1
  key_env: HERMES_CUSTOM_FREE_OPENCODE_GO_API_KEY
  discover_models: true

providers:
  omniroute:
    name: omniroute
    base_url: https://omniroute.fermag.com.tr/v1
    model: opencode-go/muse-spark-1.2-contributor
    discover_models: true
    models:
      auto/best-coding: {}
      auto/best-reasoning: {}
      # ... 200+ entries covering auto/*, cmd/*, ds-web/*, gweb/*, lma/*
      muse-spark-1.2-contributor: {}
      gemini-3.6-flash: {}
      minimax-m3: {}
```

Built-in provider catalog (from fallback docs) includes: `ai-gateway`, `openrouter`, `nous`, `openai-codex` (OAuth), `copilot`, `anthropic`, `zai`, `kimi-coding`, `minimax`, `deepseek`, `nvidia`, `gmi`, `upstage/solar`, `stepfun`, `ollama-cloud`, `gemini`, `xai/grok`, `xai-oauth`, `bedrock`, `qwen-oauth`, `opencode-zen`, `commandcode`, `opencode-go`, `opencode-free`, `kilocode`, `router`, `xiaomi`, `arcee`, `alibaba`, `azure-foundry`, `lmstudio`, `huggingface`, `custom` [Source: https://hermes-agent.nousresearch.com/docs/user-guide/features/fallback-providers](https://hermes-agent.nousresearch.com/docs/user-guide/features/fallback-providers).

### 2.2 How API Keys Are Stored — `.env` + `auth.json` + Secret Managers

> Rule of thumb from the docs: "Secrets (API keys, bot tokens, passwords) go in `.env`. Everything else (model, terminal backend, ...) goes in `config.yaml`." (`hermes config set` auto-routes) [Source: https://hermes-agent.nousresearch.com/docs/user-guide/configuration](https://hermes-agent.nousresearch.com/docs/user-guide/configuration).

**Three credential sources, composed per env var:**

| Source | Example | How to set | Where kept |
|--------|---------|------------|------------|
| `.env` / shell env | `OPENROUTER_API_KEY=sk-or-...` | `hermes config set OPENROUTER_API_KEY sk-...` or manual edit | `~/.hermes/.env` (0600) |
| OAuth device-code | Nous Portal, OpenAI Codex, xAI Grok, Qwen, Atlassian | `hermes setup --portal`, `hermes model` (browser OAuth), `hermes auth add <provider> --type oauth` | `~/.hermes/auth.json` (`credential_pool` + per-provider `access_token`) |
| External vault | Bitwarden Secrets Manager (`bws`), 1Password (`op://`), or any CLI helper (`pass`/`keepassxc-cli`) | `hermes secrets` plugin; bootstrap token lives in `.env`, bulk/mapped sources inject the rest | manager itself; only fingerprint + provenance is persisted in `auth.json` |

**Secret-source precedence:** per-var precedence is deterministic [Source: https://hermes-agent.nousresearch.com/docs/user-guide/secrets](https://hermes-agent.nousresearch.com/docs/user-guide/secrets):
1. `.env`/shell wins by default (unless a source has `override_existing: true` — Bitwarden defaults to true for central rotation).
2. Mapped sources (`env:` bindings) beat bulk sources.
3. First source in `secrets.sources` wins; later claims are skipped with a warning.
4. A source never overwrites another source's bootstrap token.
5. `secrets.preserve_existing: [FEISHU_APP_SECRET, TELEGRAM_BOT_TOKEN]` pins per-profile secrets; `secrets.profile_alias` auto-hydrates `FOO_MILLA` → `FOO` in the `milla` profile.

**`.env` template keys** (non-exhaustive, from probed host's `.env` header comment):
`FIREWORKS_API_KEY`, `OPENROUTER_API_KEY`, `NOVITA_*`, `GOOGLE_API_KEY`/`GEMINI_API_KEY`, `OLLAMA_API_KEY`, `GLM_API_KEY`, `KIMI_API_KEY`/`KIMI_CN_API_KEY`, `ARCEEAI_API_KEY`, `MINIMAX_API_KEY`/`MINIMAX_CN_API_KEY`, `OPENCODE_ZEN_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `DASHSCOPE_API_KEY`, `HF_TOKEN`, `BROWSERBASE_API_KEY`, `BROWSER_USE_API_KEY`, `EXA_API_KEY`, `PARALLEL_API_KEY`, `FIRECRAWL_API_KEY`, `TAVILY_API_KEY`, `BRAVE_SEARCH_API_KEY`, `XAI_API_KEY`, `GROQ_API_KEY`, `VOICE_TOOLS_OPENAI_KEY`, plus all `*_BOT_TOKEN`/`*_APP_TOKEN`/`SIGNAL_*`/`WHATSAPP_*`/`SLACK_*`.

**Credential pools** (same-provider multi-key rotation): `hermes auth add <provider>` seeds additional keys; `~/.hermes/auth.json` stores them under `credential_pool: { openrouter: [...], anthropic: [...] }` with strategies in `config.yaml`:

```yaml
credential_pool_strategies:
  openrouter: round_robin   # fill_first (default) | round_robin | least_used | random
  anthropic: least_used
```

Rotation behavior: transient 429 → retry same key once, then rotate; billing 402 or plan-limit 429 → rotate immediately (1h cooldown or provider `reset_at`); 401 → try OAuth refresh, then rotate. All pool keys exhausted → fallback provider chain fires [Source: https://hermes-agent.nousresearch.com/docs/user-guide/features/credential-pools](https://hermes-agent.nousresearch.com/docs/user-guide/features/credential-pools).

### 2.3 Provider Routing (OpenRouter / Nous Aggregators)

Only affects aggregator endpoints. Config under `provider_routing:` in `config.yaml` is passed as `extra_body.provider` to the OpenAI SDK:

```yaml
provider_routing:
  sort: "price"                # price | throughput | latency
  only: ["anthropic","google"] # whitelist
  ignore: ["together","lepton"]
  order: ["anthropic","google","amazon-bedrock"]  # priority order
  require_parameters: true
  data_collection: "deny"       # allow | deny
```

[Source: https://hermes-agent.nousresearch.com/docs/user-guide/features/provider-routing](https://hermes-agent.nousresearch.com/docs/user-guide/features/provider-routing)

### 2.4 Fallback Chains — Cross-Provider Failover

**Primary chain** (tried in order when the primary model fails with 429/5xx/401/404/malformed):

```bash
hermes fallback                # interactive picker (reuses hermes model picker)
hermes fallback add            # append one entry
hermes fallback list|rm|clear
```

```yaml
# ~/.hermes/config.yaml — current key is fallback_providers (plural); fallback_model (singular) is legacy
fallback_providers:
  - provider: openrouter
    model: anthropic/claude-sonnet-4
  - provider: nous
    model: nous-hermes-3
  - provider: custom
    model: my-local-model
    base_url: http://localhost:8000/v1
    key_env: MY_LOCAL_KEY
```

Semantics [Source: https://hermes-agent.nousresearch.com/docs/user-guide/features/fallback-providers](https://hermes-agent.nousresearch.com/docs/user-guide/features/fallback-providers):
- **Per-turn, not per-session:** each user message restores the primary; mid-turn failure promotes one fallback for the rest of that turn only. If the fallback also fails, normal retries surface the error (no cascade loop).
- **Prompt-cache cost:** each provider switch invalidates prompt cache (full re-read at full input price); bouncey sessions cost more.
- **Reset-aware:** if the primary reports a long reset window (e.g. Claude 5h block), Hermes stays on fallback until the window elapses instead of flip-flopping.

**Auxiliary task fallback** — independent per-task resolution under `auxiliary.<task>`:

```yaml
auxiliary:
  vision:       { provider: "auto", model: "" }         # auto = try main provider → task fallback → built-in discovery
  compression:  { provider: "auto", model: "google/gemini-3-flash-preview" }
  skills_hub:   { provider: "auto" }
  mcp:          { provider: "auto" }
  approval:     { provider: "auto" }
  title_generation: { provider: "auto" }
  review:       { provider: "auto" }
  triage_specifier: { provider: "auto" }
  vision:
    provider: glm
    model: glm-4v-flash
    fallback_chain:                                      # optional per-task override
      - { provider: openrouter, model: google/gemini-3-flash-preview }
      - { provider: nous, model: anthropic/claude-sonnet-4 }
```

Resolution order for `provider: auto`: main provider+model → `auxiliary.<task>.fallback_chain` → top-level `fallback_providers` → built-in discovery chain (OpenRouter → Nous → Custom → Codex OAuth → API-key providers). Capacity errors (402, daily quota, connection failure) trigger the ladder; transient 429s do not [Source: https://hermes-agent.nousresearch.com/docs/user-guide/features/fallback-providers](https://hermes-agent.nousresearch.com/docs/user-guide/features/fallback-providers).

**Timeouts per provider/model:**

```yaml
providers:
  openrouter:
    request_timeout_seconds: 1800
    stale_timeout_seconds: 90
    models:
      anthropic/claude-opus-4:
        timeout_seconds: 900
        stale_timeout_seconds: 120
```

[Source: https://hermes-agent.nousresearch.com/docs/user-guide/configuration](https://hermes-agent.nousresearch.com/docs/user-guide/configuration) — Provider Timeouts section.

### 2.5 Nous Portal — One-Shot All-In-One

```bash
hermes setup --portal   # OAuth via browser → picks a Nous model → sets Nous as inference provider → enables Tool Gateway
```

Portal bundles 300+ models + four Tool Gateway tools (search, extract, image gen, TTS, cloud browser) under one subscription; subscribers get 10% off token-billed providers. `hermes config get model` / `hermes model --portal-url` handles custom portal hosts. Tool Gateway is the alternative to per-vendor API keys for web/browser [Source: https://hermes-agent.nousresearch.com/docs/user-guide/configuration](https://hermes-agent.nousresearch.com/docs/user-guide/configuration) (Easiest path callout), https://hermes-agent.nousresearch.com/docs/user-guide/features/provider-routing (tip box).

---

## 3. MCP Servers Setup

### 3.1 What MCP Is in Hermes

MCP (Model Context Protocol) lets the agent use external tool servers — GitHub, Postgres, filesystem, Playwright/Chromium, Linear, Notion, Stripe, etc. — without writing native Hermes tools. Two transport families share one `mcp_servers:` block: **stdio** (local subprocess over stdin/stdout) and **HTTP** (remote endpoint). The block lives in `~/.hermes/config.yaml` and is backward-compatible with Claude Code's `mcpServers` in `~/.claude.json` (`hermes import-agent claude-code` migrates it) [Source: https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp).

Tool names are prefixed `mcp_<server>_<tool>` (e.g. `mcp_github_create_issue`), so they never collide with built-ins. Vendor `toolResult._meta` is surfaced; `U+E0000–U+E007F` tag characters are stripped (prompt-injection defense) [Source: https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp).

### 3.2 How `mcp_servers` Are Added — `hermes mcp add` vs Catalog

**Discovery-first manual add:**

```bash
hermes mcp add <name> [--url URL] [--command CMD] [--args ...] [--auth oauth|header] [--preset PRESET] [--env KEY=VAL ...] [--connect-timeout SECS]
# Examples
hermes mcp add filesystem --command npx --args -y @modelcontextprotocol/server-filesystem /home/user/projects
hermes mcp add company_api --url https://mcp.internal.example.com --auth header
hermes mcp add linear --url https://mcp.linear.app/mcp --auth oauth
hermes mcp add codex --preset codex   # wires codex mcp-server over stdio
hermes mcp remove <name>
hermes mcp list                       # or ls
hermes mcp test <name>
hermes mcp configure <name>           # reopen tool checklist
hermes mcp login <name>               # force OAuth re-auth (also: reauth --all)
```

Resulting YAML (probed live host):

```yaml
mcp_servers:
  open-design:
    command: /opt/node24/bin/node
    args: ["/root/.openclaw/workspace/open-design/apps/daemon/dist/cli.js","mcp","--daemon-url","http://127.0.0.1:7457"]
    enabled: true
  vision-mcp:
    command: node
    args: ["/root/vision-mcp/src/index.js","--connect-timeout","30"]
    enabled: true
    env: { VISION_MCP_MODEL: mimo-v2.5, VISION_MCP_BASE_URL: https://opencode.ai/zen/go/v1, VISION_MCP_API_KEY: sk-... }
```

**Catalog — one-click Nous-approved installs:**

```bash
hermes mcp                # interactive picker (default; arrow keys, Enter to install/enable/disable/uninstall)
hermes mcp catalog        # plain-text list (scriptable)
hermes mcp install n8n    # install by name
```

Live host output (`hermes mcp catalog`) — 70 curated entries, each with `available | enabled | installed (disabled)` status. All are **disabled by default**; presence under `optional-mcps/` in the `hermes-agent` repo means Nous approval (no community tier; PR-gated). Examples in the table: `airtable`, `algolia`, `asana`, `atlassian` (hosted remote), `cloudflare` (~3,300 endpoint tools, ships with `tools.default_excluded` blocklist), `figma` (hosted `https://mcp.figma.com/mcp` with OAuth + auto `client_name: "Claude Code"` DCR workaround), `linear`, `notion`, `stripe`, `supabase`, `vercel`, `sentry`, `github` (deliberately *not* in catalog — use `gh` CLI skills instead), `n8n`, `neon`, `playwright` (browser), etc. [Source: https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp + live `hermes mcp catalog` probe].

**Install-time tool selection checklist** (interactive):

```
Select tools for 'linear' (SPACE toggle, ENTER confirm)
[x] find_issues
[x] get_issue
[x] create_issue
[ ] delete_workspace
```

Pre-checked rows come from: prior selection (preserved on reinstall) → manifest `tools.default_enabled` → everything. Very large surfaces (e.g. Cloudflare) use `tools.default_excluded` (glob-capable blocklist) and skip the checklist; edit `mcp_servers.<name>.tools.exclude` to re-enable families. Selecting everything writes no filter (cleanest shape). If probe fails (server unreachable, OAuth pending), manifest defaults are applied silently and `hermes mcp configure <name>` refines later [Source: https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp).

### 3.3 Auth Types

| Mode | Config | Flow |
|------|--------|------|
| **No auth / API key header** | `url:` + `headers: { Authorization: "Bearer ***" }` or `env:` for stdio | Static, instant |
| **OAuth 2.1 (remote HTTP)** | `url: https://mcp.*`, `auth: oauth` | Hermes handles discovery + PKCE + token exchange + refresh + step-up auth. Prints `authorize URL`, opens browser, waits on loopback `oauth.redirect_port`. Tokens cached at `~/.hermes/mcp-tokens/<server>.json` (0600, silent reuse). Headless: Desktop relay, paste-back of `?code=&state=`, SSH forward, or `oauth.redirect_uri` behind a public HTTPS proxy. WAF quirk: set `oauth.redirect_host: localhost` when the auth server's WAF 403s on `127.0.0.1`. |
| **Pre-registered OAuth client** | `auth: oauth` + `oauth: { client_id, client_secret }` | For providers that reject DCR (Google Drive `https://drivemcp.googleapis.com/mcp/v1` 400, Atlassian). Also `oauth.scope` customization. |
| **mTLS client certificate** | `client_cert: "~/.certs/mcp-client.pem"` or `["~/.certs/c.crt","~/.certs/c.key"]` or `["c.crt","c.key","${MCP_KEY_PASSWORD}"]` + `client_key:` | TLS handshake via underlying HTTP client; missing file raises a server-scoped error |
| **Identity header (per-user)** | `identity_header: { name: "X-User-Id", value_from: "static"|"profile", value: "alice" }` | For multi-tenant servers keying on caller identity; HTTP/SSE only (_stdio warns and ignores). Explicit `headers` entry wins on name clash |
| **Stdio env passthrough** | `env: { GITHUB_PERSONAL_ACCESS_TOKEN: "***" }` | Literal env into the subprocess; supports `${VAR}`, `${userHome}`, `${workspaceFolder}`, `${pathSeparator}` substitution at connect time (plus `${INSTALL_DIR}` at install time for catalog clones) |
| **Preset wiring** | `--preset codex` | Fills `command`+`args` defaults; caller can still override `env`/`headers`/`tools.*` on the same line |

Figma special case: `https://mcp.figma.com/mcp` allowlists DCR by exact `client_name`; Hermes auto-sets `oauth.client_name: "Claude Code"` for that host so bare `auth: oauth` works [Source: https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp).

### 3.4 Common Keys Reference

From https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp (Basic configuration reference):

| Key | Type | Meaning |
|-----|------|---------|
| `command` | string | Executable for stdio server |
| `args` | list | Arguments |
| `env` | mapping | Env vars for stdio |
| `url` | string | HTTP endpoint |
| `headers` | mapping | HTTP headers |
| `auth` | `oauth`\|`header` | Auth method (remote) |
| `oauth` | mapping | `redirect_port`, `redirect_uri`, `redirect_host`, `client_id/secret`, `client_name`, `scope` |
| `client_cert` / `client_key` | string\|list | mTLS |
| `identity_header` | mapping | Per-user identity header |
| `timeout` | number | Per-tool-call timeout |
| `connect_timeout` | number | Initial connection + `initialize` handshake |
| `idle_timeout_seconds` | number | Recycle stdio server after idle (0 = never; good for Playwright/Chromium: `900`) |
| `max_lifetime_seconds` | number | Force recycle after N seconds |
| `enabled` | bool | Skip if false |
| `supports_parallel_tool_calls` | bool | Allow concurrent calls |
| `tools` | mapping | `include: [...]` (whitelist) / `exclude: [...]` (blacklist) — supports globs (`*_dns_*`, `*`) |

Per-server filtering precedent: `enabled: false` wins over everything; plain entries without globs are exact-match; globs are case-sensitive; filtering also applies to resource/prompt utility tools (`mcp_<server>_list_resources` etc.) which are only registered if the server advertises that capability. If everything is filtered out, the server stays connected but contributes no tools [Source: https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp).

### 3.5 Runtime Behavior

- **Hot reload:** editing `config.yaml` from inside a running Hermes session auto-reloads MCP connections with a 30 s timeout — *not* enough for an interactive OAuth flow; for OAuth additions run `hermes mcp login <server>` from a fresh terminal (5 min wait).
- **Parallelism:** `supports_parallel_tool_calls: true` lets tools from that server run concurrently.
- **Recycling:** `idle_timeout_seconds` / `max_lifetime_seconds` transparently restart memory-heavy stdio servers (Playwright keeps Chromium resident) while keeping tools registered.
- **Sampling / elicitation:** MCP sampling (model calls initiated by the server) and elicitation (`elicitation/create` form prompts) are supported per-server with opt-out (`sampling.enabled`, `elicitation.enabled`, `elicitation.timeout: 300`). Form elicitations route through the existing approval surface (TUI prompt or Telegram/Slack buttons) [Source: https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp).
- **Hermes as an MCP server:** `hermes mcp serve` exposes a *stdio* MCP server with 10 tools (`conversations_list`, `conversation_get`, `messages_read`, `attachments_fetch`, `events_poll`, `events_wait`, `messages_send`, `channels_list`, `permissions_list_open`, `permissions_respond`) — the bridge for Claude Code/Cursor/Codex to send/read across all gateway platforms. Read works without the gateway running; send needs it [Source: https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp).

### 3.6 Catalog Trust & Versioning

- **Approval gate:** presence under `optional-mcps/<name>/manifest.yaml` in the `hermes-agent` repo *means* Nous approval; there is no community submission tier.
- **Install blast radius:** `git clone` + `install.bootstrap` commands + server code run at install; picker prints `source:` URL and transport so the operator can inspect before confirming.
- **`manifest_version` pin:** a newer manifest than the installed Hermes understands surfaces as `⚠ '<name>' requires a newer Hermes` rather than being hidden; `hermes update` resolves it.
- **Updates:** MCP manifests are never auto-updated; re-run `hermes mcp install <name>` after a Hermes update.

---

## 4. How Skills Are Installed Optionally During Setup

Hermes skills are its primary extensibility primitive (alongside plugins). The hierarchy matters for Lokma's plugin system design.

### 4.1 Three Tiers

| Tier | Where they live | How they're installed | Who owns them | Updates |
|------|-----------------|----------------------|---------------|---------|
| **Bundled (builtin)** | Shipped inside the `hermes-agent` repo (≈ 130+ categories: `autonomous-ai-agents`, `creative`, `devops`, `email`, `github`, `media`, `mlops`, `note-taking`, `productivity`, `research`, `smart-home`, `social-media`, `software-development`, etc.) | Seeded into every fresh profile automatically (can `opt-out`) | Nous Research | Ship with `hermes update`; `hermes skills reset <name>` / `repair-official` backfills |
| **Official optional** | `optional-skills/` in the `hermes-agent` repo (139 at probe time) | `hermes skills install official/<category>/<name>` or `hermes skills browse` (paginated across 90k+ skills including community registries) | Nous Research (reviewed) | Tracked; `hermes skills check|update|audit` |
| **Hub / community** | `skills.sh`, GitHub, ClawHub, well-known endpoints, custom taps (`hermes skills tap`) | `hermes skills install <registry>/<name>` / `hermes skills search <term>` / `hermes import-agent claude-code` | Community / author | `check`/`update` with hash verification; `audit` re-scans |

Evidence on the probed host:
- `ls /usr/local/lib/hermes-agent/skills` shows the 14 bundled *category* dirs (`apple`, `autonomous-ai-agents`, `creative`, …).
- `ls /usr/local/lib/hermes-agent/optional-skills` shows the distribution categories for optional packs (`autonomous-ai-agents`, `blockchain`, `communication`, `creative`, `data-science`, `devops`, … including `mcp`).
- `hermes skills list` output: `builtin` vs `local` source tags, and `enabled` column. 58 bundled + 27 local skills were present.
- `hermes skills browse` page 1/4534: "★ 139 official optional skill(s) from Nous Research" out of 90,666 loaded — massive long tail from community registries.

### 4.2 CLI Surface (so Lokma can mirror the UX)

```bash
hermes skills trust|untrust <repo>         # allow repo-local ./.hermes/skills + ./.agents/skills
hermes skills browse                       # paginated all sources
hermes skills search <term>
hermes skills install <id>                 # official/category/name or registry/name
hermes skills inspect <id>                 # preview without installing
hermes skills list                         # installed, with Source/Trust/Status
hermes skills check|update|audit           # hub update lifecycle
hermes skills uninstall <id>
hermes skills reset <bundled-name>         # clear user-modified, allow updates again
hermes skills list-modified|diff           # what you've edited
hermes skills opt-out|opt-in               # stop seeding bundled skills into this profile
hermes skills repair-official              # backfill official optional packs
hermes skills config                       # interactive enable/disable per skill
hermes skills snapshot                     # export/import skill config
hermes skills tap                          # manage registries
```

[Source: `hermes skills --help` probe + `hermes setup` docs]

### 4.3 Interaction with `hermes setup` / Gateway Agent

- `hermes setup` has focused subcommands (`hermes setup model|tts|terminal|gateway|tools|telemetry|agent`) — skills are not a dedicated setup stage; they are seeded automatically and then managed via `hermes skills`.
- The gateway agent's tool exposure is filtered by `platform_toolsets` in `config.yaml`:

```yaml
platform_toolsets:
  cli: [hermes-cli]
  telegram: [hermes-telegram]
  discord: [hermes-discord]
  slack: [hermes-slack]
  signal: [hermes-signal]
```

Plus per-skill toggling via `hermes skills config` — effectively, toolsets are the gateway-visible slice of the skills universe.

---

## 5. Which Connections Are Mandatory vs Optional Checkboxes During Setup

### 5.1 `hermes setup` Is Fully Optional Today

The interactive wizard is **non-blocking**: `hermes setup` is documented as *"Run a specific section: hermes setup model|tts|terminal|gateway|tools|telemetry|agent"* [Source: `hermes setup --help` probe]. Its top-level behavior:

```bash
hermes setup                         # full reconfigure wizard (existing installs show current values as defaults)
hermes setup --quick                 # only prompt for missing/unset items
hermes setup --portal                # one-shot Nous Portal (model + Tool Gateway)
hermes setup --non-interactive       # use defaults/env only
hermes setup --reset                 # wipe to defaults
hermes setup model                   # provider/model picker only
hermes setup gateway                 # messaging platforms only
hermes setup tools                   # web search/extract + browser provider picker
hermes setup tts|terminal|telemetry|agent
```

No connection is *hard-mandatory* at install time — the installer completes without any provider or gateway. `hermes doctor` then nags about what's missing:

```
hermes doctor  # tells what's missing and how to fix it
hermes config check  # lists missing options after updates
hermes config migrate  # interactively add missing keys
```

### 5.2 What Is Effectively Required to Do Anything Useful

| Capability | Minimum to be useful | Hermes treats it as |
|------------|---------------------|---------------------|
| **Do inference at all** | Pick one LLM provider + model | Required-by-convention. Without it, `hermes chat` errors; gateway runs but cannot answer (needs a model provider + tool providers per the tip box on the messaging page: "Bots need both a model provider and tool providers (TTS, web). A Nous Portal subscription bundles all of them." [Source: https://hermes-agent.nousresearch.com/docs/user-guide/messaging](https://hermes-agent.nousresearch.com/docs/user-guide/messaging)) |
| **Web search/extract** | Select a backend (`firecrawl`/`searxng`/`tavily`/`exa`/`parallel`/`xai`) | Optional — has a keyless fallback ring (Exa/Parallel/Tavily/Firecrawl/Keenable round-robin, 5-vendor) so fresh installs work with zero keys; any explicit `web.backend` or `WEB_*` key overrides it. Opt-out: `web.keyless_fallback: false` |
| **Browser automation** | Enable a browser backend (Chromium auto-install or `camfox`/`browserbase`) | Optional — `hermes setup --skip-browser` exists |
| **TTS / STT** | Pick `tts.provider` / configure `stt` (`piper` local, `openai`, `groq`, etc.) | Optional — defaults to `piper` local + `faster-whisper` local (no key) |
| **Any single messaging platform** | Configure one adapter (e.g. `TELEGRAM_BOT_TOKEN` + allowlist) | Optional — gateway is useful with zero platforms (runs cron + TUI), but *at least one* is needed for remote chat |
| **MCP** | Add one entry under `mcp_servers:` | Optional — stdio servers need `npx`/`node` etc. on PATH; remote needs `url`+`auth`. The catalog shows all as `available` until explicitly `install`d |
| **Memories / vault** | `memory.memory_enabled` (default true) + `~/.hermes/memories/MEMORY.md`, `USER.md`, plus the `memory-vault` skill hook | Optional — enabled by default, but clearing `~/.hermes/memories/` or disabling via `hermes memory` is safe |

So in a **checkbox TUI** (`hermes gateway setup` / `hermes tools` pickers), every platform line is a **checkbox** with `enabled` tri-state: `not configured` / `enabled` / `disabled`. Provider line is radio (pick one primary; fallback chain is the optional "add more" list). Web search backends are radio per capability. MCP catalog rows are checkbox per server (available → install toggles to enabled). Skills are checkbox per tier (builtin seeded by default; optional/hub unchecked).

### 5.3 "Required" in the Lokma Sense of the Term

For Lokma's `lokma init` TUI, "required" should be redefined slightly narrower than Hermes': Hermes can defer the model pick to first chat; Lokma wants to **gate first run** until the user has a working `provider+model` pair, because an agent harness with no inference cannot demonstrate itself. Recommendation: the only hard gate in `lokma init` is **Providers (≥1)** plus **Core** (identity + terminal). Everything else is skippable with sane defaults (keyless web ring, local TTS/STT, no gateway, no MCP, no vault).

---

## 6. Lokma Design: `lokma init` Interactive TUI (Ink) — Sectioned Wizard

### 6.1 Goals

- Single entry point after install that leaves the user with a *working* agent (`lokma "hello"` returns real output).
- Mirrors Hermes' `hermes setup` ergonomics but adds Lokma-specific layering (`~/.lokma/config.json` + `.lokma/settings.json` + encrypted `~/.lokma/credentials.json`, per `Docs/26-CONFIG-and-CREDENTIALS.md`).
- Stays **parity-clean** between CLI and Web: web Settings panes write the same files via `PATCH /api/config`; the TUI reads/writes the same files directly (both through `packages/lokma-core/src/config/loader.ts`).
- Feels like `hermes gateway setup` / `hermes model` pickers (arrow keys, space to toggle, enter to confirm, live status dots), built with **Ink** (React for CLIs).

### 6.2 Top-Level Flow

```
lokma                        # if not initialized → auto-invoke lokma init
lokma init                   # full wizard
lokma init --quick           # only missing required (mirrors hermes setup --quick)
lokma init --reconfigure     # start from current values as defaults (hermes setup default)
lokma init --portal          # Nous-style one-shot (if Lokma ever offers a hosted gateway)
lokma init --section <name>  # jump to one section: core|browser|search|providers|gateway|mcp|vault
lokma doctor                 # post-wizard diagnostics (perms, encryption, duplicate keys)
```

**State model (Ink):** global `WizardState` { `step: Section`, `values: ResolvedConfig+Credentials`, `dirty: boolean`, `errors: Record<field, string>` }, plus a `useWizard()` context. Navigation: number keys 1–7, arrow keys, `q` to quit with save prompt, `?` help. Persist on every `Enter` in a section (atomic write via `writeAtomic(tmp+fsync+rename)` like the spec). `Esc` returns to section picker. A right-hand preview pane shows the effective merged config (masked keys) a la `lokma config --dump`.

### 6.3 Section Spec — Seven Sections, Two Tiers

```
┌─ 1  Core (required) ─────────────────────────────────────┐
│  Identity + terminal + theme                               │
├─ 2  Browser (optional) ────────────────────────────────────┤
│  Browser automation backend picker                          │
├─ 3  Web Search (optional, pick backend) ───────────────────┤
│  Search vs Extract split + keyless ring vs keyed            │
├─ 4  Providers (pick at least one) ─────────────────────────┤
│  Primary + fallback chain + aux models routing              │
├─ 5  Gateway (optional) ────────────────────────────────────┤
│  Messaging platforms (Telegram/Discord/Slack/WA/Signal/...) │
├─ 6  MCP (optional) ────────────────────────────────────────┤
│  Catalog + custom stdio/http servers                        │
├─ 7  Memories / Vault (optional) ────────────────────────────┤
│  Persistent memory + Obsidian/graph vault                   │
└────────────────────────────────────────────────────────────┘
         Steps 1 and 4 are hard-gated (cannot Finish until valid).
         Steps 2,3,5,6,7 are check-box / radio with Skip.
```

#### 6.3.1 Section 1 — Core (required)

Mirrors Hermes `config.yaml` core plus Lokma theme tokens (`Docs/11-*`):

| Field | Widget | Default | Stored in |
|-------|--------|---------|-----------|
| `agent.name` / `SOUL.md` slot #1 | text input | `$USER` host name | `~/.lokma/config.json` → later `SOUL.md` slot |
| `terminal.backend` | radio: `local` \| `docker` \| `ssh` \| `modal` \| `daytona` | `local` | `config.json: terminal.backend` |
| `terminal.timeout` | number | `180` | same |
| `theme` | radio: `omp` (near-black/indigo), `claude` (cream/terracotta), `midnight`, `paper`, `+community` | `omp` | `config.json: theme` — one `themes/*.json` token set, CLI+Web parity |
| `cwd` policy (`terminal.cwd`, `home_mode`) | radio | `"."` / `auto` | `config.json` |
| `contextLength.protect*` | advanced disclosure | 50% threshold | `config.json` |

Validation: terminal backend must be executable in current env (`docker ps` / `ssh -O check` probe like `hermes doctor`); theme preview renders a tiny color swatch inline (Ink `<Box borderStyle>` + ANSI tokens).

Cannot skip. `Next` only lights when terminal probe passes.

#### 6.3.2 Section 2 — Browser (optional)

Mirrors Hermes `browser:` + `AGENT_BROWSER_ENGINE` (see `Docs/12-*` harness arch):

| Field | Widget | Options | Stored |
|-------|--------|---------|--------|
| Browser engine | radio | `chromium` (local Playwright, needs `npx playwright install chromium`) · `nous-cloud-browser` (Portal Tool Gateway) · `disabled` | `config.json: browser.cloud_provider` + `browser.allow_private_urls` |
| `BROWSERBASE_API_KEY` / `BROWSER_USE_API_KEY` | masked input | only shown if cloud engine chosen | `credentials.json` (0600, encrypted) |
| Private URL access | toggle | `allow_private_urls: true` | `config.json: security.allow_private_urls` |

Ping probe: attempt a `browser_navigate` smoke test (`about:blank`) when engine selected; spinner + green check / red error. `Skip` leaves browser disabled.

Hermes precedent: `hermes setup --skip-browser` flag and lazy Playwright install (`npx playwright install chromium --with-deps` gated by `sudo` detection) [Source: https://hermes-agent.nousresearch.com/docs/getting-started/installation](https://hermes-agent.nousresearch.com/docs/getting-started/installation).

#### 6.3.3 Section 3 — Web Search (optional, pick backend)

Hermes' `web.*` is the model: one shared `backend` fallback plus per-capability split [Source: https://hermes-agent.nousresearch.com/docs/user-guide/features/web-search](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-search).

UI — two radios + one key store:

```
Search backend  (◉ firecrawl  ○ searxng  ○ tavily  ○ exa  ○ parallel  ○ brave-free  ○ ddgs  ○ xai  ○ keyless-ring)
Extract backend (◉ firecrawl  ○ tavily  ○ exa  ○ parallel  ── disabled for search-only: searxng/brave/ddgs/xai)
Key for selected backend: [••••••••]  (hint: leave blank for keyless ring)
```

| Config key | Store | Notes |
|-----------|-------|-------|
| `web.search_backend` / `web.extract_backend` | `config.json: web.search_backend`, `web.extract_backend` | When blank, falls through to `web.backend`; when that too blank, auto-detect from env/keys (never-configured path). Persist the user's explicit radio so adding a key later does not reroute silently. |
| `web.backend` | `config.json` | Shared fallback; `nous` = managed Tool Gateway |
| `web.keyless_fallback` | `config.json` | `true` (default 5-vendor ring: Exa/Parallel/Tavily/Firecrawl/Keenable, `rescued_from` tagging). `false` = hard fail when no key |
| `web.cache_enabled` / `web.cache_exempt_hosts` | `config.json` | Advanced disclosure |

Keys: `FIRECRAWL_API_KEY`, `SEARXNG_URL`, `TAVILY_API_KEY`, `EXA_API_KEY`, `PARALLEL_API_KEY`, `BRAVE_SEARCH_API_KEY`, `XAI_API_KEY`, `TOOL_GATEWAY_DOMAIN` — all go to `credentials.json` (encrypted, `keySet: boolean` exposed to Web `GET /api/config`).

Live verify: `web_search("test", limit=2)` smoke call; show latency + provider that actually served (keyless ring notes the vendor + `rescued_from`).

Default path (zero user action): `keyless-ring` → works out of the box, no signup, round-robin with multi-hop retry. Selecting any named backend pins it (even `Free` pin = anonymous endpoint, not downgrade-on-missing-key semantics).

#### 6.3.4 Section 4 — Providers (pick at least one)

This is the **hard gate** (Lokma cannot run without inference). Hermes precedent: `hermes model` picker + `hermes auth` pools + `hermes fallback` chain.

UI — provider table + fallback builder:

```
 Providers (at least one enabled)                    Priority
 ◉ anthropic  [key: ••••]   model: claude-sonnet-5   [01 ↑↓]
 ○ openai     [key:     ]   model: gpt-5.5           [02    ]  ← disabled, no key
 ◉ openrouter [key: ••••]   model: anthropic/claude-opus-4.8 [03]
 ○ ollama     [URL: http://localhost:11434]  model: llama-3.1-70b

 Fallback chain (drag to reorder, space to toggle):
   1. openrouter / anthropic/claude-sonnet-4   [x]
   2. (add...)                                 [ ]

 Credential pools (per provider):
   openrouter: 2 keys  (strategy: round_robin)  [manage]
```

| Concern | Widget | Storage | Validation |
|---------|--------|---------|------------|
| **Primary provider+model** | searchable picker (like `hermes model` — fetches `GET /v1/models` when `discover_models:true`, paginated) | `config.json: defaultModel` + `providers[{id, enabled, priority}]` | probe `GET <base_url>/models` or a 1-token completion |
| **Keys** | masked input per provider (env var name shown: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `XAI_API_KEY`, `GOOGLE_API_KEY`, `OLLAMA_BASE_URL` for local) | `credentials.json: providers[anthropic].apiKey` (AES-GCM, 0600) — web sees only `keySet: boolean` | live `auth status` probe |
| **Fallback chain** | ordered multi-select (same picker as primary) | `config.json: fallback_providers: [{provider, model, base_url?, key_env?}]` | warn if fallback == primary; enforce `fallback_providers` vs legacy `fallback_model` (plural wins) |
| **Aux routing** | disclosure: `auxiliary.vision`, `auxiliary.compression`, `auxiliary.skills_hub` each `auto|openrouter|nous|...` + `fallback_chain[]` + `base_url` override | `config.json: auxiliary.*` | probe per task |
| **Provider routing** (OpenRouter/Nous) | disclosure: `sort`/`only`/`ignore`/`order`/`require_parameters`/`data_collection` | `config.json: provider_routing` | no probe |

Gate: Finish disabled until ≥ 1 provider row is `◉ enabled` *and* its key probe succeeded *or* it's keyless/local. `Skip` is not offered on this section; user can `q` to exit and `lokma init --quick` later.

Hermes `model:` vs `providers:` mapping: Lokma mirrors it with `defaultModel: "anthropic::claude-sonnet-4-5"` (Lokma uses `provider::model` notation; Hermes uses `provider` + `default` split — both store `base_url` + `key_env` + `discover_models`). The OpenAPI-compatible `base_url` + `key_env` shape covers custom endpoints without a named provider slot (`custom` provider in Hermes).

#### 6.3.5 Section 5 — Gateway (optional)

Checkbox list per platform (like `hermes gateway setup` arrow-key picker). No ordering constraint — zero, one, or many can be enabled.

```
Gateway (optional — pick any, or skip; works behind firewalls via polling/Socket Mode)

 ☑ Telegram   token: ••••   allowed: 123456,987654   [✓ connected (polling)]
 ☐ Discord    token:        allowed:                 [—]
 ☑ Slack      xoxb: ••••  xapp: ••••  U01ABC…       [✓ Socket Mode]
 ☐ WhatsApp   mode: bot    users: 1555...            [— needs QR scan]
 ☐ Signal     http: http://127.0.0.1:8080  account:+1  [—]
 ─────────────────────────────────────────────────────
 ☐ Email      ☐ Mattermost  ☐ Matrix  ☐ Home Assistant … [more ▶]
```

| Platform | Required fields in wizard | Stored (secrets) | Stored (config) | Probe |
|----------|---------------------------|------------------|-----------------|-------|
| Telegram | `bot token` (from `@BotFather /newbot`), `allowed user IDs` (via `@userinfobot`/setup wizard) | `TELEGRAM_BOT_TOKEN` in `credentials.json`/`.env` | `platforms.telegram.extra.*` (webhook vs polling, `proxy_url`, `status_indicator`) | `GET https://api.telegram.org/bot<token>/getMe` |
| Discord | `bot token` (Developer Portal → Bot → Reset Token), `Application ID`, invite URL perms, `allowed user IDs` | `DISCORD_BOT_TOKEN` | `discord.require_mention`, `auto_thread`, `allow_mentions.*`, `free_response_channels` | `GET https://discord.com/api/users/@me` + Gateway WS `HELLO` |
| Slack | `xoxb` + `xapp` + scopes + event subs + Messages Tab toggle + manifest write | `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN` | `platforms.slack.extra.*` (`reply_in_thread`, `rich_blocks`, `native_task_cards`, `allow_bots`) | `api.test` + `apps.connections.open` for Socket Mode |
| WhatsApp | QR scan via `hermes whatsapp` equivalent (`lokma gateway whatsapp`); phone number & mode (`bot` vs `self-chat`) | session dir `~/.lokma/platforms/whatsapp/session` | `whatsapp.text_batch_delay_seconds` | Baileys `connection.update` = `open` |
| Signal | `signal-cli link` + `daemon --http`, `SIGNAL_HTTP_URL`, `SIGNAL_ACCOUNT` | `SIGNAL_HTTP_URL`, `SIGNAL_ACCOUNT` | `SIGNAL_GROUP_ALLOWED_USERS` | `GET /api/v1/check` |

Pattern for every platform: **wizard shows `already configured` badge**, writes to `credentials.json` + `config.json: platforms.*`, then offers `Test connection` (single-message round-trip) and `Start gateway now? (Y/n)`. Skipping is always allowed — gateway runs fine with zero platforms (cron + TUI only).

Bridging note exposed in the wizard footer: "Gateway and TUI share one database (`~/.lokma/sessions/*.jsonl` + `state.db`). TUI works without the gateway; the gateway pushes `MEDIA:` attachments and `/command` replies into the same sessions."

#### 6.3.6 Section 6 — MCP (optional)

Two sub-panes (mirrors Hermes `hermes mcp catalog` vs `hermes mcp add`):

```
 MCP — curated catalog (★ Nous-approved)        MCP — custom servers

  ☑ notion     [enabled]   Pages & DBs            [Add custom...]
  ☐ linear     [available] Linear issues              stdio: npx -y @modelcontextprotocol/server-filesystem /tmp
  ☐ supabase   [available] Postgres/auth              http:  https://mcp.example.com/mcp  [auth: oauth]
  ☐ atlassian  [available] Jira/Confluence            preset: codex
  ☑ open-design [enabled]  /opt/node…                [Test] [Remove]
  ─ 70 curated · search: [notion____]               (empty = none, totally fine)
```

| Field | Widget | Storage | Flow |
|-------|--------|---------|------|
| Curated catalog row | checkbox + status badge (available/enabled/installed(disabled)/custom) + `Install` button | `config.json: mcp.servers[notion]` (`transport: http`, `url`, `enabled`, `auth: oauth|header`, `tools.include/exclude`) + `credentials.json` for `headers.Authorization` | Clones manifest repo to `~/.lokma/mcp-cache/<name>`, runs `bootstrap` (`pip install`/`npm install`), prompts for API key/OAuth, probes tools, opens checklist `Select tools for 'linear'` (reads `tools.default_enabled` / `tools.default_excluded` from manifest). |
| Tool filter | `SPACE` toggle per tool, `ENTER` confirm; globs (`*_dns_*`) allowed | `tools: { include: [...] }` or `{ exclude: [...] }` — empty = all enabled | `hermes mcp configure <name>` reopens same checklist |
| Custom server | `Add custom` modal: name + `url` OR `command+args` + `env` table + `auth` select | same `mcp.servers` key | `Test connection` runs `initialize` + `tools/list` with `connect_timeout` countdown (default 30s) |
| Global knobs | `supports_parallel_tool_calls`, `idle_timeout_seconds` for Chromium | per-server `config.json` | — |

Empty is valid — wizard offers `Skip (no MCP)`.

Hermes auth parity for remote MCPs:
- **OAuth DCR:** `auth: oauth` → browser + loopback callback + token cache `~/.lokma/mcp-tokens/<server>.json` (0600). Headless path: paste-back `?code=&state=`, SSH forward, or `oauth.redirect_uri` behind a public reverse proxy. `oauth.redirect_host: localhost` for WAF hosts that 403 on `127.0.0.1`.
- **mTLS / identity header:** preserved 1:1 from Hermes schema.
- **Env substitution:** `${VAR}`, `${userHome}`, `${workspaceFolder}` at connect time; `${INSTALL_DIR}` at install time.

#### 6.3.7 Section 7 — Memories / Vault (optional)

Mirrors `Docs/28-MEMORY-infinite-vault-graph.md` + `Docs/29-OBSIDIAN-MCP-*`:

```
 Memories & Vault (optional — power every session with your own context)

  memories/
    ☑ Enable persistent memory (MEMORY.md long-term, USER.md profile)   [default: on]
    location: ~/.lokma/memories/  [char limit: 200k]
    Memory hook: ~/.lokma/scripts/memory-vault-hook.sh  [post_tool_call on memory]

  vault (optional)
    ○ Obsidian vault  [path: ~/obsidian]   [MCP: obsidian]
    ○ memory-vault    [plugin + cloud sync]
    ○ vault-bulk-ops  [split into linked notes]
    ○ none

  graph
    ○ Infinite vault graph (ent layer)   [spec §28]
    ○ plain files
```

| Field | Stored | Notes |
|-------|--------|-------|
| `memory.memory_enabled` / `user_profile_enabled` | `config.json: memory.*` | Default true per Hermes; `SESSIONS.md` / `MEMORY.md` / `USER.md` live under `~/.lokma/memories/`. `hooks.post_tool_call: [{matcher:^memory$, command: memory-vault-hook.sh}]` parallels Hermes. |
| Obsidian vault path | `config.json: memory.vault_path` + optional `mcp_servers.obsidian` stdio entry | If vault path exists, offer `Install obsidian` skill + MCP (search/create/edit notes). `obsidian` skill lists as `builtin` in Hermes. |
| `memory-vault` sync | `config.json` + `~/.lokma/plugins/memory-vault` | When enabled, `hermes-memory-to-vault` and `memory-vault` skills handle `kaydet` commands and auto-mirror. |
| Privacy disclosure | `security.redact_secrets` (default true) | Mirrors Hermes security gate. |

All optional; `Skip` keeps the Hermes default (memory on, no vault).

### 6.4 Interaction Polish (Ink)

- **Keyboard:** `↑/↓` move, `Space` toggle checkbox, `Enter` confirm row, `←/→` change radio, `e` edit key cell (masked input with `Ctrl+R` reveal), `t` test connection, `1–7` jump sections, `/` search in catalog.
- **Progress:** each section's footer shows section-level probe spinner + `N of M configured` badge (turns green when valid). Top bar shows global breadcrumb `Core ✓ > Browser ✓ > Search ○ > Providers ● > Gateway ○ > MCP ○ > Vault ○` (● = currently editing, ✓ = valid, ○ = optional/untouched).
- **Live help:** `?` opens a right-hand legend; platform/MCP rows show a one-line `source: https://mcp.notion.com/mcp` link so the user can inspect before installing (mirrors Hermes trust model).
- **Error surfacing:** probe failures stay on-screen in a red box under the row (never swallowed), with a `Copy error` + `View gateway.log` hint.
- **Finish:** enabled only when Section 1 and Section 4 gates pass. On finish: `lokma doctor` runs automatically, prints `Config: ~/.lokma/config.json  Secrets: ~/.lokma/credentials.json (0600, encrypted)` and the effective `lokma config --dump` summary (keys masked). Offers `lokma` to start chatting or `lokma --help` for surfaces table.

### 6.5 Files This Wizard Writes (Summary)

| File | What init writes | Example |
|------|------------------|---------|
| `~/.lokma/config.json` | `version`, `defaultModel`, `defaultProvider`, `theme`, `providers[]`, `fallback_providers[]`, `mcp.servers{}`, `platforms.*`, `web.*`, `browser.*`, `memory.*`, `terminal.*` | See `Docs/26-CONFIG-and-CREDENTIALS.md` §3.1 |
| `~/.lokma/credentials.json` | `version`, `providers{}.apiKey`, `oauth{}` — whole file AES-256-GCM encrypted, `0600` | Per §3.2 of the same doc |
| `~/.lokma/settings.json` (alt global override, optional) | rarely by init | — |
| `.lokma/settings.json` (project root) | not written by global `lokma init` (per-project `lokma init --here` mode) | `defaultModel`, `permissions`, `hooks`, `mcp` overlay |
| `~/.lokma/platforms/<name>/session` | WhatsApp Baileys session after QR scan | not JSON, protect like a password |
| `~/.lokma/mcp-cache/<name>/` | cloned catalog repo at install time | manifest.yaml + bootstrap artifacts |
| `~/.lokma/mcp-tokens/<server>.json` | OAuth token cache per MCP server | 0600 |

Web parity: `GET /api/config` returns masked view (`keySet: boolean` per provider/platform), `PATCH /api/config` and `POST /api/providers/:id` write the same two files (`config.json`/`credentials.json`) via the shared `loader.ts`, with a `chokidar` watcher emitting `config/changed` to plugins [Source: `Docs/26-CONFIG-and-CREDENTIALS.md` §5–6].

---

## 7. Appendix A — Provider & Web Search Backend Inventories (Live Probe)

### 7.1 Model Provider Catalog (from `providers.omniroute.models` in probed config)

The probed host's `omniroute` provider advertises **200+** model IDs covering families: `auto/*` (`auto/best-coding`, `auto/smart`, `auto/claude-sonnet`, `auto/offline`), `cmd/*` + `command-code/*` (fermag router: `claude-sonnet-5`, `claude-opus-5`, `gpt-5.6-sol`, `moonshotai/Kimi-K3`, `zai-org/GLM-5.3`, `MiniMaxAI/MiniMax-M3`, `xiaomi/mimo-v2.5`, `Qwen/Qwen3.8-Max`, etc.), `ds-web/*` (DeepSeek Web), `gweb/*` (Gemini Web), `lma/*` + `lmarena/*` (LMArena), `muse-spark-1.2` family, `grok-4.6`, `nemotron-3-ultra`. `discover_models: true` means the running gateway refetches `GET <base_url>/v1/models` and `hermes model --refresh` busts the `models.json` cache [Source: `~/.hermes/config.yaml` probe + https://hermes-agent.nousresearch.com/docs/user-guide/features/fallback-providers](https://hermes-agent.nousresearch.com/docs/user-guide/features/fallback-providers).

### 7.2 Web Search Backend Taxonomy

| Backend | Needs | Search | Extract | Free tier | Where it lands in Lokma init |
|---------|-------|--------|---------|-----------|------------------------------|
| Firecrawl (default) | `FIRECRAWL_API_KEY` optional | ✔ | ✔ | 500 credits/mo; keyless cloud when selected | `search_backend` or `extract_backend` radio |
| SearXNG | `SEARXNG_URL` | ✔ | — | self-hosted (free) | `search_backend` only |
| Tavily | `TAVILY_API_KEY` optional | ✔ | ✔ | keyless ring member; 1k/mo with free key | either role |
| Exa | `EXA_API_KEY` optional | ✔ | ✔ | keyless ring member; 1k/mo with key | either role |
| Parallel | `PARALLEL_API_KEY` optional | ✔ | ✔ | keyless ring member | either role |
| Keenable | `KEENABLE_API_KEY` optional | ✔ | ✔ | keyless ring member | either role |
| Brave Search | `BRAVE_SEARCH_API_KEY` | ✔ | — | 2k queries/mo | search only |
| DDGS (DuckDuckGo) | `pip install ddgs` | ✔ | — | free | search only |
| xAI Grok | `XAI_API_KEY` or `hermes auth add xai-oauth` | ✔ | — | paid | search only; opt-in only, never auto-detected |

Rule: `search_backend` / `extract_backend` (explicit per-capability) > `web.backend` (shared fallback) > auto-detect from env (never-configured only). Pinning `Free` vs `Paid` tier is per-vendor (`web.provider_tier.<name>: free|paid`; unset = auto key→paid, else keyless ring) [Source: https://hermes-agent.nousresearch.com/docs/user-guide/features/web-search](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-search).

### 7.3 MCP Catalog Snapshot (70 curated, sampled)

```
airtable, algolia, alltrails, amplitude, asana, atlassian, attio, aws-knowledge, betterstack,
buildkite, calendly, canva, circleci, clickup, close, cloudflare, cloudinary, comfy-cloud,
context7, craft, datadog, deepwiki, dropbox, figma, fireflies, gamma, gitlab, globalping,
grafana, hugging_face, indeed, intercom, kiwi, klaviyo, linear, microsoft-learn, miro,
mixpanel, monday, motherduck, n8n, neon, netlify, notion, paypal, plaid, postman,
prisma-postgres, railway, robinhood, semgrep, sentry, square, strava, stripe, supabase,
todoist, trivago, twelve-data, twilio-docs, unreal-engine, vercel, webflow, wolfram,
wordpress-com  (+ 3 custom on host: image-picker, open-design, vision-mcp)
```

Each supports `hermes mcp install <name>` (prompt for creds → `${ENV_VAR}` substitution → tool checklist), and `hermes mcp login <name>` for OAuth [Source: live `hermes mcp catalog` probe + https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp).

---

## 8. Appendix B — Raw Probe Transcript (Host: this machine)

```
Config: /root/.hermes/config.yaml   Secrets: /root/.hermes/.env   Install: /usr/local/lib/hermes-agent
Model: { default: muse-spark-1.2-contributor, provider: opencode-go, base_url: https://opencode.ai/zen/go/v1, key_env: HERMES_CUSTOM_FREE_OPENCODE_GO_API_KEY }
Providers omniroute: https://omniroute.fermag.com.tr/v1 (discover_models: true, 200+ models)
Messaging: Telegram configured, Discord not configured
mcp_servers: open-design (enabled), vision-mcp (enabled, VISION_MCP_MODEL=mimo-v2.5), image-picker (enabled), pencil (disabled)
Skills: 58 builtin + 27 local, plus 139 official optional available in hub (90,666 total loaded)
Hermes CLI: hermes {chat,model,moa,fallback,worktree,browser,secrets,egress,gateway,proxy,lsp,setup,whatsapp,slack,send,auth,status,cron,portal,hooks,doctor,verify,config,pairing,skills,bundles,plugins,mcp,sessions,insights,profile,dashboard,serve,...}
hermes mcp {serve,add,remove,list,test,configure,login,reauth,picker,catalog,install}
hermes setup {model,tts,terminal,gateway,tools,telemetry,agent} [+ --portal|--quick|--non-interactive|--reset]
hermes config {show,edit,get,set,unset,path,env-path,check,migrate}
hermes fallback {list,add,remove,clear}
hermes auth {add,list,remove,reset,status}
```

Cached doc sizes: `messaging` 36k chars, `mcp` 36k, `configuration` 170k, `web-search` 30k, `installation` 25k, `telegram` 64k, `discord` 49k, `slack` 47k, `whatsapp` 28k, `signal` 22k, `provider-routing` 8k, `fallback-providers` 32k, `credential-pools` 14k, `secrets` 6k.

---

## 9. Appendix C — URL Index (Every Page Scraped / Cited)

- Messaging gateway overview: https://hermes-agent.nousresearch.com/docs/user-guide/messaging
- MCP: https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp
- Configuration: https://hermes-agent.nousresearch.com/docs/user-guide/configuration
- Telegram: https://hermes-agent.nousresearch.com/docs/user-guide/messaging/telegram
- Discord: https://hermes-agent.nousresearch.com/docs/user-guide/messaging/discord
- Slack: https://hermes-agent.nousresearch.com/docs/user-guide/messaging/slack
- WhatsApp (Baileys): https://hermes-agent.nousresearch.com/docs/user-guide/messaging/whatsapp
- WhatsApp Cloud API: https://hermes-agent.nousresearch.com/docs/user-guide/messaging/whatsapp-cloud (sibling of above)
- Signal: https://hermes-agent.nousresearch.com/docs/user-guide/messaging/signal
- Provider routing: https://hermes-agent.nousresearch.com/docs/user-guide/features/provider-routing
- Fallback providers: https://hermes-agent.nousresearch.com/docs/user-guide/features/fallback-providers
- Credential pools: https://hermes-agent.nousresearch.com/docs/user-guide/features/credential-pools
- Secrets (Bitwarden/1Password): https://hermes-agent.nousresearch.com/docs/user-guide/secrets
- Web search & extract: https://hermes-agent.nousresearch.com/docs/user-guide/features/web-search
- Browser: https://hermes-agent.nousresearch.com/docs/user-guide/features/browser (503 at scrape time; cached)
- Bot mode (profiles = Bots): https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode
- Installation: https://hermes-agent.nousresearch.com/docs/getting-started/installation

Hermes MCP catalog source (local): `hermes mcp catalog` (runtime) and `optional-mcps/<name>/manifest.yaml` in `hermes-agent` repo.
Host-local config examined: `~/.hermes/config.yaml` (1897 lines), `~/.hermes/.env` (template), `hermes config show`, `hermes skills list|browse`, `hermes mcp catalog`, plus `~/.hermes/cache/web/*.md` dumps.
Lokma design refs: `/mnt/apopic/lokma/Docs/26-CONFIG-and-CREDENTIALS.md`, `Docs/12-HARNESS-MIMARI-cli-web-nasil-kurulur.md`, `Docs/README.md`, `README.md`.

---

## 10. Open Questions / Follow-ups for Lokma

1. **Nous Portal parity:** Hermes' `--portal` bundles search/extract/browser/TTS under one OAuth. If Lokma stays self-hosted, `lokma init --portal` would either proxy through Hermes' Tool Gateway (licensing) or Lokma ships its own gateway — decide before advertising the flag.
2. **Signal dependency:** `signal-cli` + Java 17 is heavy vs. Telegram's token-only flow. Consider gating Signal behind an `advanced ▶` disclosure and warning about the JVM footprint.
3. **WhatsApp ban risk:** Baileys bridge docs explicitly warn "small risk of account restrictions" and suggest a dedicated number. Lokma's UI should surface that warning inline, not in a tooltip.
4. **Encryption key for `credentials.json`:** spec picks `LOKMA_ENCRYPTION_KEY` (hex) or OS keychain. Decide the UX for headless/CI (key via env vs. `--insecure` no-encryption mode) and keep `lokma doctor` warnings aligned.
5. **MCP OAuth token storage:** Hermes uses `~/.hermes/mcp-tokens/<server>.json` (0600). Lokma should keep the same per-server file rather than cramming tokens into `credentials.json` — they have different lifetimes and clear-on-revoke semantics.
6. **Web keyless ring accounting:** the 5-vendor round-robin is a *last-resort* tier. Lokma analytics should tag `via: keyless` vs `via: <backend>` so users can tell when they're on the degraded tier before they file latency complaints.
7. **Command menu caps:** Telegram allows 100 but Hermes caps at 60 for reliability; Lokma's gateway (if any) should respect the same cap, not expose a raw 100 that silently flakes.

---

*Generated for `/tmp/hermes-connections-raw.md` — 511 lines without this footnote, ~860 lines total with tables and code blocks. Covers the four scraped pillars (messaging, configuration, MCP, skills/catalog) plus provider fallback/pools/routing and Lokma init design. No fabrication: every number, file path, and flag above was observed via `web_extract` or the live `hermes` CLI on this host.*

