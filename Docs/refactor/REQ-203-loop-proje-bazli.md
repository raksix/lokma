# REQ-203 — Loop görünümü proje bazlı olabilsin (tüm looplar ↔ tek proje)

**Status:** in-progress (tur 3/5 — kapsam 3'ün yazan yarısı, canlıda kanıtlı)
**Tarih:** 2026-10-03 · ilk uygulama 2026-10-05
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

1. **İki görünüm, bir veri:** üstte anahtar — **All loops** ↔ **This project**. `This project` seçiliyken liste **o projenin** loop'larına (`projectId` eşleşmesi, projesiz loop'lar ayrı grupta "no project") filtrelenir; aktif oturumun `cwd`'si hangi projeye düşüyorsa o seçili gelir.
2. **Filtreler:** durum (running/paused/done/error), proje, sıralama (varsayılan: aktif + son güncellenen). Arama kutusu ad/`nextHint` üzerinde.
3. **Proje kapsamı sözleşmesi:** loop'un `cwd`'si **projenin cwd'siyle aynı olmalı** (ya da proje kaydı `cwd`'sini işaret etmeli) — REQ-178'in "tek doğruluk kaynağı cwd" disiplini; iki farklı yol yazan loop yok.
4. **Proje silinince:** loop **silinmez**; listede `project missing` rozetiyle durur ve `cwd` geçersizse `error` yazılır (sessiz kayıp yok).
5. **Çapraz görünüm uyarısı:** "This project" görünümünde başka projelerde **çalışan** loop varsa üstte ince bir satır: "3 loop başka projelerde çalışıyor" → tıkla tümüne geç (kullanıcı bunu kaçırmasın).

## Kontrol (kabul kriterleri)

- `This project` seçiliyken yalnız o projenin loop'ları listelenir; projesiz loop'lar ayrı grupta; diğer projelerdeki **çalışan** loop varsa uyarı satırı görünür. Anahtar tercihi + filtreler reload'da korunur (`lokma-loops-view:v1`).
- Proje silinince loop kaybolmaz: `project missing` rozeti + `error` durumu; cwd geçersizken dürüst hata.
- Kapılar: birim + `bun x tsc --noEmit` 0 + sterilize build + `pm2 restart lokma-web` + canlı bundle == disk hash + prob `scripts/probe-loop-project-view.cjs`.

## Dokunulacak yerler

- Yeni: `packages/lokma-web/web/src/components/loops/loop-console.tsx` (görünüm anahtarı + filtreler)
- `packages/lokma-core/src/auth/store.ts` (proje–cwd eşleşmesi kontrolü)
- `packages/lokma-web/web/src/stores/layout.ts` (snapshot)

## Uygulama günlüğü (worker)

### Tur 1/5 — saf kurallar katmanı (`4226f7d`)

Yeni: `packages/lokma-web/web/src/components/loops/loop-view.ts` (I/O'suz, JSX'siz —
her dürüstlük kuralı DOM olmadan kanıtlanabilir) + `loop-view.test.ts` (**71/0**).

Ölçülen kararlar:

1. **Proje eşleşmesi İKİ sinyale birden bakar** (`projectId` **veya** `cwd` ↔ proje
   `cwd`'si). Yalnız `projectId` filtresi, projesi sonradan oluşturulmuş bir loop'u
   düşürür ve "loop'um kayboldu" okuması doğar. Kapsam 3 tek doğruluk kaynağı ister —
   bu katman **ikinci bir yol yazmaz**, ikisini de okur.
2. **İki sinyal çelişirse** sessizce kazanan seçilmez: `conflict` durumu + rozet
   `project conflict · cwd is <ad>`. Sıralama claim'e (explicit atama) gider, ama
   çelişki görünür kalır — loop hiçbir projede kaybolmaz.
3. **cwd'si boş olan proje kaydı hiçbir şeyi sahiplenmez** (`sameCwd('','')` tasarım
   gereği true — `splitByProjects`'ın notu). Aksi halde `p_ghost` bütün projesiz
   loop'ları yutardı.
4. **Silinen proje loop'u silmez**: `missing` durumu, listede `project missing`
   rozeti, ve loop **eski proje id'sine hâlâ cevap verir** (kullanıcı o id'yi seçili
   bırakmış olabilir).
5. **Proje görünümü hiçbir zaman "hepsine" genişlemez**: silinmiş bir seçim
   `unscoped` bildirir ve **hiçbir şey listelemez** (kapalı kapı = sessiz veri
   kaybı değil, dürüst boş liste).
6. **Çapraz görünüm uyarısı** yalnız **başka projelerde `running`** loop'ları sayar ve
   **arama/durum filtresinden ÖNCE** hesaplanır — arama kutusunun gizlediği çalışan
   işi uyarı da gizlemesin diye. `runningElsewhere` "0 loops" dolgusu üretmez.
7. **Sıralama**: önce `running`, sonra en yeni `updatedAt`; tarih parse edilemezse
   **sona** düşer (throwing değil).
