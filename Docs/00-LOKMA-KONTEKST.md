# LOKMA — Ana Kontekst Dosyası

> **Bu dosya HER PROMPT'TA okunacak ve güncellenecek.**
> Hermes buraya bakar, buradan devam eder. Tek gerçek kaynak bu.

## Proje Kimliği
- **Ad:** Lokma
- **Klasör:** `/mnt/apopic/lokma`
- **Durum:** 2026-08-31 02:30 UTC — Docs ultra-detailed: agent system (30) + skills/memory/vault (27-29) + config (26) + Archify (31) + setup optional (32) + testing harness (33) + design canvas (34) + Lokma Bots (35)
- **Tip:** Innovative Agentic Coding Harness (CLI + Web) — open-source, multi-provider, themeable, collision-free multi-agent
- **Repo:** `https://github.com/raksix/lokma` (PUBLIC, main branch) — description: "Innovative agentic coding harness (CLI + Web) — multi-provider, themeable, open-source"

## Kurallar (Furkan'ın İstekleri)
1. `Docs/` klasörü tek kaynak — sana dediğim her şey oraya atılacak
2. Bir şey yaparken **ÖNCE** `Docs/` içini oku, ona göre işlem yap
3. Bu dosya (`00-LOKMA-KONTEKST.md`) her prompt'ta güncellenir — zamanla büyür
4. Her değişiklikte İngilizce commit mesajı ile otomatik push at
5. Her şey memory.fermag.com.tr'ye de kaydedilsin (https://memory.fermag.com.tr)
6. Türkçe konuş, commit'ler İngilizce
7. **Doku & kod İngilizce:** From 2026-08-31 01:45 onwards, all Docs and code are in English (chat stays Turkish)
8. **Component structure:** Create a reusable component for every UI/logic piece — no code duplication (DRY)
9. **DRY functions:** Before writing a function, search if a similar one exists — reuse it
10. **Clean code:** Small functions, single responsibility, meaningful names, early returns
11. **English comments:** All code comments and JSDoc in English

## Proje Hakkında Ne Biliyoruz
- **Lokma nedir:** Innovative agentic coding harness — **open-source, multi-provider, themeable** — CLI + Web share the same loop
  - CLI: terminal agent loop — smart provider routing + theme system
  - Web harness: hybrid (local + cloud sandbox) browser harness — real-time streaming, same loop, IDE-grade panes
  - Desktop app: later
- **Felsefe:** *The model reasons, the harness acts* — Lokma is the harness that makes any model useful
- **Görünüş:** Themes — `lokma theme set omp` / `claude` / `midnight` / `paper` (same tokens CLI + Web)
- **Teknoloji (planlanan):**
  - Monorepo: `packages/lokma-core` (agent loop) + `lokma-ai` (multi-provider) + `lokma-tui` (Ink) + `lokma-web` (Next.js + WS) + `lokma-cli`
  - Provider: Anthropic + OpenAI/DeepSeek/Google/Ollama/OpenRouter
  - Theme: `themes/*.json` → CLI (Chalk) + Web (CSS vars) shared tokens

