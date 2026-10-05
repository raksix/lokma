# REQ-201 — Loop yürütücüsü: arka planda tekrarlı koşu (cron'dan ayrı kavram)

**Status:** in-progress (tur 1/5 — karar katmanı bitti, commit `aebbf85`)
**Tarih:** 2026-10-03
**Kaynak:** Kullanıcı mesajı (3 Ekim 2026):
> "abi var olan loopları lokmaya ekleme sadece biz ya da agent loop oluşturunca lokma harnessinde çalışan loopları arayüzden görebileceğiz.

istersek tüm looplar istersek proje bazlı"

> Ayrım **vurgulu**: Hermes'in `~/.hermes/loops/` altındaki mevcut loop'lar (redwind-w1/w2/w3, grammar-sprint vb.) Lokma'ya **eklenmez** — yalnız **Lokma harness'i içinde** (kullanıcı ya da ajan) oluşturulan loop'lar katalogda görünür.

**İlişkiler:** REQ-200 (veri modeli) → REQ-201 (yürütücü) → REQ-202 (arayüz) · REQ-203 (proje bazlı görünüm) · REQ-181 (yüzey→araç kataloğu: loop aracı da katalogdan gelir) · REQ-062 (proje kapsamı) · mevcut `cron/` (zamanlanmış iş) ile **aynı yüzey değil**.

## Bugünkü durum (ölçülmüş, `file:line`)

1. **Lokma'da loop kavramı **yok**. `grep -rn "loop" packages/lokma-core/src packages/lokma-web/server/src packages/lokma-web/web/src` → yalnız `agent-loop` / `runAgentLoop` / `loopback` / TUI'nin "turn-loop" yorumları. Yani **bütçeli, durumlu, tekrar eden** bir iş birimi hiç yok.
2. **Zamanlanmış iş var ama farklı:** `packages/lokma-core/src/cron/` (`cron.ts` store + `runner.ts` + `approvals.ts`) — `CronJob` alanları: agentId, schedule, task; `matchesMinute`/`selectDueJobs`/`appendRunRecord`. Yani "bir ajana saatlik tek iş ver" var. **Loop** ise "bir işi, durumunu ve bütçesini tutarak **tekrar ederek** yap, kendi ilerlemesini ölç, bitince dur" — bu eksik. Loop, cron'un `repeat` + state taşıyan hali olarak **aynı altyapıyı paylaşabilir** ama ayrı bir kavramdır (kullanıcı da ayrımı vurguladı).
3. **Çalıştırma yolu hazır:** `agent-loop.ts` `runAgentLoop({ cwd, prompt, sessionId, maxTurns, reasoningEffort, send, deliverSessionPrompt })` + `session-runs.ts` `enqueuePrompt`/`getRunState`/`runStatus` → bir oturuma prompt enqueue etmek **koşuyu başlatıyor**. Loop bu ikisini kullanır, **kendi kuyruğunu yazmaz**.
4. **Proje kapsamı hazır:** `auth/store.ts` `createProject/listProjects/getProject` + `Project.cwd`; tasarım/design zaten proje bazlı çalışıyor (REQ-178). Loop'un `projectId` alanı buraya bağlanır.
5. **Ajan olayları hazır:** `agents/events.ts` `emitAgentEvent/onAgentEvent` (`AgentLifecycleAction` = create/start/stop/…) — panel bununla canlı güncellenir (WS push, yoksa 4 sn poll).

## Kapsam

