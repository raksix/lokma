# LOKMA — Ana Kontekst Dosyası

> **Bu dosya HER PROMPT'TA okunacak ve güncellenecek.**
> Hermes buraya bakar, buradan devam eder. Tek gerçek kaynak bu.

## Proje Kimliği
- **Ad:** Lokma
- **Klasör:** `/mnt/apopic/lokma`
- **Durum:** 2026-08-31 — Web harness docs done, GitHub branding updated
- **Tip:** Innovative Agentic Coding Harness (CLI + Web) — open-source, multi-provider, themeable
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
| `00-LOKMA-KONTEKST.md` | Bu dosya — ana hafıza | ✅ Güncel |
| `01-PROJE-TANIMI.md` | Lokma tanımı (innovative harness, English) | ✅ |
| `02-TEKNIK-KARARLAR.md` | Stack kararları (pending pick) | ⏳ Stack pick pending |
| `03-YOL-HARITASI.md` | Roadmap (Phases 0-3) | ✅ |
| `10-ARASTIRMA-claude-code-birebir-analiz.md` | Claude Code tüm özellik envanteri (CLI, tools, permissions, hooks, MCP, sessions) | ✅ 18KB |
| `11-ARASTIRMA-omp-temalar-ve-tasarim.md` | OMP tema sistemi + görsel dil + Lokma tema tasarımı | ✅ 7.6KB |
| `12-HARNESS-MIMARI-cli-web-nasil-kurulur.md` | CLI+Web harness nasıl inşa edilir (katmanlar, loop, WS, provider) | ✅ 17KB |
| `13-ARASTIRMA-ozet-ve-sonraki-adimlar.md` | Özet + Faz 0 planı | ✅ 3.3KB |
| `20-WEB-HARNESS-overview.md` | Web harness overview — why, principles, parity, arch (EN) | ✅ 6.4KB |
| `21-WEB-STACK-alternatives.md` | Stack decision matrix — frontend/backend/pane/state/realtime (EN) | ✅ 9.8KB |
| `22-WEB-FEATURES-provider-model-session.md` | Provider/model/session/usage + full Claude Code parity spec (EN) | ✅ 13KB |
| `23-PLUGIN-SYSTEM-deepseek-cordis.md` | Plugin system — DeepSeek Cordis inspiration + Lokma kernel (EN) | ✅ 9.4KB |
| `24-WEB-PANE-SYSTEM-and-orchestration.md` | Pane system, sidebars, file browser, live logs, browser, orchestration (EN) | ✅ 12KB |
| `25-WEB-ROADMAP.md` | Phased roadmap (0 scaffold → 1 core loop → 2 parity → 3 polish) (EN) | ✅ 7.6KB |
| `99-NOTLAR.md` | Hızlı notlar | ✅ |
| `README.md` | Docs index | ✅ |
| `raw/10-claude-code-ham-arastirma.md` | Ham: Claude Code 957 lines, 53KB | ✅ |
| `raw/11-omp-ham-arastirma.md` | Ham: OMP 360 lines, 30KB | ✅ |
| `raw/12-harness-ham-arastirma.md` | Ham: Harness 753 lines, 41KB | ✅ |
| `raw/21-web-stack-ham-arastirma.md` | Ham: Web stack 712 lines, 60KB | ✅ |
| `raw/22-web-features-ham-arastirma.md` | Ham: Web features 1068 lines, 61KB | ✅ |
| `raw/23-dsh-plugin-ham-arastirma.md` | Ham: DSH Cordis plugin 1146 lines, 74KB | ✅ |

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

## Bekleyen Sorular (Furkan'a)
- [x] GitHub repo: `raksix/lokma` PUBLIC — done 2026-08-31
- [x] İlk provider multi-provider (Anthropic + OpenAI/DeepSeek/Google/Ollama/OpenRouter) — specced
- [ ] **Stack decision:** Pick **A (Next.js+Fastify+flexlayout, recommended) / B (SvelteKit+Hono) / C (custom panes) / D (NestJS)** — see `21-WEB-STACK-alternatives.md` §9. Blocks Phase 0 scaffold.
- [ ] Domain: `lokma.fermag.com.tr` mi `lokma.sh` mi?
- [ ] Desktop: Electron mu Tauri mi? (Phase 3)
- [ ] Lisans: MIT mi private mi?

## Son Durum
- **Son güncelleme:** 2026-08-31 02:00 UTC
- **Son işlem:** Config hierarchy refactor — `26-CONFIG-and-CREDENTIALS.md` (EN, 8KB) + 02/03 updates; keys in `~/.lokma/credentials.json` (encrypted 0600) layered like Claude Code `config.json`/`settings.json`. Commit 0d889aa. **In-flight:** hermes-agent research fan-out (3 subagents: auto-skill discovery, infinite memory, Obsidian MCP vault+graph — repos/docs scraping, ~1200 lines raw expected) — will land as `Docs/30-*` set + roadmap auto-append when done.
- **Sıradaki adım:**
  1. **You pick stack** (A/B/C/D from 21-*) → I scaffold Phase 0 monorepo
  2. Phase 1: core loop in browser (WS streaming, chat, providers/models/sessions/usage)
  3. Phase 2: full parity (MCP/permissions/hooks/skills/plugins/git/terminal/browser/orchestration)
  4. Phase 3: themes, cloud, sharing, polish

---
*Bu dosya otomatik yönetilir. Elle silme.*
