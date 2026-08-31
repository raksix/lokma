# LOKMA — Ana Kontekst Dosyası

> **Bu dosya HER PROMPT'TA okunacak ve güncellenecek.**
> Hermes buraya bakar, buradan devam eder. Tek gerçek kaynak bu.

## Proje Kimliği
- **Ad:** Lokma
- **Klasör:** `/mnt/apopic/lokma`
- **Durum:** 2026-08-31 — Docs ultra-detailed: agent system (30) + skills/memory/vault (27-29) + config (26)
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
| `02-TEKNIK-KARARLAR.md` | Stack + arch decisions (pending pick, 7 fixed rows + 3 new) | ✅ 02-30 synced |
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

## Bekleyen Sorular (Furkan'a)
- [x] GitHub repo: `raksix/lokma` PUBLIC — done 2026-08-31
- [x] İlk provider multi-provider (Anthropic + OpenAI/DeepSeek/Google/Ollama/OpenRouter) — specced
- [ ] **Stack decision:** Pick **A (Next.js+Fastify+flexlayout, recommended) / B (SvelteKit+Hono) / C (custom panes) / D (NestJS)** — see `21-WEB-STACK-alternatives.md` §9. Blocks Phase 0 scaffold.
- [ ] Domain: `lokma.fermag.com.tr` mi `lokma.sh` mi?
- [ ] Desktop: Electron mu Tauri mi? (Phase 3)
- [ ] Lisans: MIT mi private mi?

## Son Durum
- **Son güncelleme:** 2026-08-31 02:15 UTC
- **Son işlem:** Ultra-detailed agent system — `30-AGENT-SYSTEM-personality-memory-orchestration-collision.md` (40KB, 15 sections, 23 extras) + 27-29 (skills+memory+vault) + expanded `03-YOL-HARITASI.md` (32KB, Phases 0–3 with agents in 1/1.5/2/2.5 + extras 3) + `25-WEB-ROADMAP.md` (14KB) + `02-TEKNIK-KARARLAR.md` (7 new rows) + `Docs/README.md` (37 files, ~140KB synth + ~900KB raw). 7 subagents total (3 hermes 463s + 4 agent 182s), 6012 lines raw synthesized. **Next commit:** `docs: agent system + roadmap ultra-detailed (30 + 27-29 + 03/25/02/README/00)` — push to `raksix/lokma`.
- **Sıradaki adım:**
  1. **You pick stack** (A/B/C/D from 21-*) → I scaffold Phase 0 monorepo (packages/lokma-core+ai+shared+web + themes + agents scaffolds + `.agentlocks`/worktrees/personas)
  2. Phase 1: core loop + chat + providers/models/sessions/usage + skills/memory + **agents MVP + self-spawn (1.5)**
  3. Phase 2: MCP+hooks+skills+plugins+git+terminal+browser + **memory deep+vault graph + agents parallel+safe+communication+orchestration + panes v2**
  4. Phase 3: themes+sharing+cloud + **extras (marketplace, cron per agent, approvals, observability, handoff, browser per agent, adversarial review, … 23 ranked)** + mobile+perf+a11y

---
*Bu dosya otomatik yönetilir. Elle silme.*