1. **Yürütücü** (`packages/lokma-core/src/loops/runner.ts`): loop `running` iken **her turda** `enqueuePrompt` (mevcut `session-runs.ts`) ile kendi oturumuna prompt yazar → `runAgentLoop` koşar → tur biter. **Kendi process'i değil, mevcut kuyruk** kullanılır (ikinci kuyruk yok).
2. **Trigger çeşitleri (birleşik, cron ile ortak saat altyapısı):** `interval` (her N dk), `cron` (`matchesMinute` mevcut), `event` (bir dosya/commit değişti), `manual` (düğme). `cron/` ile **aynı `runner.ts` yardımcıları** kullanılır — ikinci takvim yazılmaz.
3. **Duraklama disiplini:** tur biter bitmez hemen yeni tur **atılmaz**; `cooldown` (varsayılan 60 sn, ayarlanabilir) + **boş-tur sayacı**: ajan hiç iş yapmadıysa (tool çağrısı/tek satır değişlik yok) tur sayacı artmaz ve 3 boş turdan sonra loop `idle` ile **kendiliğinden durur** — sonsuz boşa token yakma yasak.
4. **Ajan da loop kurabilsin:** ajanın `create_loop` aracı (REQ-181 kataloğundan) `{ name, projectId?, cwd, prompt, budget, schedule }` → aynı store → aynı yürütücü. Yani "biz ya da agent loop oluşturunca" cümlesinin **ikinci yarısı**: tool ile de kurulabilir. Döndürdüğü: `{ loopId, status }` + `ui_action` (panelde belirir).
5. **Çakışma:** iki loop aynı `cwd`'de çalışacaksa **reddedilir** (kilit), üstüste yazma değil; aynı cwd'de **ikinci** loop kurulacaksa kullanıcıya "burası zaten bir loop'ta" denir ve mevcut loop önerilir.
6. **Durdurma dürüstlüğü:** `stop` → mevcut tur **bitirilir** (yarım yazım bırakılmaz), sonra `paused`; `abort` mevcut turu keser `error:aborted` yazar. Sunucu yeniden başlarsa `running` loop'lar **kayıttan** geri kalkar (`resumeOnBoot`, varsayılan açık).
7. **Sıfır maliyet kuralı:** `budget.maxUsd: 0` → tur **hiç başlamaz**, `done` + `stopReason:'budget'` (kullanıcının bilerek kapatması yolu).

## Kontrol (kabul kriterleri)

- `POST /api/loops/:id/run` bir tur başlatır ve transcript'e gerçek prompt düşer (prob: `session-runs` kuyruğu boşalır, koşu `completed`). Boş-tur koruması: yapay bir ajan hiç iş yapmadan 3 tur → loop `idle` durur (`spent.iters` artmaz). `create_loop` aracı ajan çağrısıyla loop kurar ve panelde görünür.
- Aynı cwd'de ikinci loop kurulumu **dürüst red** verir (mevcut loop adıyla birlikte); iki loop aynı dosyayı düzenlemez.
- Kapılar: birim + `bun x tsc --noEmit` 0 + sterilize build + `pm2 restart lokma-web` + canlı bundle == disk hash + prob `scripts/probe-loop-runner.cjs`.

## Dokunulacak yerler

- Yeni: `packages/lokma-core/src/loops/runner.ts`
- `packages/lokma-core/src/cron/runner.ts` (takvim yardımcıları **yeniden kullanılır**)
- `packages/lokma-web/server/src/session-runs.ts` (kuyruk — değişmez, çağrılır)
- `packages/lokma-core/src/tools/loops.ts` (yeni `create_loop`/`list_loops` araçları)
- `packages/lokma-web/server/src/agent-loop.ts` (araç kaydı)

## Bitirme (done)

1. Kontroller PASS + prob (+ ekran görüntüsü).
2. Atomik İngilizce commit(ler) + push.
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index + `Docs/00`.

## Notlar

- **Write-only:** kod yazılmadı.
- Kapsam disiplini: bu dalga **görünürlük + yönetim** katmanı; executor ayrı REQ (aşağıda). Kullanıcının "looplar arka planda çalışcak zaten" cümlesi = UI'ın onlara **dokunmaması**, panelin **izleme + kontrol** olması.

## İlerleme günlüğü

### Tur 1/5 — karar katmanı (`aebbf85`) ✅

