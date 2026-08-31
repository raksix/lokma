# 01 — Proje Tanımı: Lokma

> Yenilikçi agentic coding harness — Claude Code ve OMP'den ilham alan, kendi yolunu çizen.

## Lokma Nedir?

**Lokma**, kodla konuşarak iş yaptırdığın **yenilikçi bir agentic harness**.

Claude Code'un agentic loop felsefesi ve OMP'nin benchmaxxed tooling vizyonundan ilham alır — ama birebir klon değildir. En iyi fikirleri harmanlayıp üzerine **kendi yeniliklerini** ekler: akıllı provider routing, canlı tema sistemi, CLI + Web'i tek harness'ta birleştiren hibrit mimari ve topluluk eklenti ekosistemi.

Terminal'de `lokma "fix the auth bug"` dersin — o codebase'i okur, test eder, düzeltir, commit'ler. Web'den devam etmek istersen aynı session'ı tarayıcıdan açarsın. Kod local'de kalır veya cloud sandbox'ta koşar — sen seçersin.

## Problem

- Mevcut AI coding tool'ları ya sadece autocomplete (Copilot) ya da tek provider'a kilitli (Claude Code sadece Anthropic)
- Harness kalitesi sonucu 10 kata kadar değiştirir — ama çoğu harness'ta tool formatı ve edit stratejisi optimize edilmemiş (OMP'nin "harness problem" dediği şey)
- CLI ve Web ayrı dünyalar — session'lar taşınamıyor, context kayboluyor
- Tema/kişiselleştirme yok — herkes aynı görünümü kullanmak zorunda

## Çözüm

Lokma bu dört soruna tek bir harness'ta cevap verir:

1. **Model bağımsız harness** — Anthropic, OpenAI, DeepSeek, Gemini, Ollama... hepsi aynı loop'ta, aynı kalitede. Model değişir, harness baki.
2. **Benchmaxxed tooling** — Hashline edit (%60 az token), in-process ripgrep, LSP/DAP entegrasyonu — her tool en hızlı, en isabetli haliyle.
3. **Hibrit CLI + Web** — Aynı agent loop, iki yüzey. `lokma` terminal'de, `lokma web` tarayıcıda — session'lar arası geçiş kayıpsız.
4. **Canlı tema sistemi** — `lokma theme set omp` ile koyu terminal, `claude` ile ferah krem — CLI ve Web aynı token'ları paylaşır.

## Hedef Kullanıcı

- Günlük kod yazan geliştiriciler (freelance, startup, ekip)
- Terminal'i seven ama web'den de çalışmak isteyenler
- Farklı LLM provider'ları denemek isteyenler (maliyet/performans trade-off)
- Kendi workflow'unu eklentiye dönüştürmek isteyen ekipler

## Temel Özellikler

| Özellik | Açıklama |
|---------|----------|
| **Agentic Loop** | Model → tool → sonuç → tekrar model, generator tabanlı backpressure |
| **Multi-provider** | Anthropic / OpenAI / DeepSeek / Google / Ollama / OpenRouter |
| **Temalar** | 4 built-in (claude/omp/midnight/paper) + topluluk temaları |
| **LSP/DAP** | IDE'nin bildiğini bilir, debugger'a bağlanır |
| **MCP** | Notion, Jira, Postgres, GitHub — her şey bağlanır |
| **Git Native** | `lokma "commit"` → stage + message + PR, `@lokma` mention |
| **Session** | JSONL transcript, checkpoint, resume/fork, worktree izolasyon |
| **Hooks/Skills/Plugins** | `PostToolUse: prettier`, `/review`, marketplace |

## İlham / Benzerler

| Proje | Alınan İlham | Fark |
|-------|--------------|------|
| **Claude Code** (Anthropic) | Agentic loop, permission system, hooks, MCP, session model | Lokma multi-provider, klon değil evrim |
| **OMP** (oh-my-pi) | Benchmaxxed tooling, hashline, native perf, tema sistemi | Lokma Hibrit CLI+Web, OMP sadece CLI |
| **OpenHands** | Cloud sandbox, Docker izolasyon | Lokma hibrit (local-first + cloud opsiyonel) |
| **Aider** | Git-aware edit, repo map | Lokma full agentic, tek dosya değil tüm codebase |

## Vizyon

> *Bir lokma kod, bir lokma zeka — gerisini harness halleder.*

Lokma, en iyi model + en iyi harness kombinasyonunu herkes için erişilebilir kılmak için var.

---
*Durum: Tanımlandı — 2026-08-31 güncellendi (yenilikçi harness konumlandırması)*