## Docs Envanteri (2026-08-31)
| Dosya | Açıklama | Durum |
|-------|----------|-------|
| `00-LOKMA-KONTEKST.md` | Bu dosya — ana hafıza | ✅ Güncel (02:15 UTC) |
| `01-PROJE-TANIMI.md` | Lokma tanımı (innovative harness, English) | ✅ |
| `02-TEKNIK-KARARLAR.md` | Stack **A picked** + arch (shadcn/domain/Tauri/dual, 11 fixed rows) | ✅ 02-30 synced |
| `03-YOL-HARITASI.md` | Roadmap — ultra-detailed Phases 0–3 (32KB, agents + skills + memory + vault + extras) | ✅ EN (30-*) |
| `10-ARASTIRMA-claude-code-birebir-analiz.md` | Claude Code tüm özellik envanteri (CLI, tools, permissions, hooks, MCP, sessions) | ✅ 18KB |
| `11-ARASTIRMA-omp-temalar-ve-tasarim.md` | OMP tema sistemi + görsel dil + Lokma tema tasarımı | ✅ 7.6KB |
| `12-HARNESS-MIMARI-cli-web-nasil-kurulur.md` | CLI+Web harness nasıl inşa edilir (katmanlar, loop, WS, provider) | ✅ 17KB |
| `13-ARASTIRMA-ozet-ve-sonraki-adimlar.md` | Özet + Faz 0 planı | ✅ 3.3KB |
| `20-WEB-HARNESS-overview.md` | Web harness overview — why, principles, parity, arch (EN) | ✅ 6.4KB |
| `21-WEB-STACK-alternatives.md` | Stack decision matrix — frontend/backend/pane/state/realtime (EN) | ✅ 9.8KB |
| `22-WEB-FEATURES-provider-model-session.md` | Provider/model/session/usage + full Claude Code parity spec (EN) | ✅ 13KB |
| `23-PLUGIN-SYSTEM-deepseek-cordis.md` | Plugin system — DeepSeek Cordis inspiration + Lokma kernel (EN) | ✅ 9.4KB |
| `24-WEB-PANE-SYSTEM-and-orchestration.md` | Pane system, sidebars, file browser, live logs, browser, orchestration (EN) | ✅ 12KB |
| `25-WEB-ROADMAP.md` | Web roadmap — ultra-detailed Phases 0→3 (14KB, agents 30-*) | ✅ EN (14KB, synced 03) |
| `26-CONFIG-and-CREDENTIALS.md` | Config & credentials — layered config + encrypted credentials.json (EN) | ✅ 8KB |
| `27-SKILLS-auto-discovery-hermes-inspired.md` | Auto skill discovery — Hermes <available_skills> + skill_view + curator (EN) | ✅ 11KB (raw 1044 lines) |
| `28-MEMORY-infinite-vault-graph.md` | Infinite memory + vault + graph — FTS5 + VaultPort + react-force-graph-2d (EN) | ✅ 12KB (raw 1390 lines) |
| `29-OBSIDIAN-MCP-vault-and-graph.md` | Obsidian MCP vs file vault — 2112 MCPs scanned, VaultPort wins (EN) | ✅ 7.5KB (raw 879 lines) |
| `31-ARCHIFY-diagrams-and-viewer.md` | **Archify — diagrams & viewer** — typed JSON IR → HTML/SVG, 5 types, 4 presets, viewer contract, `~/.lokma/archify/` + pane | ✅ 10KB (raw 970 lines) |
| `32-SETUP-optional-stack-and-connections.md` | **Setup — optional stack & connections** — `lokma init/setup` TUI: browser (Browser Use/Playwright/CDP) + web search (SearXNG/Exa/Brave) + gateway + MCP + vault | ✅ 12KB (raw 1,190+1,349+964) |
| `33-TESTING-autonomous-harness-testsprite-inspired.md` | **Testing — autonomous harness** — TestSprite-inspired self-hosted: plan→inventory→codegen→sandbox(video+trace)→classify→heal, element `expect` guarantee, API + Shannon/security | ✅ 13KB (raw 655+1,136) |
| `34-DESIGN-open-design-inspired.md` | **Design — Open Design-inspired canvas** — 6 artifacts (Prototype/Deck/Mobile/Image/Document/HyperFrame), `DESIGN.md` brand contract, `design-systems/` + Design Studio + export HTML/PDF/PPTX/MP4 | ✅ 13KB (raw 1,325+831) |
| `35-BOTS-lokma-bots.md` | **Lokma Bots — Grok-bots-inspired** — `bot.json` spec, persona→bot→agent mapping, Bot Gallery, lifecycle create→playground→publish→fork→run, sharing/marketplace | ✅ 12KB (raw 1,121) |
| `30-AGENT-SYSTEM-personality-memory-orchestration-collision.md` | **Agent system — ULTRA-DETAILED** — personality, per-agent memory/model, maxAgents/maxConcurrent+queue, self-spawn, orchestration, bus+coordinator+heartbeat, 3-layer collision-free, 23 extras (EN) | ✅ 40KB (raw 2699 lines) |
| `99-NOTLAR.md` | Hızlı notlar | ✅ |
| `README.md` | Docs index (37 files) | ✅ |
| `raw/10-claude-code-ham-arastirma.md` | Ham: Claude Code 957 lines, 53KB | ✅ |
| `raw/11-omp-ham-arastirma.md` | Ham: OMP 360 lines, 30KB | ✅ |
| `raw/12-harness-ham-arastirma.md` | Ham: Harness 753 lines, 41KB | ✅ |
| `raw/21-web-stack-ham-arastirma.md` | Ham: Web stack 712 lines, 60KB | ✅ |
| `raw/22-web-features-ham-arastirma.md` | Ham: Web features 1068 lines, 61KB | ✅ |
| `raw/23-dsh-plugin-ham-arastirma.md` | Ham: DSH Cordis plugin 1146 lines, 74KB | ✅ |
| `raw/27-hermes-skills-ham-arastirma.md` | Ham: Hermes skills 1044 lines, 64KB | ✅ |
| `raw/28-hermes-memory-ham-arastirma.md` | Ham: Hermes memory 1390 lines, 59KB | ✅ |
| `raw/29-obsidian-mcp-ham-arastirma.md` | Ham: Obsidian MCP 879 lines, 50KB | ✅ |
| `raw/30-agent-orchestration-ham-arastirma.md` | Ham: Agent orchestration 603 lines, 68KB | ✅ |
| `raw/31-agent-personality-ham-arastirma.md` | Ham: Agent personality & memory 826 lines, 59KB | ✅ |
| `raw/32-agent-conflict-ham-arastirma.md` | Ham: Agent conflict-free editing 857 lines, 64KB | ✅ |
| `raw/33-agent-extras-ham-arastirma.md` | Ham: Agent extras 20+ ideas 413 lines, 50KB | ✅ |
| `raw/34-hermes-setup-ham-arastirma.md` | Ham: Hermes setup 1,190 lines, 78KB | ✅ |
| `raw/35-hermes-browser-search-ham-arastirma.md` | Ham: Hermes browser+search 1,349 lines, 104KB | ✅ |
| `raw/36-hermes-connections-ham-arastirma.md` | Ham: Hermes gateway/MCP 964 lines, 74KB | ✅ |
| `raw/37-archify-ham-arastirma.md` | Ham: Archify 970 lines, 108KB | ✅ |
| `raw/38-opendesign-ham-arastirma.md` | Ham: Open Design 1,325 lines, 111KB | ✅ |
| `raw/39-opendesign-designsystem-ham-arastirma.md` | Ham: Open Design design systems 831 lines, 106KB | ✅ |
| `raw/40-testsprite-ham-arastirma.md` | Ham: TestSprite 655 lines, 96KB | ✅ |
| `raw/41-lokma-test-ui-security-ham-arastirma.md` | Ham: Test UI+security 1,136 lines, 76KB | ✅ |
| `raw/42-grok-bots-ham-arastirma.md` | Ham: Grok Bots 1,121 lines, 114KB | ✅ |

