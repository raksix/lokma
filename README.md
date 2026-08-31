# Lokma

> Claude Code birebir klonu — agentic coding harness (CLI + Web + Desktop)

**Lokma**, [Claude Code](https://github.com/anthropics/claude-code) (Anthropic) birebir aynı harness'ının açık kaynak yeniden implementasyonudur. Terminal'de yaşar, codebase'i anlar, natural language ile kod yazar — OMP ([oh-my-pi](https://github.com/can1357/oh-my-pi)) esintili temalarla.

## Yüzeyler

| Yüzey | Durum | Açıklama |
|-------|-------|----------|
| **CLI** | 🔨 Yapım aşamasında | Terminal harness — Claude Code ile aynı loop |
| **Web** | 🔨 Yapım aşamasında | Browser harness — `claude.ai/code` benzeri |
| **Desktop** | 📋 Sonra | Electron/Tauri app |

## Dokümantasyon

Tüm araştırma ve mimari `Docs/` klasöründe:

- [`Docs/10-ARASTIRMA-claude-code-birebir-analiz.md`](Docs/10-ARASTIRMA-claude-code-birebir-analiz.md) — Claude Code tüm özellik envanteri
- [`Docs/11-ARASTIRMA-omp-temalar-ve-tasarim.md`](Docs/11-ARASTIRMA-omp-temalar-ve-tasarim.md) — OMP tema sistemi
- [`Docs/12-HARNESS-MIMARI-cli-web-nasil-kurulur.md`](Docs/12-HARNESS-MIMARI-cli-web-nasil-kurulur.md) — CLI + Web harness nasıl inşa edilir
- [`Docs/raw/`](Docs/raw/) — Ham araştırma verileri (2070 satır)

## Hızlı Başlangıç (yakında)

```bash
curl -fsSL https://lokma.sh/install | sh
lokma "explain this codebase"
```

## Lisans

MIT