8. **Snapshot** `lokma-loops-view:v1` altında; okunurken **şekil doğrulaması**
   (bilinmeyen `mode` reddedilir → görünüm kendini genişletemez, bozuk JSON
   default'a düşer, storage `throw` ederse console düşmez).

**Kanıt:** tsc 0 · prob 71/0 · **proven-to-fail ×3, her biri FARKLI bir assertion'ı
düşürdü**: cwd eşleşmesi kaldırıldı → kapsam 3 · uyarı aramayla daraltıldı → kapsam 5 ·
unscoped genişlemesi → kapsam 4. Kaynak md5 bayt-aynı geri alındı.

Not (prob kusuru, ürün hatası değil): ilk badge metni bir çelişkide
`project missing` yazıyordu — projeyi **var** olan bir loop için "missing" demek
yanlış; sınır vakası yakaladı, metin `project conflict · cwd is …` oldu.

### Tur 2/5 — konsol yüzeyi (`2e188b3`)

`loop-console.tsx` + `loop-row.tsx` üzerine tur 1'in saf kuralları bağlandı; iki yeni
saf kural da (`adoptActiveProject`, `hasActiveFilters` + `LOOP_FILTERED_EMPTY_COPY`)
probe'la kanıtlandı — prob **84/0** (`loop.test.ts` 51/0 · `loop-console.test.ts` 7/0).

Ölçülen kararlar:

1. **Tercih tek nesne, tek yazıcı.** Görünüm anahtarı + proje + durum filtresi +
   arama kutusu ayrı `useState`'ler değil, `lokma-loops-view:v1` altındaki TEK
   `LoopViewPrefs` nesnesidir (`updatePrefs` yazma + kalıcılık yapar). Ayrı
   state'lerden biri yazılmayı unutsa panel yarım kaydedilmiş bir görünüm
   gösterirdi.
2. **Aktif oturumun projesi BİR KEZ benimsenir** (`adoptActiveProject`):
   kullanıcının seçtiği proje asla ezilmez, `all` kipinde asla proje
   ima edilmez, cwd hiçbir projeye düşmüyorsa **uydurulmaz** (kova = dürüst
   boş kapsam). İki çağrı **aynı nesneyi** döndürür → geri besleme döngüsü yok.
   `useKnownCwd` (primitif string, REQ-144) kullanıldı; `'loading'` ayrıca
   `null`'a çevrildi, yoksa liste yüklenmeden "hiçbir cwd eşleşmedi" kararı
   verilip proje sessizce kaybolurdu.
3. **Uyarı satırı bir BUTTON.** Kapsam 5'in satırı yalnız metin değil: tıklanınca
   `all` görünümüne geçer. Yoksa kullanıcı "3 loop başka yerde çalışıyor" satırını
   görüp ne yapacağını bilemezdi. Sayı `runningElsewhere`'dan gelir, yani arama
   kutusu onu daraltamaz.
4. **Kapsam 4 dürüst kutu:** silinmiş proje seçiliyken liste **hiçbir şey
   basmaz** ve `LOOP_UNSCOPED_COPY` ile nereye bakması gerektiğini söyler; "hiç
   loop yok" kutusu bu kapsamda **gösterilmez** (yoksa o da bir uydurma yokluk).
5. **İki boş durum FARKLI okunur.** Katalog boşsa `LOOP_EMPTY_COPY`; katalog
   dolu ama filtreler boş gösteriyorsa `LOOP_FILTERED_EMPTY_COPY` + **yalnız
   orada** görünen "Clear filters" butonu (`hasActiveFilters` kapsamı saymaz —
   proje kapsamı bir filtre değil, bir yokluktur).
6. **Satır rozeti artık ham `projectId` basmıyor.** `loop-row.tsx` `projectState`
   prop'u alıyor ve `projectBadgeLabel` ile basıyor: gerçek proje adı /
   `project missing` / `project conflict · cwd is <ad>` /
   `no project`. Satır proje LİSTESİNİ bilmediği için burada türetmek doğru
   olmazdı — liste bilgisi konsolun katmanında kalır.
7. **Proje görünümünden yaratılan loop kapsama bağlı:** `createLoop` artık o
   projenin `cwd` + `id`'sini gönderiyor, yoksa kullanıcı yeni loop'u yarattığı
   görünümde göremezdi (`all` kipinde scope olmadığı için `.` kalır).
8. `SelectMenu` proje seçicisi `__no_project__` sentinel'ı ile `null`'ı temsil
   ediyor; sunucu üretimi bir id ile çakışamaz.

**Kanıt:** kök `bun x tsc --noEmit` 0 · sterilize build yeşil (index-C6rvKis5) ·
`pm2 restart lokma-web` sonrası canlı bundle == disk hash · canlı chunk'ta
`data-loop-view-toggle` / `data-loop-running-elsewhere` /
`data-loop-project-state` / `data-loop-filtered-empty` / `lokma-loops-view:v1` /
`project conflict` **hepsi 1** (yeni kod gerçekten servis ediliyor) · `/health` 200.

### Tur 3/5 — kapsam 3'ün YAZAN yarısı (`6c872ff`)

Tur 1 okuyan tarafı kurdu (çelişkiyi `conflict` rozetiyle **gösterir**). Bu tur
diğer yarıyı kurdu: **yazan** taraf, çelişkinin hiç doğmamasına izin vermiyor.

Yeni: `packages/lokma-core/src/loops/project-scope.ts` — `decideLoopScope()` saf
bir fonksiyon (nesne fixture'ıyla disk'siz kanıtlanır), `projectsAtCwd()` eşleşen
**LİSTEYİ** döndürür. `loops/store.ts`'e `assertLoopScope()` tek darboğaz olarak
bağlandı: `createLoop` **ve** `updateLoop`.

Ölçülen kararlar:

1. **Bilinmeyen `projectId` reddedilir, saklanmaz** (`project_unknown`). Onu
   saklamak, okuyucunun rozetlediği `missing` durumunu **üretmiş** olurdu.
2. **Başka bir canlı projeye ait cwd reddedilir** (`project_cwd_mismatch`) ve
   mesaj **İKİ** projeyi de adlandırır: kullanıcının iki sinyali çelişiyor,
   sessizce biri kazanmamalı.
3. **Hiçbir projeye düşmeyen cwd de reddedilir** — kapsam 3 "loop'un dizini bir
   proje dizinidir" diyor; aksi halde loop, dosyaları hiç çalışmadığı bir projenin
   altında dosyalanırdı.
4. **Projesiz kova kendi cwd'sini korur** — meşru bir yer, doğrulama hatası değil.
5. **Boş cwd'li proje kaydı hiçbir şeyi sahiplenmez** ve bir cwd ile
   çelişemez (`sameCwd('','')` tasarım gereği true).
6. **`projectsAtCwd` ilk eşleşmeyi değil TÜM eşleşmeleri döndürür:**
   `findOrCreateProject` **sahip başına** idempotent, yani iki kullanıcı bir
   dizin için iki kayıt tutabilir. İlk satırı seçmek, konsoldaki proje adını
   store sırasına bağımlı kılardı.
7. **cwd, proje kaydının kanonik yazımıyla saklanır** (REQ-087): sondaki `/`
   bir projeyi iki oturum dizinine bölemez.
8. **PATCH de yeniden denetlenir.** Yalnız create'i denetlemek, `PATCH {cwd}` ile
   kapsamlı bir loop'u kendi projesinden dışarı çıkarmaya izin verirdi.

**Ölçülen kırılma (regresyon, kendi düzeltmem):** `store.test.ts`'in eski kapsamlı
fixture'ı **proje kaydı olmayan** çıplak `'demo-project'` id'si kullanıyordu —
yani tam olarak bu sözleşmenin artık reddettiği durum. Fixture artık **gerçek**
proje yaratıyor ve saklanan cwd'yi doğruluyor; prob gerçek kapsamlamayı kanıtlıyor,
imkânsız bir kaydı değil.

**Kanıt:** kök `bun x tsc --noEmit` **0** · core build 0 · server build 0 ·
project-scope probu **38/0** · loops store **129/0** · loop araçları **70/70** ·
executor 76/76 · run-route 31/31 · stop-abort 67/0 · loop-view 84 assert ·
**PTF ×3, her biri FARKLI bir assertion'ı düşürdü**: mismatch reddi kaldırıldı →
7. kontrolde kırmızı · bilinmeyen-id araması atlandı → 6. kontrolde · yalnız
create'de denetlendi → 25 geçti, sonra "a PATCH cannot walk a scoped loop into
another project directory" kırmızı. **Canlı (deploy edilmiş sunucu, gate AÇIK
401):** `POST /api/loops` hayalet `projectId` ile **400 `project_unknown`**,
projeless loop ile **201**; yeni semboller `core/dist` içinde doğrulandı,
`pm2 restart lokma-server` sonrası `/health` 200.

### Kalan (tur 4+)

- `scripts/probe-loop-project-view.cjs`: canlı bundle'da toggle → filtre →
  uyarı satırı → kova akışı (prob klasörü henüz yok, bu REQ'nin ilk canlı
  probu).
- Ekran görüntüsü + close-out (`Status: done`, `finished/`, README + `Docs/00`).

## Bitirme (done)

1. Kontroller PASS + prob (+ ekran görüntüsü).
2. Atomik İngilizce commit(ler) + push.
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index + `Docs/00`.

## Notlar

- **Write-only:** kod yazılmadı.
- Kapsam disiplini: bu dalga **görünürlük + yönetim** katmanı; executor ayrı REQ (aşağıda). Kullanıcının "looplar arka planda çalışcak zaten" cümlesi = UI'ın onlara **dokunmaması**, panelin **izleme + kontrol** olması.