**Bitti:** REQ-200 şeması zaten REQ-201'i bekliyordu (`recordIteration(countIteration:false)` boş-tur kancası). Bunun üstüne **saf yürütücü politikası** yazıldı — saat parametreyle geçirildiği için store/kuyruk/model olmadan test edilebilir:

- `loops/runner.ts` (yeni): `resolveTrigger` tetikleyici çözümü, `earliestNextTurn` (interval **başlangıçtan** ölçülür), `shouldStart`, `countIterationFor`, `stopReasonAfterTurn`, `initLoopCalendar`.
- `schemas/loop.ts`: `LoopTrigger` ayrım-birleşimi (`interval|cron|event|manual`) + `trigger`/`cooldownSeconds`/`maxEmptyIters`/`lastRunOutcome`/`emptyIters`/`lastRunStartedAt` alanları + `LOOP_RUN_OUTCOMES`.
- `loops/store.ts`: `resolveTrigger()`, `recordRunTiming()` (boş sayacı + başlangıç damgası; `recordIteration`'dan **ayrı** çünkü boş tur sayacı ilerletmemeli).
- Kapsam dışı bırakılanlar (bilinçli): `POST /api/loops/:id/run`, `create_loop` aracı, sunucu tarafı executor, `resumeOnBoot`.

**Ölçülen kararlar:**
- Takvim **yeniden yazılmadı** — `cron`'un kendi `assertValidSchedule` + `matchesMinute`'ı kullanılıyor (tek takvim, iki kavram). `initLoopCalendar` enjeksiyonu bu yüzden var.
- `maxUsd: 0` = literal kapatma anahtarı, her şeyden önce kontrol ediliyor (kapsam 7).
- Boş tur `spent.iters`'ı **ilerletmiyor**; 3 ardışık boş turda `idle` ile kendini durduruyor (kapsam 3).
- **Durma önceliği düzeltildi:** bütçe/hedef `idle`'den **önce** raporlanıyor. Boş tur `iters`'ı ilerletmediği için, `maxIters` dolmuş bir loop o tura değil daha önceki gerçek tura ulaşmıştır; `idle` demek stop'un gerçek sebebini gizlerdi. Prob bunu yakaladı (ürün düzeltildi, prob esnetilmedi).

**Kapılar:** kök `tsc` 0 · shared + core + web build yeşil (1752 modül) · REQ-200 store probu **118/118** (yeni zorunlu alanlardan regresyon yok) · REQ-201 runner probu **72/72**.

**Proven-to-fail (üçü de kırmızı, sonra md5 ile bayt bayt geri alındı):** cooldown tabanı devre dışı · interval'ı turun **bitişi** yerine başlangıcından ölçme · sıfır-maliyet anahtarını kaldırma.

**Prob düzeltmesi (kendi hatam):** cooldown için ilk PTF **yeşil** kaldı — çünkü `not_yet` assert'lerimin hepsi `interval` kullanıyordu ve interval zaten blokluyordu; cooldown hiçbir yerde *yük taşıyan* sebep değildi. Ayrıca yeni cron assert'leri ilk çalıştırmada **temiz hâlde** kırmızıydı: `initLoopCalendar` henüz çağrılmamıştı, yani takvim sessizce `() => false` stub'ıydı — ölçmeyen prob. İkisi de düzeltildi (cooldown için cooldown-0 kontrolü + sahte-cron eşleşmesi eklendi, takim başta gerçek matcher'a bağlandı).

**Sonraki tur (2/5):** sunucu tarafı executor — `packages/lokma-web/server/src/loops/executor.ts`: `enqueuePrompt` + `pumpSessionRun` (mevcut kuyruk, ikinci kuyruk yok), transcript'e gerçek prompt yazma, `enqueuePrompt` dönüşünden tur bitişini ölçme (token/usd), ledger'a `formatLedgerEntry` yazma, `stop` mevcut turu **bitirip** `paused`, `abort` `error:aborted`. Sonra tur 3'te `POST /api/loops/:id/run` + tur 4'te `create_loop` aracı.
