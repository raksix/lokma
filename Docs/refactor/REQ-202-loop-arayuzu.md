# REQ-202 — Looplar arayüzden görülsün ve yönetilsin (durum, ne kaldı, pause/stop)

**Status:** pending
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

1. **Giriş noktası:** Settings modalına **"Loops"** bölümü (bölümleşme deseni REQ-163…167: rail ikonu modalı bölümle açar, ikon **kalır**) **+** rail'de kendi girişi olan bir **Loops** pane'i (ağır kullanım için). İki giriş de aynı veriyı gösterir, tek uygulama.
2. **Liste satırı (her loop için tek satır, okunur):** ad · durum rozeti (`running` canlı nabız noktası + "3 dk önce") · `iter 24/400` · bütçe çubuğu (`hours 19.6/1440 · $0.00/100`) · **"Sırada"** satırı (`next_hint`, kısaltılmış 1 satır) · son skor (`best`) · proje rozeti.
3. **Detay paneli (tıklayınca):** `state.json`'ın **ham** içeriği (kullanıcı dosyayı görmek ister), `ledger.md` **son 20 turu** kaydırılabilir, tam prompt metni, model/bütçe formu, **ve "Neler kaldı?"** bölümü:
   - loop'un `scope.md`'si varsa **işaretlenmemiş maddeler** `[ ]` sayılır ve listelenir (Claude tarzı kontrol listesi);
   - yoksa `nextHint` gösterilir ve alan boş bırılır — **uydurma "kalan iş" listesi yok**.
4. **Kontroller:** `Pause` · `Resume` · `Stop` · `Run now` · `Open ledger (md)` · `Delete` (onay + geçmiş **korunur**, yalnız kaldırılır). Eylemler `aria-label`'lı ve ikonlu (emoji yasak).
5. **Canlı güncelleme:** `agents/events.ts` `onAgentEvent` + WS `loop` frame → satır **anında** güncellenir; soket yoksa 5 sn poll (session feed deseninin aynısı). Yeni tur `ledger`'e düştüğünde satırda "yeni" işareti belirir.
6. **Dürüst durumlar:** `error` durumunda **son hata satırı** görünür; `done` loop'ta "bitti — neden" (`stopReason`) rozeti; `paused` loop'ta "durduruldu" + ne zaman. Hiçbir durum **uydurma** ilerleme göstermez.
7. **Boş durum:** tek cümle + "New loop" butonu (boş katalogda "hiç loop yok, ajana da sorabilirsin").

## Kontrol (kabul kriterleri)

