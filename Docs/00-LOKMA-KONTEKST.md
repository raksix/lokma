# LOKMA — Ana Kontekst Dosyası

> **Bu dosya HER PROMPT'TA okunacak ve güncellenecek.**
> Hermes buraya bakar, buradan devam eder. Tek gerçek kaynak bu.

## Proje Kimliği
- **Ad:** Lokma
- **Klasör:** `/mnt/apopic/lokma`
- **Durum:** 2026-08-31 — Araştırma tamamlandı, GitHub public repo oluşturuldu
- **Tip:** Yenilikçi Agentic Coding Harness (CLI + Web) — Claude Code ve OMP'den ilham alan, kendi yeniliklerini ekleyen açık kaynak harness
- **Repo:** `https://github.com/raksix/lokma` (PUBLIC, main branch)

## Kurallar (Furkan'ın İstekleri)
1. `Docs/` klasörü tek kaynak — sana dediğim her şey oraya atılacak
2. Bir şey yaparken **ÖNCE** `Docs/` içini oku, ona göre işlem yap
3. Bu dosya (`00-LOKMA-KONTEKST.md`) her prompt'ta güncellenir — zamanla büyür
4. Her değişiklikte İngilizce commit mesajı ile otomatik push at
5. Her şey memory.fermag.com.tr'ye de kaydedilsin (https://memory.fermag.com.tr)
6. Türkçe konuş, commit'ler İngilizce

## Proje Hakkında Ne Biliyoruz
- **Lokma nedir:** Yenilikçi agentic coding harness — Claude Code ve OMP'den ilham alan ama **birebir klon değil, kendi yeniliklerini ekleyen** açık kaynak harness
  - CLI: terminalde agentic coding — OMP'nin benchmaxxed tooling'i + Claude Code'un loop felsefesi + Lokma'nın akıllı provider routing'i ve tema sistemi
  - Web harness: hibrit (local + cloud sandbox) browser harness — real-time streaming, aynı loop'u paylaşır
  - Desktop app: sonra yapılacak (şu an değil)
- **Farkı ne:** Birebir klon değil — *model akıl yürütür, harness harekete geçirir* felsefesini merkeze alıp; hashline edit, in-process tooling, LSP/DAP entegrasyonu gibi en iyi fikirleri harmanlayıp üzerine akıllı provider routing, canlı tema sistemi, CLI+Web hibrit mimari ve eklenti ekosistemi ekler
- **Görünüş:** OMP gibi temalar olacak — `lokma theme set omp` / `claude` / `midnight` / `paper`
- **OMP nedir:** Oh My Pi — "coding agent with the IDE wired in", 28.5k ⭐, 80k Rust core, 60+ provider — referans alınan öncü proje
- **Teknoloji (planlanan):**
  - Monorepo: `packages/lokma-core` (agent loop) + `lokma-ai` (multi-provider) + `lokma-tui` (Ink) + `lokma-web` (Next.js + WS) + `lokma-cli`
  - Provider: Anthropic (primary) + OpenAI/DeepSeek/Google/Ollama/OpenRouter
  - Theme: `themes/*.json` → CLI (Chalk) + Web (CSS vars) ortak token

## Docs Envanteri (2026-08-31)
| Dosya | Açıklama | Durum |
|-------|----------|-------|
| `00-LOKMA-KONTEKST.md` | Bu dosya — ana hafıza | ✅ Güncel |
| `01-PROJE-TANIMI.md` | Lokma tanımı (boş, doldurulacak) | ⏳ |
| `02-TEKNIK-KARARLAR.md` | Stack kararları | ⏳ |
| `03-YOL-HARITASI.md` | Roadmap | ⏳ |
| `10-ARASTIRMA-claude-code-birebir-analiz.md` | Claude Code tüm özellik envanteri (CLI, tools, permissions, hooks, MCP, sessions) | ✅ 18KB, tamamlandı |
| `11-ARASTIRMA-omp-temalar-ve-tasarim.md` | OMP tema sistemi + görsel dil + Lokma tema tasarımı | ✅ 7.6KB, tamamlandı |
| `12-HARNESS-MIMARI-cli-web-nasil-kurulur.md` | CLI+Web harness nasıl inşa edilir (katmanlar, loop, WS, provider) | ✅ 17KB, tamamlandı |
| `99-NOTLAR.md` | Hızlı notlar | ✅ |
| `README.md` | Docs index | ✅ |

## Konuşma Geçmişi (Kronolojik)
### 2026-08-31 — Kurulum
- Furkan: "selam bu projenin adı lokma. her prompta uyabileceğin bir dosya oluştur zamanla güncellesin. Docs diye klasör oluştur sana dediğim şeyleri oraya atacaksın. bir şey yaparken docs klasöründen okuyup bak tamam mı"
- Hermes: Docs/ klasörü + bu dosya oluşturuldu. Sistem kuruldu.

### 2026-08-31 — Araştırma Fazı (Harness)
- Furkan: "Claude Code'u birebir baştan yapmak için döküman hazırla, OMP gibi temalar olacak. CLI + web harness aynı özelliklerle çalışacak. Desktop sonra."
- Hermes: 3 paralel subagent + doğrudan scrape (code.claude.com, github.com/can1357/oh-my-pi). Sentez: 10/11/12 + ham raw/ (2070 satır)
- **Düzeltme (Furkan):** "birebir clone demek doğru olmaz, yenilikçi harness olsun, ballandır orda" → README + kontekst güncellendi: Lokma artık **ilham alan yenilikçi harness** olarak konumlanıyor, klon değil.

## Bekleyen Sorular (Furkan'a)
- [ ] GitHub repo oluşturulsun mu? `raksix/lokma` private?
- [ ] Domain: `lokma.fermag.com.tr` mi `lokma.sh` mi?
- [ ] İlk provider sadece Anthropic mi multi-provider mı?
- [ ] Web hosting 67 makinesi uygun mu?
- [ ] Desktop: Electron mu Tauri mi?
- [ ] Lisans: MIT mi private mi?

## Son Durum
- **Son güncelleme:** 2026-08-31 01:30 UTC
- **Son işlem:** `.gitignore` genişletildi (env/secrets/build/OS/IDE/cache) + `.env.example` eklendi, commit af2217a push'landı
- **Sıradaki adım:**
  1. Faz 0 scaffold: `packages/lokma-*` monorepo + `lokma --help` iskelet
  2. CLI MVP (lokma-core + lokma-ai + Ink TUI)

---
*Bu dosya otomatik yönetilir. Elle silme.*
