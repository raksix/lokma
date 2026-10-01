# REQ-181 — UI'daki her yüzey ajanın aracı olsun (harness aracı katalogu)

**Status:** in-progress (2026-10-01) — tick 2: surface catalog + gate derivation landed; rail wiring, prompt block and tool families follow
**Tarih:** 2026-10-01
**Kaynak:** Kullanıcı mesajı (1 Ekim 2026):
> "Lokmada uida ben ne yapabiliyorsam onları direkt lokmanın harnessi de mcp ya da skill olarak kullanbilecek.

direkt açabilcek yani."

**İlişkiler:** [REQ-180](REQ-180-proje-ac-araci.md) (bu dalganın ilk adımı: "proje aç" aracı) · [REQ-182](REQ-182-proje-ac-ui-aksiyonu.md) (proje modalının ajan-çağrılabilir olması). Bu REQ dalganın **omurgası**: 180 tek yüzeyi açar, 182 onu UI'da görünür kılar, 181 kuralı genelleştirip kalan yüzeylere yayılır.

## Bugünkü durum (kanıt)

1. **Ajanın gördüğü UI ile ajanın yaptıkları arasında 25 yüzeylik uçurum var.** Rail tablosu (`packages/lokma-web/web/src/components/shell/inspector-rail.tsx:77-106`) şu yüzeyleri listeliyor: `files`, `providers`, `models`, `usage`, `settings`, `terminal`, `git`, `browser`, `agents`, `orchestration`, `vault`, `skills`, `archify`, `testing`, `setup`, `plugins`, `observability`, `cron`, `extras`, `memory`, `todos`. ActivityBar ayrıca `sessions`, `git`, `terminal`, `browser`, `vault`, `testing`, `settings`, `account` sunuyor (`activity-bar.tsx:18-51`). Üst mod geçişi: `chat` · `bots` · `design` (`packages/lokma-web/web/src/components/bots/mode.ts:14` — `AppMode`).
2. **Ajan tarafında karşılığı olan yüzeyler sadece 4+5+2+3+1:** `open_browser`/`open_terminal`/`open_session`/`send_to_session` (`packages/lokma-core/src/tools/ui-control.ts:156`), `browser_read_page`/`browser_scroll`/`browser_click`/`browser_type`/`browser_screenshot` (`packages/lokma-core/src/tools/gate.ts:38-44`), `send_file`, `list_todos`/`claim_todo`/`complete_todo`, `ask_user`.
3. **Sunucuda yetenek var, ajana açık değil.** `packages/lokma-core/src/` altında tam bir uygulama var ve hepsinin REST ucu da mevcut: `design/` (store+generate+raster+webm, `POST /api/design/generate`), `archify/` (ir+render+store), `testing/` (store), `plugins/registry.ts` + `plugins/marketplace.ts`, `skills/registry.ts` + `curator.ts` (skill'i görüntüle/düzelt), `vault/fts.ts`, `memory/manager.ts`, `observability/trace.ts`, `cron/cron.ts`, `git/`, `usage/`, `setup/features.ts`. Bunların **hiçbiri** tool olarak ajanın registry'sine girmiyor — ajan bunlara ancak REST çağrısı yapabilse erişir, o da tool setinde yok.
4. **Katalog çift kaynaklı olmamalı.** `INSPECTOR_RAIL_ITEMS` (21 giriş) + `ACTIVITY_ITEMS` (8 giriş) + `SETTINGS_SECTIONS` (16 bölüm) + `RAIL_STANDALONE_MODALS` + `AppMode` şu an **elle** eş zamanlı tutuluyor. Yeni bir yüzey eklemek 3-4 dosyada 4 ayrı kayıt demek; bunun yerine tek bir **yüzey kataloğu** (`@lokma/shared` tarafında saf veri) üzerinden hem rail hem tool kaydı üretilmeli.
5. **Prompt katmanı eksik:** `buildSkillsSystemPrompt` (`packages/lokma-core/src/skills/prompt.ts:9`) var ama **hiçbir yerden çağrılmıyor** (yalnız kendi dist d.ts'i referans veriyor) — yani skill'ler ajanın sistem prompt'una hiç girmiyor. `buildToolSystemPrompt` da `agent-loop.ts:402`'de tek satırlık araç listesi olarak gider. Kullanıcının istediği "UI'da yapabildiğim her şeyi ajan da yapabilsin" ancak **katalog + prompt bağı** ile sağlanır.

## Kapsam

1. **Tek yüzey kataloğu** (`packages/lokma-shared/src/surfaces.ts` — saf veri, React bağımsız):
   ```ts
   export type SurfaceSurface = {
     id: 'files' | 'providers' | ... ;        // mevcut rail/tab id'leri
     label: string;
     tool?: { name: string; summary: string; gate: 'read' | 'write' | 'interactive' | 'browser' };
     opens: 'pane' | 'settings-section' | 'standalone-modal' | 'mode';
   };
   ```
   Rail listesi, activity listesi, settings bölümleri ve **tool adları** bu tablodan türetilir; mevcut `INSPECTOR_RAIL_ITEMS`/`ACTIVITY_ITEMS` **kaynak olarak korunur ama katalog onları besler** (geriye dönük testler kırılmaz — `activity-bar.test.ts`, `inspector-rail.test.ts` yeşil kalmalı).
2. **Yüzey başına tool:** aşağıdaki tablo **kapsamın çekirdeği** — her satır bir araç ailesi:

   | Yüzey | Araç(lar) | Etki |
   |---|---|---|
   | Design | `design_generate`, `design_list`, `design_critique` | `POST /api/design/generate` (cwd + model, gerçek LLM — REQ-177), `GET /api/design/list?cwd=` |
   | Archify | `archify_render` | IR → HTML/SVG/webm, `~/.lokma/archify/` |
   | Testing Lab | `testing_run` | `testing/store.ts` plan→inventory→codegen→sandbox→classify |
   | Vault/Memory | `vault_search`, `memory_write`, `memory_read` | `vault/fts.ts` FTS5, `memory/manager.ts` |
   | Skills | `skill_view`, `skill_patch` | `skills/registry.ts` (view/readSkillView, patch/curator) |
   | Observability | `trace_list`, `trace_get` | `observability/trace.ts` |
   | Cron | `cron_list`, `cron_create` | `cron/cron.ts` + approvals (`cron/approvals.ts`) |
   | Plugins | `plugin_list`, `plugin_install` | `plugins/registry.ts` |
   | Providers/Models | `provider_add`, `model_probe` | `providers/`, `models.ts` (seçili modeli gerçekten çağırıp çalıştığını doğrular) |
   | Git | `git_status`, `git_diff`, `git_commit` | `git/` (dosya araçlarının `run_command`'a kaçması yerine tip- güvenli) |
   | Usage | `usage_report` | `usage/` |
   | Terminal | `open_terminal` (var) + `terminal_write` | `terminal/terminal.ts` |
   | Files | `read_file`/`list_files`/`glob`/`grep` (var) + `file_search` | jail'li |

   **Kural:** aracın dayandığı REST ucu ya core modülü zaten varsa **o çağrılır** (DRY, ikinci implementasyon yok); yoksa araç core modülü çağırır ve uç o modülü sarar.
3. **Yetki sınıflandırması tek kaynaktan:** katalogdaki `gate` alanı → `packages/lokma-core/src/tools/gate.ts`'teki `READ_TOOLS`/`WRITE_TOOLS`/`BROWSER_TOOLS`/`INTERACTIVE_TOOLS` kümelerini üretir (elle ikinci liste yok). `plan` modunda hepsi `deny`, `auto`'da `gate:'read'`→`allow`, geri kalanı `ask`.
4. **Prompt'a katalog:** sistem prompt'una `<available_surfaces>` bloğu eklenir — "UI'da şu yüzeyler var, şu araçlarla erişirsin"; `buildSkillsSystemPrompt`'un **gerçekten çağrılması** (bugün ölü kod) aynı dalda düzeltilir, `<available_skills>` model tarafından okunabilir hale gelir. Prompt bloğu katalogdan üretilir, elle yazılmaz.
5. **Keşfedilebilirlik disiplini:** aracın `description`'ı **ne yaptığını tek cümlede söyler** ("Render an Archify IR to HTML/SVG"), Claude-Code/SST tarzı; model alacaktaki 25 araçta kaybolmaz.
6. **Dürüstlük kuralı:** sunucu yeteneği yoksa (ör. browser engine yok → REQ-154'teki gibi) araç `engine_unavailable` döner; sessiz sahte-iyi sonuç yok.
7. **Geriye dönük:** mevcut araç adları (`open_browser` vb.) **silinmez** — katalog bunları da listeler, yani prompt tek kaynaktan gelir ama isimler korunur (canlı prob'lar ve REQ notları geçerli kalır).

## Kontrol (kabul kriterleri)

- Katalog **tek kaynak**: rail listesi, activity listesi, settings bölümleri, tool listesi aynı tablodan türer; `grep -c` ile rail'de elle yazılmış yüzey adı kalmadığı doğrulanır (0).
- `INSPECTOR_RAIL_ITEMS`/`ACTIVITY_ITEMS` birim testleri yeşil; `bun x tsc --noEmit` 0.
- Sistem prompt'unda `<available_surfaces>` bloğu **gerçekten** var ve katalogdaki araç adlarıyla birebir eşleşir (test: registry listesi == prompt bloğu).
- `buildSkillsSystemPrompt` artık çağrılıyor: canlı koşuda `<available_skills>` bloğu modele gidiyor (prob: prompt çıktısında geçiyor).
- Her yeni araç için: (a) gate sınıflandırması testi, (b) tek bir canlı çağrı → dürüst sonuç. `plan` modunda hepsi reddediliyor.
- Yüzey→araç matrisi tablosu (yukarıdaki 14 satır) tam uygulanmış; eksik satır kalmadığını README'deki "Kapsam" listesiyle karşılaştıran test.
- Kapılar: birim testleri + tsc 0 + sterilize build + `pm2 restart lokma-web` + canlı bundle == disk hash + canlı prob `scripts/probe-surface-tool-catalog.cjs` (katalog/prompt eşleşmesi + 3 farklı yüzey aracının canlı çağrısı + `plan` modunda ret).

## Dokunulacak yerler (öngörü)

- `packages/lokma-shared/src/surfaces.ts` (yeni) — katalog + türeticiler
- `packages/lokma-web/web/src/components/shell/inspector-rail.tsx` + `activity-bar.tsx` (listeleri katalogdan alır) — **kaynak kayma riski**: bu iki dosya kardeş oturumlara da dokunuyor, patch öncesi `git status` kontrol
- `packages/lokma-core/src/tools/gate.ts` (kümel katalogdan), `registry.ts`, yeni araç dosyaları `packages/lokma-core/src/tools/{design,archify,testing,vault-memory,skills-inspect,cron,plugins,providers,git,usage,terminal}.ts`
- `packages/lokma-web/server/src/agent-loop.ts:363-401` (kayıt bloğu → katalog sürücüsü)
- `packages/lokma-core/src/context/context.ts` + `packages/lokma-core/src/skills/prompt.ts` (prompt bloğu)
- `packages/lokma-web/server/src/routes/*.ts` — yalnız **eksik olan** ucu ekle (mevcudunu değiştirme; ikinci uygulama = DRY ihlali)

## Bitirme (done)

1. Kontroller PASS + kanıt (prob + prompt dump + katalog diff).
2. Atomik İngilizce commit(ler) + push (katalog → rail → araç ailesi başına ayrı commit).
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index + `Docs/00` kronoloji.

## Notlar

- **Write-only:** kod yazılmadı. Kapsam **büyük** — uygulanırken dalga dalga (design/archify/testing → vault/memory/skills → cron/plugins/git/providers/usage → terminal) ilerlenmeli, tek büyük commit olmamalı.
- **Tasarım kararı:** katalog yaşayan yüzeylerin **tek doğruluk kaynağı** olmalı; "UI listesi ayrı, araç listesi ayrı" ikilisi bugünün bakım yükünün kaynağı ve bu REQ'in asıl sebebi.
- `Docs/23-PLUGIN-SYSTEM` (Cordis) ile ilgili: plugin'ler tool olarak da kaydedilebilir (Cordis tarzı), ama bu REQ'in kapsamı dışında — ayrı REQ'e bırakıldı.
- Kullanıcının cümlesi tek cümle: "UI'da ben ne yapabiliyorsam onları direkt harness de kullanabilcek" — bu REQ o cümlenin karşılığı.