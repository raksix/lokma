# LOKMA — Ana Kontekst Dosyası

> **Bu dosya HER PROMPT'TA okunacak ve güncellenecek.**
> Hermes buraya bakar, buradan devam eder. Tek gerçek kaynak bu.

## Proje Kimliği
- **Ad:** Lokma
- **Klasör:** `/mnt/apopic/lokma`
- **Durum:** 2026-08-31 — Araştırma Fazı tamamlandı, harness mimarisi dokümante edildi
- **Tip:** Claude Code birebir klonu — Agentic Coding Harness (CLI + Web)
- **Repo:** `/mnt/apopic/lokma` (git init yapıldı, GitHub remote henüz yok)

## Kurallar (Furkan'ın İstekleri)
1. `Docs/` klasörü tek kaynak — sana dediğim her şey oraya atılacak
2. Bir şey yaparken **ÖNCE** `Docs/` içini oku, ona göre işlem yap
3. Bu dosya (`00-LOKMA-KONTEKST.md`) her prompt'ta güncellenir — zamanla büyür
4. Her değişiklikte İngilizce commit mesajı ile otomatik push at
5. Her şey memory.fermag.com.tr'ye de kaydedilsin (https://memory.fermag.com.tr)
6. Türkçe konuş, commit'ler İngilizce

## Proje Hakkında Ne Biliyoruz
- **Lokma nedir:** Claude Code'un birebir aynı harness'ının yeniden implementasyonu
  - CLI tarafı: terminalde agentic coding (claude-code gibi)
  - Web harness: Claude Code'un tüm özellikleriyle çalışan browser harness'ı (claude.ai/code gibi)
  - Desktop app: sonra yapılacak (şu an değil)
- **Görünüş:** Claude Code'a benzer ama OMP (https://omp.sh / https://github.com/can1357/oh-my-pi) gibi temalar olacak
- **OMP nedir:** Oh My Pi — "coding agent with the IDE wired in", 28.5k ⭐, 80k Rust core, 60+ provider, 31 tools. Pi fork'u. Lokma temaları OMP estetiğinden ilham alacak.
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

### 2026-08-31 — Araştırma Fazı (Claude Code Harness)
- Furkan: "amac şu. https://github.com/anthropics/claude-code bunu birebir baştan yapmak için döküman hazırla tüm özellikler falan olacak. görünüş de benzer olabilir ama omp gibi temalar olacak (https://omp.sh). CLI tarafı + web harness aynı şekilde claude code tüm özellikleriyle çalışacak. desktop sonra. Şu anlık sadece CLI + Web harness nasıl yapılır onu araştır, Docs içine kaydet."
- Hermes: 3 paralel araştırma subagent'ı dispatch edildi + doğrudan web_extract ile claude docs / OMP repo scrape edildi.
  - Subagent'lar: claude-code-features, omp-themes, harness-architecture (deleg_f88f44d7)
  - Doğrudan çekilenler: code.claude.com/docs (overview, how-it-works, cli-reference, tools, mcp, agent-sdk), github.com/can1357/oh-my-pi
  - Üretilen Docs: 10, 11, 12 (toplam ~43KB detaylı doküman)
  - Bekleyen: 2 subagent hala çalışıyor, ham verileri gelince Docs zenginleştirilecek

## Bekleyen Sorular (Furkan'a)
- [ ] GitHub repo oluşturulsun mu? `raksix/lokma` private?
- [ ] Domain: `lokma.fermag.com.tr` mi `lokma.sh` mi?
- [ ] İlk provider sadece Anthropic mi multi-provider mı?
- [ ] Web hosting 67 makinesi uygun mu?
- [ ] Desktop: Electron mu Tauri mi?
- [ ] Lisans: MIT mi private mi?

## Son Durum
- **Son güncelleme:** 2026-08-31 01:23 UTC
- **Son işlem:** Araştırma dokümanları (10/11/12) oluşturuldu, subagent'lar devam ediyor
- **Sıradaki adım:**
  1. Subagent ham verileri gelince Docs'u zenginleştir
  2. Furkan onay verince Faz 0 scaffold: `packages/lokma-*` monorepo + `lokma --help` çalışır iskelet
  3. GitHub repo oluştur + ilk push

---
*Bu dosya otomatik yönetilir. Elle silme.*
