# REQ-204 — Agent Office (pixel-art canlı ofis) Lokma'ya eklensin

**Status:** pending (kaydedildi, **kod YOK** — kullanıcı "yap" demeden başlanmaz)
**Tarih:** 2026-10-10
**Kaynak:** Kullanıcı mesajı (10 Ekim 2026):
> "@url:https://github.com/isisever/agent-office/ — kanka adamın bu projesini bizim lokmaya ekleyek. bunun için request oluştur"

**İlişkiler:** REQ-181 (yüzey kataloğu — yeni yüzey **tek satır** olarak oraya girer) · REQ-200/201/202/203 (loop'lar = arka plan işçileri) · REQ-116 FAZ B (`claude -p` motoru — hook altyapısı **yok**) · REQ-062 (proje kapsamı + kilit disiplini) · Docs/23 (Cordis-uyarlaması plugin sistemi) · Docs/31 (Archify: bugünkü tek "görsel" yüzey) · Docs/35 + Docs/37 (bots) · Docs/30 (ajan orkestrasyonu) · `themes/` (4 tema).

---

## 1. İstenen (tek cümle)

Agent Office'in **pixel-art canlı ofis** fikri Lokma'nın **kendi** verisiyle çalışsın: projeler, oturumlar/koşular, araç çağrıları, loop'lar ve bot'lar tek bir tuvalde "kim ne yapıyor" olarak görünsün — Claude Code'a bağlı kalmadan, Lokma'nın kendi olay akışından beslenerek.

## 2. Karşı taraf projesi (ölçülmüş — 10 Eki 2026, GitHub API + dosya taraması)

- **Repo:** `isisever/agent-office` · MIT · JavaScript · `main` · 116 ağaç girdisi · ~2.1 MB · ilk commit **9 Eki 2026** (dün) · 2★ · arşiv değil · fork değil.
- **İki parça:** (a) macOS/Linux **Electron uygulaması** (`app/` — `main.js` 42 KB, `renderer/`, `locales/`, `test/`), (b) **Claude Code plugin'i** (`plugin/hooks/register.tsx` 46 KB, `plugin/viewer/`, `plugin/types/`). Plugin, Cordis tarzı `claude-code` plugin API'siyle yazılmış: `import { atom, read, update } from 'claude-code'` + `atom({ plugin, key }, default)`.
- **Veri akışı** (README §How it works): app her proje için `claude` CLI'yi bir **pty**'de başlatır (`--plugin-dir <gömülü plugin>`, hesap başına `CLAUDE_CONFIG_DIR`) → plugin hook olaylarını dinleyip `~/.claude/agent-office/sessions/<session>.json` yazar → app bu dosyaları **saniyede 2 kez** okuyup ofisi çizer. Yani **tek yönlü dosya köprüsü**, sunucu/ağ yok.
- **Ne kaydediliyor** (README §Privacy): ajanlar, görevin ilk **600** karakteri, sonucun **4000** karakteri, son **20** araç çağrısının tek satırlık özeti (komut / dosya yolu / arama deseni / URL), teslimatlar; oturum bittiğinden bir gün sonra otomatik silinir.
- **Tek renderer, iki kabuk:** `app/src/office/core.mjs` ve `plugin/viewer/core.mjs` **aynı dosya** — ikisi de **70.684 bayt**. Electron penceresi ile terminal görüntüleyici aynı çizimi paylaşıyor (`/office` komutu + `/office band`).
- **Özellik envanteri:** proje başına terminal · tüm projelerin paylaştığı ofis + **patron (boss)** · çalışana tıkla → görev / anlık araç (`Bash: npm test`, `Edit: src/app.ts`) / son 20 çağrı / sonuç paneli · **çoklu Claude hesabı** (hesap başına izole config dizini + tek tıkla `claude auth login`) · hesap başına **plan kullanım çubukları (5 saat / hafta)** + %80/%95 bildirimi · "seni bekliyor" (onay isteyen proje / biten koşu) için masaüstü bildirimi + Dock rozeti + satır işareti · git **worktree sekmesi** (`<repo>-wt-<n>`, branch `agent-office/<n>`) · beyaz tahta: günün teslimatları (süre, araç sayısı, başarı) · `/office stats` · tema sistemi (`Auto (per project)` + galeri + `themes.json` `match`) · botların rengi · **EN/TR arayüz** · tamamen yerel (telemetri yok) · GitHub Releases üzerinden kendi kendini güncelleme + Homebrew cask.
- **Varlık durumu:** MIT olduğu için kod alınabilir (telif + lisans metni korunmak şartıyla); "yalnız fikir" yolu da tamamen açık.

## 3. Lokma'da bugün ne var (ölçülmüş, `file:line`)

1. **Ofis/tuval fikri yok.** Yüzeyler tek tek paneller; tek "görsel" yüzey Archify (diyagram editörü, `components/archify/` — REQ-167 ile kendi modalı). Canlı, oyun gibi, "kim nerede çalışıyor" diyen bir tuval **hiç yok**.
2. **Yüzey kataloğu TEK kaynak:** `packages/lokma-shared/src/surfaces.ts` (452 satır, REQ-181) — `SurfaceId` 27 kimlik, `SurfaceHost` / `SurfaceOpens`; yorumu: "Add a surface or an agent tool by adding a row here. The rail lists, the permission gate sets and the prompt block all derive from this file". Yani yeni **Office** yüzeyi = bir satır; ray listesi, aktivite çubuğu, **araç kayıt defteri** ve `<available_surfaces>` prompt bloğu **birlikte** güncellenir (ikinci elle liste yok).
3. **Canlı olay kaynağı hazır:** `packages/lokma-shared/src/protocol/ws.ts` → `ServerMessageSchema` + `encodeServerMessage` (`text_delta` / `tool_start` / `tool_result` / `cost` / …). Sohbetin canlı izi zaten bu çerçevelerle akıyor → ofis bunları **yeniden kullanmalı**, ikinci bir yayın yolu **yazılmamalı**.
4. **Ajan katmanı var ama "subagent" YOK:** `packages/lokma-core/src/agents/` (`registry.ts`, `orchestrator.ts`, `events.ts` → `emitAgentEvent`/`onAgentEvent` + `AgentLifecycleAction`, `locks.ts`, **`worktree.ts`**); tüm repoda `grep -rin "subagent"` → **0 eşleşme**. Agent Office'in "alt ajanı" Lokma'da ancak **koşu (run)** veya **loop turu** olarak karşılanabilir — uydurma subagent çizilemez.
5. **İş birimleri:** `packages/lokma-web/server/src/session-runs.ts` (kuyruk + run durumu) · `server/src/loops/` (REQ-200/201/202/203: `state.json` + `ledger.md` + bütçe + `stopReason`) · `server/src/cron-runner.ts` · `components/bots/` + `Docs/35`/`Docs/37` · `components/orchestration/`.
6. **Proje / cwd tek doğruluk kaynağı:** `packages/lokma-core/src/auth/store.ts` (`Project.cwd`, `createProject`/`listProjects`) — ofisin "proje başına masa"sı buradan kurulmalı (REQ-178/203 disiplini: ikinci bir cwd yolu yazılmaz).
7. **Hesap / anahtar:** çoklu **sağlayıcı** var (`routes/providers.ts` + Settings ▸ Models), çoklu **Claude hesabı** (hesap başına izole `CLAUDE_CONFIG_DIR`) **yok**; kullanım yüzeyi (`components/usage/`, `Docs/22`) ve `observability` var ama **5 saat / hafta plan çubuğu** yok.
8. **Claude motoru hook'suz:** `packages/lokma-web/server/src/engines/claude-print.ts` — `claude -p --output-format stream-json --verbose --include-partial-messages`; dosyanın kendi notu (~satır 137) PreToolUse geri dönüşü için **hook-callback altyapısının olmadığını** yazıyor. Agent Office'in plugin'i tam da o hook'lar üzerine kurulu → köprü istenirse **yeni altyapı** işi.
9. **Plugin sistemi kardeş fikir, birebir değil:** `Docs/23` Cordis-uyarlaması (servis / tipli olaylar / `ctx.effect` ile geri alınabilir kayıtlar) + `plugins/` (tek örnek: `lokma-skill-hello`). Upstream'in plugin'i `claude-code` paketine bağlı; Lokma'nın kernel'i ayrı → **birebir taşınmaz, fikir taşınır**.
10. **Tema altyapısı var:** `themes/` (`claude.json`, `midnight.json`, `omp.json`, `paper.json` + `index.ts`) + `components/shell/theme.ts` — ofis renkleri bu tokenlara bağlanmalı (ikinci tema sistemi yasak). Upstream'de de `themes/` + `themes/previews` + `themes.json` `match` kuralı var (fikir örtüşüyor).
11. **Yerel/gizlilik duruşu örtüşüyor:** Lokma da yerel-öncelikli (frozen share kopyaları dışında dışa veri yok) — upstream'in "local only, no telemetry" duruşuyla çelişki yok.

## 4. Kapsam (dilimler)

1. **Veri sözleşmesi (ÖNCE bu).** "Ofis satırı" = `{ projectId, cwd, sessionId?, runId?, loopId?, botId?, agentId?, status, currentTool?, lastTools[], startedAt, endedAt?, ok? }`. Her alanın kaynağı `file:line` ile yazılır; **karşılığı olmayan alan boş kalır, uydurulmaz.** Sözleşme saf kurallar katmanı olarak (I/O'suz, JSX'siz) yaşar — REQ-203'ün `loop-view.ts` deseni.
2. **Ofis yüzeyi (ray + pane).** `surfaces.ts`'e `office` satırı (`SurfaceId` + host: rail/pane) → ray ikonu + pane kabuğu; boş durum dürüst ("şu an çalışan iş yok"), sahte sahne yok.
3. **Canlı tuval.** Masa = **proje**, çalışan = **aktif koşu / loop turu / oturum**, göğüste **anlık araç** rozeti (`tool_start` → araç adı), teslim = **biten koşu** (ok, masadan patrona). Veri kaynağı mevcut WS çerçeveleri + `session-runs` durumu.
4. **Çalışan paneli.** Çalışana tıkla → görev (oturum promptu), **anlık araç**, **son N araç çağrısı** (transcript satırlarından), sonuç. Panel mevcut transcript / pane bileşenlerini **yeniden kullanır**; ikinci bir log okuyucusu yazılmaz.
5. **Görünüm ve filtre.** `tüm projeler ↔ bu proje` anahtarı (REQ-203'ün aynı tercih anahtarı ve aynı davranışı), durum filtresi, arama; proje silinince koşu **kaybolmaz** (REQ-203 kuralı).
6. **"Seni bekliyor" bildirimi.** Onay isteyen araç / biten koşu için işaret + bildirim; mevcut toast/kabuk yoluna bağlanır, **yeni bildirim sistemi kurulmaz**.
7. **Tema.** Ofis, `themes/` tokenlarını kullanır (`Auto (per project)` dahil); kontrast ≥4.5 ölçülür (REQ-173 dersi: renk token'dan, ham hex yok).
8. **Dar ekran.** 390 px'te tuval yerine **liste görünümü** (canvas küçükte okunmaz) — dürüst geri düşüş, taşma 0.
9. **(Opsiyonel — ayrı REQ'e bölünebilir) Claude Code köprüsü.** `claude -p` koşularını hook'layıp ofise beslemek (bugün altyapı yok, bkz. §3.8) ve/veya terminal görüntüleyiciyi (`/office` fikri) CLI'ye taşımak. **Bu dilim tek başına büyük bir iş** — kullanıcı isterse `REQ-205` olarak ayrılır.
10. **Kaynak/kredi.** Kod alınırsa: MIT telif metni + README/Docs'ta atıf satırı ("Agent Office — isisever, MIT") **zorunlu**; yalnız fikir alınırsa yine atıf satırı `Docs/00` kronolojisine yazılır.

## 5. Kontrol (kabul kriterleri)

- Ofis yüzeyi **tek satırdan** (`surfaces.ts`) doğar: ray listesi + araç kataloğu + `<available_surfaces>` bloğu **birlikte** değişir; üç tüketici ayrışmaz (REQ-181 kuralı).
- **Uydurma veri yok:** koşu yoksa çalışan da yok; ekrandaki her karakter bir canlı olaya + bir `file:line` kaynağa bağlanır. Prob: veri kaynağı kesildiğinde tuval boşalır ve boş durum metni çıkar.
- Canlılık **olaydan** gelir, poll'a düşmez; soket yoksa poll dürüstçe çalışır ve bu **iki bağımsız eksende** ölçülür (DOM + tel — REQ-202 dersi: yedek yol ölçümü maskeler), negatif kontrol **önce** koşar.
- Kapılar: saf kural birimleri + `bun x tsc --noEmit` **0** + sterilize build (`env -u NODE_CHANNEL_FD -u NODE_ENV`) + `pm2 restart lokma-web` + **canlı bundle == disk hash** + canlı prob + login gate **401** + **proven-to-fail** (en az bir assertion gerçekten kırmızıya düşer, geri alma md5 bayt-aynı).
- 390 px'te taşma **0** ve tuval yerine liste; kontrast ≥4.5; emoji/ikon-font yok (Lucide).
- Ekran kanıtı: ofis dolu + boş durum + dar ekran olmak üzere en az 3 görsel `Docs/refactor/assets/` altına.

## 6. Karar bekleyen noktalar (kullanıcı kararı — kod yazılmadan ÖNCE netleşmeli)

1. **"Eklemek" ne demek?** (a) yalnız **fikir** → Lokma'nın kendi verisiyle yerli Office yüzeyi *(öneri)*, (b) upstream **kodu vendor** edilip uyarlanır (Electron kısmı bize yaramaz; `core.mjs` renderer'ı alınabilir), (c) yalnız **plugin** taşınır (Claude Code koşuları için — hook altyapısı gerekir).
2. **Patron kim?** (a) loop'lar (arka plan işçileri) patron, (b) kullanıcıya en çok iş çıkaran proje, (c) kullanıcının kendisi (ofisin dışında).
3. **"Subagent" yerine ne çizilsin?** Lokma'da subagent yok: (a) **koşu (run)**, (b) **loop turu**, (c) ikisi birlikte (farklı renk/kiyafet).
4. **Çoklu Claude hesabı** istiyor muyuz (izole `CLAUDE_CONFIG_DIR` + 5 saat/hafta kullanım çubukları), yoksa mevcut sağlayıcı + `usage` yüzeyi yeter mi?
5. **Çizim teknolojisi:** canvas 2D (upstream'in yolu) mi, DOM/CSS mi? (Öneri: veri katmanı tek, çizim iki kabuk — biri canvas biri liste.)
6. **Paket yeri:** yeni `packages/lokma-office` mi, `web/src/components/office/*` mı, `plugins/` mı?
7. **Kapsam 9 (Claude köprüsü)** bu REQ'te mi kalıyor, ayrı REQ'e mi bölünüyor?

## 7. Dokunulacak yerler (öngörü — uygulamada kesinleşir)

- `packages/lokma-shared/src/surfaces.ts` (`office` yüzey satırı + `SurfaceId`)
- `packages/lokma-shared/src/protocol/ws.ts` — **yalnız gerekirse**; mevcut çerçeveler yetiyorsa dokunulmaz
- `packages/lokma-web/server/src/` (yalnız eksik okuma uçları; var olanlar tercih edilir)
- `packages/lokma-web/web/src/components/office/*` + `components/shell/inspector-rail.tsx` (otomatik türetilir)
- `packages/lokma-core/src/agents/events.ts` (olay alanı eksik çıkarsa)
- `themes/` (ofis renkleri) · `Docs/00-LOKMA-KONTEKST.md` (kronoloji + atıf)

## 8. Uygulama günlüğü

(bekliyor — kullanıcı "yap" dediğinde doldurulur)