- Bir loop çalışırken satır **anında** güncellenir (WS frame yoksa poll'a düşer, ölçülebilir); `Pause` → `paused`, `Resume` → `running`, `Stop` → `stopped`. Detayda `ledger.md` son 20 tur + `state.json` ham içeriği + prompt görünür. "Neler kaldı?" `scope.md` varsa `[ ]` maddeleri, yoksa `nextHint` (uydurma liste yok).
- `error` loop son hata satırını gösterir; `done` loop `stopReason` rozetiyle kapanır; boş durum tek cümle + New loop.
- Kapılar: birim + `bun x tsc --noEmit` 0 + sterilize build + `pm2 restart lokma-web` + canlı bundle == disk hash + prob `scripts/probe-loop-console.cjs`.

## Dokunulacak yerler

- `packages/lokma-web/web/src/components/settings/settings.ts` (`Loops` bölümü) + `settings-modal.tsx`
- Yeni: `packages/lokma-web/web/src/components/loops/{loop-console,loop-row,loop-detail}.tsx`
- `packages/lokma-web/web/src/lib/ws.ts` (`loop` frame reducer'ı)
- `packages/lokma-shared/src/protocol/ws.ts` (frame şeması)

## Bitirme (done)

1. Kontroller PASS + prob (+ ekran görüntüsü).
2. Atomik İngilizce commit(ler) + push.
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index + `Docs/00`.

## Notlar

- **Write-only:** kod yazılmadı.
- Kapsam disiplini: bu dalga **görünürlük + yönetim** katmanı; executor ayrı REQ (aşağıda). Kullanıcının "looplar arka planda çalışcak zaten" cümlesi = UI'ın onlara **dokunmaması**, panelin **izleme + kontrol** olması.

### Tur 1 (`a2da97b`) — konsolun gösterdiği iki dosya sunucuda ölçülmüyordu

Kapsam 3 "detay paneli: `state.json`'ın **ham** içeriği … `scope.md`'deki işaretlenmemiş maddeler" diyor; `getLoopDetail` (`loops/store.ts:837`) yalnız `loop + ledger + ledgerPath` döndürüyordu. Yani konsol ya kaydı **yeniden serileştirmek** (diskteki metin değil) ya da kalan iş listesini **uydurmak** zorundaydı — ikisi de REQ'in yasakladığı şey. Aradaki boşluk ölçülüp kapandı:

- `stateJson` metin olarak okunuyor (**bayt bayt** diskten, yeniden serileştirme yok) + `statePath`;
- `hasScope` + `remaining`: **`scope.md` yoksa `null`**, dosya var ama hepsi işaretliyse `[]`. Bu ikisi ayrı kalmalı — dosyasız bir loop'ta `[]` dönseydi konsol "0 madde kaldı" derdi, sanki biri liste yazmış gibi;
- `parseScopeRemaining` dışa açıldı: yalnız `- [ ]` satırlarını sayar (girintili ve `*`/`+` madde işareti de kabul), `- [x]` ve düz metin kalan iş sayılmaz.

**Kapılar:** store probu **114 → 128**; proven-to-fail (null'ı `[]` yapmak → "no scope.md yields remaining=null" kırmızı, dosya bayt bayt geri alındı) · kök `bun x tsc --noEmit` **0** (önce `lokma-core` dist'i yeniden kuruldu — workspace paketi `dist/`'ten çözülüyor) · core + server + web build yeşil · **çalışan sunucuda ölçüldü**: detay 5/5, `scope.md` round-trip 3/3 (yaz → gerçek liste → sil → tekrar `null`), prob artıkları **0**, loop kilidi **0**, jetonsuz `/api/auth/me` **401** (login kapısı hiç açılmadı).

**Sıradaki tur:** istemci — satır + detay bileşenleri (`components/loops/`), Settings → **Loops** bölümü, `ws.ts` `loop` frame reducer'ı (soket yoksa 5 sn poll).

### Tur 2 (`4e18c1e`) — konsolun istemci katmanı yoktu; satırın nasıl konuşacağı da

Sunucuda rotalar tamdı (`routes/loops.ts`: list · detail · create · patch · run · pause · abort · resume · delete) ama **istemcide hiçbir şey yoktu**: `grep -rn "loop" web/src/lib/api.ts` → 0. Yani konsol hiçbir şekilde var olamazdı. Tur 2 o katmanı + satırın **dürüstlük kurallarını** getirdi:

- `api.ts`: `LoopView` (`LoopSchema`'ın alan alan aynısı) + `LoopDetailRes` + 10 uç çağrısı. Kontrol yanıtlarının dürüstlük bayrakları **tipte** taşınıyor — `pauseLoop.deferred`, `abortLoop.cutTurn`, `runLoop.accepted`: "sıraya alındı", "bu tur bitiyor" ve "gerçekten kesildi" bir cümleden ayrıştırılacak metin değil, render edilecek alan.
- `components/loops/loop.ts` saf kurallar; hepsi bir **reddediş**:
  - `remainingLabel(null)` ≠ `[]` — `scope.md` yoksa **hiç** kalan bloğu yok; dosya var ve hepsi işaretliyse bunu söyler;
  - `nextHintLabel` ipucu yoksa `null` — "next run soon" gibi bir yedek, **uydurma sıra** olurdu;
  - `turnInFlight` `status`'u değil `inFlightSince`'i okur — `running` = **donanıyor**, yanında tur yok; canlı nokta oradan gelir. `stopRequested` bunu ezer: ertelenen stop "running" değil "finishing this turn" der;
  - `budgetBars` sıfır tavanı 1 değil **0** yapar (tavansız bütçe dolu çubuk çizmemeli);
  - `bestScoreLabel`/`targetScoreLabel` 0 değil `null` — skorlar opak string, harness ölçeği bilmez.

**Kapılar:** prob **51/51** · proven-to-fail üç envanter mutasyonunda da kırmızı (uydurma nextHint · scope'suz loop'a uydurma liste · sıfır tavanı dolu çubuk) ve dosyalar md5 ile **bayt bayt** geri alındı · kök `bun x tsc --noEmit` **0** · web build yeşil · servis edilen chunk gerçek JS ve `/api/loops` taşıyor · jetonsuz `/api/auth/me` her iki portta **401** (login kapısı hiç açılmadı). Ayrıca `web/dist/assets` içinden 24 saatlik varlık grafiği korunarak **1848 süperflu chunk** silindi (163.5 MB, 179M → 19M) — `emptyOutDir` false kaldığı için kutu şişmesin diye.

**Sıradaki tur:** bileşenler — `loop-console.tsx` + `loop-row.tsx` + `loop-detail.tsx` (kapsam 2/3/4/6/7: satır, detay paneli, ikonlu kontroller, dürüst durumlar, boş durum), Settings → **Loops** bölümü + rail'deki **Loops** pane girişi, `ws.ts` `loop`/canlı güncelleme reducer'ı (soket yoksa 5 sn poll).

### Tur 3 (`3305cc6`) — kesilmiş tur kurtarıldı, kapıda gerçek bir kusur çıktı

Önceki tur konsol bileşenlerini yazmış ama **hiç commit etmeden** kesilmişti; ağaç kirliydi. Kural gereği yeni kod yazmadan önce bunu doğrulayıp kapıdan geçirip commit etmek gerekiyordu. Doğrulama sırasında **kapının kendisi kırmızıydı** — ve bu bir ürün kusuru, prob hatası değil:

`events.ts` "filtre bir şey düşürdü mü" diye boşuma karar veriyordu (`ids.length === loopIds.length ? ids : []`). Bu iki **farklı** sinyali tek bir kurala indiriyordu. `'*'` anlamlı bir sentinel'dir ("adını bilmediğim bir şey değişti" → tam yeniden okuma), boş id ise **gürültüdür** (atılır, yanındaki gerçek id'ler yaşar). Sonuç: `['*', 'l_aaaaaaaa']` bildirimi okuyucuya id'leri verir ve o bildirimle birlikte gelen bir create/delete'i **kaçırırdı**.

Proven-to-fail iki mutasyonla kanıtlandı (ikisi de RC=1, dosya md5 ile bayt bayt geri alındı):
- eski "uzunluktan türet" hali → `blank ids are dropped` kırmızı;
- **yalnız** wildcard degrade'i düşürülmüş hali → `a wildcard beside real ids` kırmızı.

İkinci mutasyon aynı zamanda bir **boş assertion**'ı da yakaladı: eski prob yalnız yalnız `['*']` kontrol ediyordu, o da wildcard kuralı olmasa da `[]`'ye filtrelenirdi — yani o assertion hiçbir şey ölçmüyordu. Probu gerçek bozulan hal üzerine kurdum.

**Kapılar:** server bus **7/7** · web saf kurallar **51/51** · konsol probu **7/7** · dokunulan `panes.test` **160/0** + `settings-modal.test` **71/0** · kök `bun x tsc --noEmit` **0** · shared + server + web build yeşil (**1757 modules**) · `pm2 restart lokma-web` sonrası servis edilen chunk == disk (`index-CnKjzIq4.js`), konsol chunk'ı **200** ve gerçek JS · jetonsuz `/api/auth/me` her iki portta **401** (login kapısı hiç açılmadı) · `/health` 200.

**Sıradaki tur:** REQ'in Kontrol bölümünün istediği **canlı probe** — `scripts/probe-loop-console.cjs` yok (ölçülmüş: `ls` → no such file). Birim prob'lar yeşil ama REQ bir REQ'de "unit tests değil, DEPLOYED sunucu" kuralıyla kapanmaz; login kapısı açılmadan (`HOME=/root bun scripts/mint-e2e-token.mjs`) süperadmin token'ıyla konsolun satır → detay → kontrol zinciri canlı ölçülecek.