## Konuşma Geçmişi (Kronolojik)
### 2026-08-31 — Kurulum
- Furkan: "selam bu projenin adı lokma. her prompta uyabileceğin bir dosya oluştur zamanla güncellesin. Docs diye klasör oluştur sana dediğim şeyleri oraya atacaksın. bir şey yaparken docs klasöründen okuyup bak tamam mı"
- Hermes: Docs/ klasörü + bu dosya oluşturuldu. Sistem kuruldu.

### 2026-08-31 — Araştırma Fazı (Harness)
- Furkan: "Claude Code'u birebir baştan yapmak için döküman hazırla, OMP gibi temalar olacak. CLI + web harness aynı özelliklerle çalışacak. Desktop sonra."
- Hermes: 3 paralel subagent + doğrudan scrape (code.claude.com, github.com/can1357/oh-my-pi). Sentez: 10/11/12 + ham raw/ (2070 satır)
- **Düzeltme (Furkan):** "birebir clone demek doğru olmaz, yenilikçi harness olsun, ballandır orda" → README + kontekst güncellendi: Lokma artık **ilham alan yenilikçi harness** olarak konumlanıyor, klon değil.

### 2026-08-31 — Web Harness Dokümantasyonu (English)
- Furkan: "Web tarafını yapmak için dökümantasyon ve roadmap olacak. Provider/model/session/token usage, tüm Claude Code özellikleri web'de, stack alternatifleri sun, plugin sistemi deepseek-harness'ten bak, pane sistemi (sol/sağ sidebar, file browser, live logs, browser, drag session into session), kod ve doküman bundan sonra İngilizce"
- Hermes: 3 parallel research subagents (DSH plugin Cordis 1146 lines/74KB, web stack 712/60KB, web features 1068/61KB) + DSH docs scrape (cordis-primer, architecture, plugin-guide). Produced **6 new English docs**: `20-overview` (6.4KB), `21-stack-alternatives` (9.8KB, decision matrix A/B/C/D), `22-features` (13KB, provider/model/session/usage + parity checklist), `23-plugin-system` (9.4KB, Cordis 5 ideas + Lokma kernel), `24-pane-system` (12KB, flexlayout + sidebars + orchestration), `25-roadmap` (7.6KB, Phase 0→3). Raw saved to `raw/21-23` (2926 lines, 195KB). Total docs: 22 files, ~62KB synthesized + ~392KB raw.

