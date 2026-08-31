# Lokma

> **Yenilikçi agentic coding harness — terminal'de, web'de, her yerde.**

**Lokma**, [Claude Code](https://github.com/anthropics/claude-code) ve [OMP (oh-my-pi)](https://github.com/can1357/oh-my-pi) gibi öncü harness'ların en iyi fikirlerini alıp bir adım öteye taşıyan, **multi-provider, tema destekli, açık kaynak** bir coding agent harness'ıdır.

Claude Code'un agentic loop felsefesinden ilham alır — ama birebir klon değildir. OMP'nin benchmaxxed tooling yaklaşımı, hashline edit verimliliği ve native performans vizyonunu harmanlar; üzerine **kendi yeniliklerini** ekler: akıllı provider routing, canlı tema sistemi, web + CLI'ı tek bir harness'ta birleştiren hibrit mimari ve topluluk odaklı eklenti ekosistemi.

## ✨ Neden Lokma?

- **🧠 Akıllı Harness, Değişen Model** — Model ne olursa olsun (Claude, GPT, DeepSeek, Gemini, local LLM) aynı harness aynı kalitede çalışır. Tool formatı, edit stratejisi ve context yönetimi modelden bağımsız optimize edilmiştir.
- **🎨 Tema Desteği (OMP Esintili)** — CLI ve Web aynı tema token'larını paylaşır. `lokma theme set omp` ile koyu terminal estetiği, `lokma theme set claude` ile krem/terracotta ferahlığı — ve topluluk temaları.
- **🌐 CLI + Web Hibrit** — Terminal'de `lokma` ile başla, tarayıcıdan devam et. Aynı session, aynı loop, aynı context. Kod local'de kalır veya cloud sandbox'ta koşar — sen seçersin.
- **🔌 Gerçek Entegrasyon** — LSP ile IDE'nin bildiğini bilir (rename → barrel update), DAP ile debugger'a bağlanır, MCP ile Notion/Jira/Postgres'e dokunur, GitHub'da `@lokma` ile PR açar.
- **⚡ Hız ve Verim** — Hashline edit ile %60 daha az token, ripgrep ile anında arama, in-process tooling ile fork'suz hız. Her tool benchmaxxed.
- **🔓 Açık ve Genişletilebilir** — MIT lisans, plugin marketplace, custom slash commands, hooks, skills. Kendi workflow'unu paketle, paylaş.

## Yüzeyler

| Yüzey | Durum | Açıklama |
|-------|-------|----------|
| **CLI** | 🔨 Yapım aşamasında | Terminal harness — agentic loop'un kalbi, Ink TUI |
| **Web** | 🔨 Yapım aşamasında | Browser harness — hibrit (local + cloud), real-time streaming |
| **Desktop** | 📋 Sonra | Native app (visual diff, multi-session, drag-drop) |

## Dokümantasyon

Tüm araştırma ve mimari `Docs/` klasöründe:

- [`Docs/10-ARASTIRMA-claude-code-birebir-analiz.md`](Docs/10-ARASTIRMA-claude-code-birebir-analiz.md) — Claude Code özellik analizi (ilham kaynağı)
- [`Docs/11-ARASTIRMA-omp-temalar-ve-tasarim.md`](Docs/11-ARASTIRMA-omp-temalar-ve-tasarim.md) — OMP tema sistemi & tasarım dili
- [`Docs/12-HARNESS-MIMARI-cli-web-nasil-kurulur.md`](Docs/12-HARNESS-MIMARI-cli-web-nasil-kurulur.md) — Lokma harness mimarisi (CLI + Web)
- [`Docs/raw/`](Docs/raw/) — Ham araştırma verileri (2070 satır)

## Hızlı Başlangıç (yakında)

```bash
curl -fsSL https://lokma.sh/install | sh
lokma "explain this codebase"
lokma theme set omp
```

## Felsefe

> *Model akıl yürütür, harness harekete geçirir. İyi bir harness zayıf bir modeli bile faydalı kılar — kötü bir harness en iyi modeli bile boşa harcar.*

Lokma, bu felsefeyi merkeze alarak inşa ediliyor: en iyi model + en iyi harness = en iyi sonuç.

## Lisans

MIT — açık kaynak, topluluk odaklı.
