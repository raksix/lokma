# Docs — Lokma Documentation

> **Single source of truth.** Hermes reads here before every task. English from 2026-08-31 01:45 (chat stays Turkish).

## File Index

| File | What | Status |
|------|------|--------|
| `00-LOKMA-KONTEKST.md` | **MAIN FILE** — read & update every prompt | ✅ |
| `01-PROJE-TANIMI.md` | What Lokma is (innovative harness) | ✅ |
| `02-TEKNIK-KARARLAR.md` | Stack & architecture decisions | ⏳ Stack pick pending |
| `03-YOL-HARITASI.md` | Roadmap (Phases 0-3) | ✅ |
| `10-ARASTIRMA-claude-code-birebir-analiz.md` | Claude Code full inventory (18KB) | ✅ |
| `11-ARASTIRMA-omp-temalar-ve-tasarim.md` | OMP themes & design language (7.6KB) | ✅ |
| `12-HARNESS-MIMARI-cli-web-nasil-kurulur.md` | CLI+Web harness architecture (17KB) | ✅ |
| `13-ARASTIRMA-ozet-ve-sonraki-adimlar.md` | Synthesis + Phase 0 plan (3.3KB) | ✅ |
| `20-WEB-HARNESS-overview.md` | **Web harness overview** — why/principles/parity/arch | ✅ EN 6.4KB |
| `21-WEB-STACK-alternatives.md` | **Stack decision matrix** — frontend/backend/pane/state/realtime | ✅ EN 9.8KB — **PICK A/B/C/D** |
| `22-WEB-FEATURES-provider-model-session.md` | **Provider/model/session/usage** + parity checklist | ✅ EN 13KB |
| `23-PLUGIN-SYSTEM-deepseek-cordis.md` | **Plugin system** — DeepSeek Cordis + Lokma kernel | ✅ EN 9.4KB |
| `24-WEB-PANE-SYSTEM-and-orchestration.md` | **Pane system** — sidebars, browser, live logs, orchestration | ✅ EN 12KB |
| `25-WEB-ROADMAP.md` | **Roadmap** — Phases 0→3 (scaffold → loop → parity → polish) | ✅ EN 7.6KB |
| `raw/10-claude-code-ham-arastirma.md` | Raw: Claude Code 957 lines, 53KB | ✅ |
| `raw/11-omp-ham-arastirma.md` | Raw: OMP 360 lines, 30KB | ✅ |
| `raw/12-harness-ham-arastirma.md` | Raw: Harness 753 lines, 41KB | ✅ |
| `raw/21-web-stack-ham-arastirma.md` | Raw: Web stack 712 lines, 60KB | ✅ |
| `raw/22-web-features-ham-arastirma.md` | Raw: Web features 1068 lines, 61KB | ✅ |
| `raw/23-dsh-plugin-ham-arastirma.md` | Raw: DSH Cordis plugin 1146 lines, 74KB | ✅ |
| `99-NOTLAR.md` | Scratch notes | ✅ |

**Total:** 16 synthesized docs (~62KB) + 6 raw (~392KB/4996 lines) + 3 system docs = **~25 files**

## Workflow

1. Furkan says something → Hermes reads `00-LOKMA-KONTEKST.md` first
2. Hermes does work → writes/updates the relevant `Docs/` file(s) (English)
3. Updates `00-LOKMA-KONTEKST.md` (chronology + last status)
4. Commit + push (English message) — auto
5. Sync to memory.fermag.com.tr

## Status

- **Created:** 2026-08-31
- **Research:** ✅ Complete (Claude Code + OMP + harness + web harness)
- **Web harness docs:** ✅ Complete (20-25, English) — awaiting stack pick
- **Next:** Pick stack (21-*) → Scaffold Phase 0 monorepo