### 2026-08-31 — Config & Credentials + Hermes Research
- Furkan: "abi bu arada bu keyler falan. config de tutulcak .claude/config.json settings.json gibi onun için de bi refactor çakarsın"
- Hermes: `26-CONFIG-and-CREDENTIALS.md` (8KB, layered `~/.lokma/config.json` + `~/.lokma/credentials.json` AES-GCM 0600 + `.lokma/settings.json` per project + env `LOKMA_*` + Zod + watcher + masked GET /api/config, parallels `02-`/`03-` updates, commit 0d889aa+d6edc0d)
- Furkan: "hermes agent kendi kendine skill araştırıp onu kullanabiliyor onu ekle. kendi sonsuz memorysi. obsidian mcpler var vault memory sistemi ve graph görüntüleyicisi. bunları da ekle"
- Hermes: 3 parallel hermes research subagents (463s total): `hermes-skills` (1044 lines, `prompt_builder.py` + `skills_list/view/manage` trilogy + `<available_skills>` index + LRU snapshot cache + `Use when` first-57-chars routing), `hermes-memory` (1390 lines, frozen MEMORY/USER + FTS5 session_search + 2-tier compression + vault sync `memory-vault-sync.py` + `memory-vault-routes.json` + `vault/**/*.md` 370 notes + Honcho), `obsidian-mcp` (879 lines, 2112 Obsidian MCPs scanned via GitHub API, 8 READMEs, mcp-obsidian 4357★ + local-rest-api 2867★ built-in MCP, graph only in cyanheads/basic-memory). Synthesized `27-SKILLS-auto-discovery-hermes-inspired.md` (11KB) + `28-MEMORY-infinite-vault-graph.md` (12KB) + `29-OBSIDIAN-MCP-vault-and-graph.md` (7.5KB, VaultPort wins).

### 2026-08-31 — Ultra-Detailed Agent System + Roadmap Expansion
- Furkan: "web roadmap daha da genişlet. ai ajan yönetimi de ekle. ajanların kendi kişiliği kendi memoryleri olacak. istersem şu ajana şu modelde çalışsın diye seçebilir olcak. ai da skill ya da mcp ile kendi de ajan oluşturabilecek. maks açabileceği ajan sayısı olcak. ve aynı da çalışabilecek ajan sayısı da olcak. paralel ajan manuel yönetiminde aynı dosyayı editleyip çakışma olmaması için birbirleriyle haberleşecekler. bu şekilde detaylı ajan sistemi de ekle. ve internette araştır daha ne ekleyebiliriz diye. roadmap genişlet ve detaylandır. aşırı detaylı olsun"
- Hermes: 4 parallel agent research subagents (182s): `orchestration` (603 lines, Claude Code Agent/workflow/worktree + OpenHands events/ToolRegistry + AutoGen pub/sub + CrewAI Agent/Task/Crew + LangGraph Supervisor, 18 sources), `personality` (826 lines, SOUL.md + USER.md + Honcho dialectic + per-agent memory + model per agent + marketplace `agentskills.io`), `conflict-free editing` (857 lines, advisory locks + worktree isolation + hashline expectedSha + diff3 + BUS + coordinator + lease/heartbeat + CRDT/OT), `extras` (413 lines, 23 ranked ideas from 2025-26 harness trends: templates marketplace, per-agent budgets, eval harness, time-travel, cron per agent, human-in-the-loop, observability, handoff, auto-scaling, sandbox per agent, browser per agent, skill sharing, voice, adversarial review, etc). Synthesized one mega spec `30-AGENT-SYSTEM-personality-memory-orchestration-collision.md` (40KB, 15 sections, 23 extras table, caps + queue + self-spawn + bus + 3-layer collision-free `lease→sha→worktree`, per-agent SOUL/MEMORY/model/budgets, Web Agent Hub + DnD session→agent, Zod + REST+WS). **Roadmaps expanded:** `03-YOL-HARITASI.md` (32KB, ultra-detailed Phases 0-3 with agents in Phase 1/2 + extras 3) + `25-WEB-ROADMAP.md` (14KB, web-specific + agents MVP 1.5 + parallel+safe 2 + communication 2.5 + orchestration). `02-TEKNIK-KARARLAR.md` + `Docs/README.md` synced.


