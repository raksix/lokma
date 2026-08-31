# Araştırma Özeti & Sonraki Adımlar

> Tüm araştırmalar 2026-08-31'de tamamlandı. 3 paralel subagent + doğrudan scrape ile 2070 satır ham veri + 43KB sentez döküman üretildi.

## Ne Üretildi

| Dosya | Satır | Boyut | İçerik |
|-------|-------|-------|--------|
| `10-ARASTIRMA-claude-code-birebir-analiz.md` | ~620 | 18KB | Sentez: CLI/slash/tools/permissions/memory/hooks/plugins/MCP/subagents/git/sessions |
| `raw/10-claude-code-ham-arastirma.md` | 957 | 53KB | Ham: 15+ kaynak, 14 bölüm, 19 kaynakça |
| `11-ARASTIRMA-omp-temalar-ve-tasarim.md` | ~280 | 7.6KB | Sentez: OMP tema sistemi + 4 tema tasarımı |
| `raw/11-omp-ham-arastirma.md` | 360 | 30KB | Ham: 7 kaynak, 7 bölüm, titanium.json örneği |
| `12-HARNESS-MIMARI-cli-web-nasil-kurulur.md` | ~620 | 17KB | Sentez: Katmanlar, loop, WS/SSE, provider, faz planı |
| `raw/12-harness-ham-arastirma.md` | 753 | 41KB | Ham: 9 bileşen, CLI/Web detay, sandbox matrix, 18 kaynakça |

**Toplam:** 6 dosya, ~3500 satır, ~167KB dokümantasyon

## Ham Veriler Ne İçeriyor (Özet)

### Claude Code Ham (957 satır)
- Launch timeline, Unix philosophy, Constitutional AI felsefesi
- 30+ `claude` binary komutu + 40+ flag + 100+ slash komut tablo
- 40+ built-in tool (Read/Write/Edit/Bash/Grep/LSP/Agent/Monitor...) permission matrisi
- Auto/manual/acceptEdits/plan/bypass permission modları + classifier
- CLAUDE.md hierarchy + auto memory (200 satır/25KB) + compaction
- 8 hook event + plugin marketplace + MCP 4 transport + GitHub Actions + IDE (VS Code/JetBrains)

### OMP Ham (360 satır)
- Harness problem manifestosu (10x fark), benchmaxxed tool metrikleri
- 60+ provider, 31 tool, 80k Rust core, brush shell, native Windows
- LSP 14 op + DAP + hashline (-61% tokens) + time-traveling rules + advisor model
- Theme system: schema, loading, 40+ tema (titanium.json örneği), dark-catppuccin vs
- Monorepo: 15 package + 8 Rust crate, collab-web, hashline crate

### Harness Ham (753 satır)
- 9 bileşenli harness tanımı (model interface → orchestration)
- CLI: Ink/React (Yoga), generator backpressure, tool registry, brush Python REPL
- Web: Remote Control vs Cloud VM, Fastify WS + Next.js + xterm.js, SSE 3-tier buffer
- Agent loop: query.ts 1730 satır analizi, compaction, tool calling JSON schema
- Sandbox: Docker/gVisor/Firecracker matrix (<125ms boot), E2B/Modal/Daytona
- 18 kaynakça (Claude Docs, OpenHands, Aider, Continue, Ink, Firecracker...)

## Sıradaki Adımlar — Faz 0 Scaffold

1. **GitHub repo oluştur:** `raksix/lokma` (private)
2. **Monorepo scaffold:**
   ```
   lokma/
   ├── packages/
   │   ├── lokma-core   # agent loop + tools + session
   │   ├── lokma-ai     # multi-provider
   │   ├── lokma-tui    # Ink
   │   ├── lokma-web    # Fastify + Next.js
   │   └── lokma-shared # zod schemas
   ├── themes/          # 4 tema JSON
   └── Docs/            # burası
   ```
3. **İskelet:** `lokma --help` ve `lokma -p "hello"` mock stream çalışır
4. **Commit + push**

## Karar Bekleyenler
- GitHub repo adı/onayı
- Domain (lokma.fermag.com.tr vs lokma.sh)
- İlk provider seti
- Desktop tercihi

---
*Ham veriler `Docs/raw/` altında, sentezler `Docs/10-12` içinde. Her şey her prompt'ta okunacak.*