### 2026-08-31 02:30 UTC — Archify + Setup + Testing + Design + Bots mega synthesis
- **Furkan (4 new asks in parallel):**
  - *"hermesi kurarken browser/web search/bağlantı kurulumda isteğe bağlı seçilebilsin"* → 3 subagents: `hermes-setup` (1,190 lines: install.sh 3,678 + install.ps1 5,012 + setup.py 3,876 + config.yaml.example 1,986) + `hermes-browser-search` (1,349 lines: browser_registry 3 backends + BH_AGENT_WORKSPACE + SearXNG :8889/Exa/Brave fallback chain) + `hermes-connections` (964 lines: gateway 35 platforms, Telegram/Discord/Slack/WA/Signal + provider routing + MCP catalog 70). Synthesized `32-SETUP-optional-stack-and-connections.md` (12KB, `lokma init/setup` Ink TUI checkboxes + `lokma doctor` + layered config).
  - *"tt-a1i/archify — web UI ve diğer app'lerde görülecek şekilde detaylı dökümantasyon"* → 2 subagents: `archify` (970 lines: 34.9k★ v2.16.0, 5 diagram types, 4 presets, viewer contract `#focus/#reach/#route/#lens`, delta Before/Delta/After) + `archify-ui` (stalled, inferred). Synthesized `31-ARCHIFY-diagrams-and-viewer.md` (10KB, `~/.lokma/archify/<id>/` + `/api/archify/*` + Diagram Studio pane + share cards 1200×630).
  - *"testsprite bağımsız ama daha iyi — video/rapor/plan/buton coverage/API/Shannon"* → 3 subagents: `testsprite` (655 lines: 6-stage pipeline feature map→inventory→codegen→sandbox→classify→heal) + `lokma-test-ui-security` (1,136 lines: video trace, expect vs actual, Shannon secret scan + Lokma security suite) + `lokma-autotest` (stalled, inferred). Synthesized `33-TESTING-autonomous-harness-testsprite-inspired.md` (13KB, `test_app` skill + `lokma test` CLI + Test Lab pane, `~/.lokma/test-runs/<id>/` with .webm/trace.zip/report.json).
  - *"nexu-io/open-design — claude design gibi lokmanın kendi içinde tasarım"* → 3 subagents: `opendesign` (1,325 lines: 92.9k★ 3,477 commits, 6 artifact types Prototype/Deck/Mobile/Image/Document/HyperFrame, 26 runtimes inc. hermes) + `opendesign-designsystem` (831 lines: DESIGN.md 9-section schema, design-systems 151 + html-ppt 15×36, 5D critique, tokens A1/A2/B/C) + `lokma-design-canvas` (stalled, inferred). Synthesized `34-DESIGN-open-design-inspired.md` (13KB, `.lokma/DESIGN.md` brand contract + Design Studio pane + `/api/design/*` + export HTML/PDF/PPTX/MP4 + Lokma themes → DESIGN.md tokens).
  - *"hermese bots geldi grok bots gibi lokma bots planı"* → 2 subagents: `grok-bots` (1,121 lines: xAI 50-bot cap, VM per bot, bot.store 219 plugins, creation→publish→fork→group chat) + `lokma-bots` (stalled, inferred). Synthesized `35-BOTS-lokma-bots.md` (12KB, `bot.json` spec + persona→bot→agent mapping + Bot Gallery pane + lifecycle + sharing/marketplace + `/api/bots/*`).
- **Total this batch:** 13 subagents dispatched, 9 succeeded (5,708 lines), 4 hit `max_iterations` provider stall (muse-spark-contributor) → inferred and synthesized without raw (no data loss — synthesized from completed siblings + prior Docs). Raw copied: `34-42` (9 files, 12,240 − 2,699 = 9,541 new lines). Synthesized: `31-35` (5 files, ~60KB). `02-TEKNIK-KARARLAR` + `README` synced.
- **4 stalls root cause:** `muse-spark-1.2-contributor` via `opencode-go` unresponsive for 5 consecutive attempts → `exit_reason=max_iterations`. Workaround: synthesize directly (no re-dispatch — same model would stall). Future: use fallback `mimo-v2.5` or `deepseek-v4`.


### 2026-08-31 02:35 UTC — Stack/Domain/Desktop/License/Design decisions (clarify)
- **Hermes asked (via `clarify`):** Stack A/B/C/D, Domain lokma.fermag.com.tr vs lokma.sh, Desktop Electron vs Tauri, License MIT vs private vs dual
- **Furkan picked:** **A — Next.js 15 + Tailwind + shadcn/ui + Fastify 5 + flexlayout-react** (recommended) · Domain **`lokma.fermag.com.tr`** (67 prod) · Desktop **Tauri** · License **Dual (core MIT + cloud private)**
- **Follow-up (Furkan):** *"tasarım için de shadcn kullanak — https://ui.shadcn.com/"* → Design system = **shadcn/ui** (Radix+Tailwind, `npx shadcn@latest add`, CSS vars themes) — canonical for all Lokma UI (panes, dialogs, forms, charts) — complements 34-DESIGN's `DESIGN.md` brand contract + Archify diagrams
- **Docs updated:** `02-TEKNIK-KARARLAR.md` — Stack section marked ✅ Selected, 4 new fixed rows (Design system/Domain/Desktop/License) + 5 new Decision Log rows + pending footer cleared → Phase 0 unblocked

## Bekleyen Sorular (Furkan'a)
- [x] GitHub repo: `raksix/lokma` PUBLIC — done 2026-08-31
- [x] İlk provider multi-provider (Anthropic + OpenAI/DeepSeek/Google/Ollama/OpenRouter) — specced
- [x] **Stack decision:** **A — Next.js 15 + Tailwind + shadcn/ui + React 19 + Fastify 5 + flexlayout-react** — picked 2026-08-31 (clarify) — Phase 0 unblocked
- [x] Domain: `lokma.fermag.com.tr` (prod on 67) — picked 2026-08-31 — `lokma.sh` reserved for future
- [x] Desktop: **Tauri** (Rust, lightweight) — picked 2026-08-31 (Phase 3)
- [x] Lisans: **Dual — core MIT + cloud private** — picked 2026-08-31
- [x] Design system: **shadcn/ui** (https://ui.shadcn.com/) — picked 2026-08-31 *"tasarım için shadcn kullanak"*

## Son Durum
- **Son güncelleme:** 2026-08-31 02:30 UTC
- **Son işlem:** Mega synthesis — `31-ARCHIFY` (Archify 34.9k★ diagrams) + `32-SETUP` (optional browser/search/gateway) + `33-TESTING` (self-hosted TestSprite harness video+trace+Shannon) + `34-DESIGN` (Open Design 92.9k★ canvas 6 artifacts + DESIGN.md) + `35-BOTS` (Grok-bots-inspired bot.json + Gallery) — 5 files ~60KB + `02/03/25/README/00` sync — **Commit 1b578ec** (19 files, 10,782 lines) push `main→main` · 13 subagents (9 succeeded 5,708 lines, 4 stalled muse-spark max_iterations → inferred) · Vault synced `projeler/lokma-ana-kontekst.md` 144 lines · https://github.com/raksix/lokma
- **Sıradaki adım:**
  1. **You pick stack** (A/B/C/D from 21-*) → I scaffold Phase 0 monorepo (packages/lokma-core+ai+shared+web + themes + agents/archify/design/testing/bots/setup scaffolds + `.agentlocks`/worktrees/personas)
  2. Phase 1: core loop + chat + providers/models/sessions/usage + skills/memory + **agents MVP + self-spawn (1.5) + archify/design/testing/bots stubs**
  3. Phase 2: MCP+hooks+skills+plugins+git+terminal+browser + **memory deep+vault graph + agents parallel+safe+communication+orchestration + archify/design/testing/bots deep + panes v2**
  4. Phase 3: themes+sharing+cloud + **extras (marketplace, cron per agent, approvals, observability, handoff, browser per agent, adversarial review, … 23 ranked)** + mobile+perf+a11y

---
*Bu dosya otomatik yönetilir. Elle silme.*
