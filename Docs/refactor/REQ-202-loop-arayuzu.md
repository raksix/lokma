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

### Tur 4 (`8b49426`, `dac258e`) — canlı prob bir eksik kapsamı buldu; sonra kendi dört kusurunu buldu

`scripts/probe-loop-console.cjs` yazıldı ve **çalışan sunucuya** karşı koştu (jetonsuz kapı ölçümü hariç her istek gerçek ürün rotası; hiçbir satır/durum/ledger elle yazılmadı). İlk koşu **41/3** çıktı ve üç kırmızıdan **biri gerçek ürün kusuruydu**:

**Kapsam 4'te listelenen `Open ledger (md)` kontrolü hiç yoktu.** Detay panelinde Pause/Resume/Run now/Stop/Delete vardı, ledger dosyasını almanın hiçbir yolu yoktu — yani "Open ledger" hiç yaşamamış bir kabul kriteriydi ve yalnız canlı prob bunu görebilirdi. Yol açtı: loop dizini `~/.lokma/loops/<id>/` **her workspace jail'inin dışında**, dolayısıyla mevcut dosya indirme rotası onu servis edemiyor. Koruma **bilinçli olarak ikinci bir yol denetimi değil**: her kardeş rotanın kullandığı `assertLoopIdShape` aynısı, dosya adı sabit literal, bilinmeyen loop herhangi bir okumadan önce 404. İstemci tarafında mevcut paylaşılan `downloadBlob` yardımcısı yeniden kullanıldı (createObjectURL/anchor kopyası bir 11. kopya olmasın diye); terminal loop'ta buton açık kalıyor çünkü geçmiş korunuyor.

Kalan iki kırmızı **probun kendi kusuruydu** ve dördüncüsü ancak ikinci turda göründü:
- **"tokenless" kapı kontrolü** probun kendi auth başlığını kullanıyordu → 200 döndü → yani "kapı hiç açılmadı" kanıtlamak için var olan kontrol, tek Credential taşıyan istek olmuştu;
- tur ortasında çöken prob **RC=0** veriyordu (özet `try` bloğunun içindeydi) — hiç bitmemiş bir prob yeşil okunuyordu;
- `draft → paused` bekleniyordu, ama yasal geçiş `draft → running`'dir ve Pause `bad_transition` ile **dürüstçe reddedilir** — doğru ürün kuralı kusur gibi okunuyordu;
- ledger "hiç tur kaydedilmedi" metnini bekliyordu, ama ledger dosyası **her zaman** başlığını taşır, yani hiç boş değildir.

Prob artık **sunucunun bu koşu için bastığı id**'ye göre eşleştiriyor: bir turda `rows=2` çıktı ve ikinci satır probun **kendi** bıraktığı bir throwaway dump scripti çöpüydü; "tam olarak bir satır" ancak katalogun başlangıçta boş olduğu kanıtlandıktan sonra bir anlam taşıyor.

Proven-to-fail (ikisi de RC=1, dosyalar md5 ile bayt bayt geri alındı): (1) loop ipucu yazmamışken **uydurma** "next run soon" sırası → kırmızı; (2) `scope.md` yoksa **uydurma** "0 items left" listesini getiren panel → kırmızı. Ama (2) ilk iki mutasyon turunda **49/0'da yeşil kaldı**: koşudaki tek fixture `scope.md`'si **oldu** için no-scope dalının **tamamı ölçülmüyordu**. Dosyayı silip yeniden okuyan ikinci bir adım eklendiğinde kırmızıya düştü. Bu, probun varlık nedeni: **kıramayan assertion, assertion olmamaktan kötüdür.** Aynı tuzak ters yönde de bir kez tuttu: `/api/sessions/<taze id>` 404'ü **hiç loop karışmadan sade bir yüklemede** de ölçüldü, yani bu REQ'den önce gelen kabuk davranışı — kontrol loop'un kendi rotalarına daraltıldı.

**Kapılar:** canlı prob **54/0** (RC=0) · saf kurallar **51/51** · konsol probu **7/7** · store probu **73/0** · kök `bun x tsc --noEmit` **0** · core + server + web build yeşil · `pm2 restart` sonrası servis edilen chunk == disk (`index-UJu4zcAg.js`) · `/health` 200 · jetonsuz `/api/auth/me` prob öncesi **ve** sonrası **401** (login kapısı hiç açılmadı) · prob bıraktığı loop/fixture **0** (silme + kalıcılık doğrulamasıyla).

**Sıradaki tur:** REQ'in Kontrol'ünün son satırı "prob (+ **ekran görüntüsü**)" diyor. Prob canlı ve yeşil; kalan parça konsolun ekran görüntüsü (kapsam 1'in iki giriş noktasından biri + satır/detay) ve Bitirme'nin `git mv → finished/` + README + `Docs/00` kapanışı. Ayrıca ölçülmemiş tek kapsam kalıyor: **kapsam 5'in "canlı satır WS frame ile anında güncellenir, frame yoksa poll" ölçümü** — prob şu an poll yolunu ölçüyor, frame yolu ölçülmedi.

### Tur 5 (`6cf41c6`) — kapsam 5'in frame yolu hiç ölçülmemişti; prob, frame ölüyken de yeşil kalıyordu

Yukarıdaki "sıradaki tur" notunun işaret ettiği boşluk kapandı, ama boşluğun **ne ölçtüğü** önce ölçüldü: prob'un 1'den 13'e kadar olan her adımı 5 sn'lik **poll** yolunu kullanıyordu. Yani REQ'in kendi "soket yoksa 5 sn poll" cümlesi, **frame yolu tamamen ölüyken de** prob'u yeşil bırakıyordu — düşen katman sessizce yedek yolla örtülüyordu.

Ölçüm iki bağımsız eksende yapıldı, çünkü tek başına ikisi de belirsiz:

- **Tel:** CDP `Network.webSocketFrameReceived` ile gerçek `{"type":"loop","loopIds":["l_…"]}` frame'i yakalanıyor **ve şekli doğrulanıyor**. Alt dize araması, adı ya da iç içe bir gövdeyi taşıyan bir frame'i de kabul ederdi; o frame konsola "katalog değişti" diye ulaşıp hedefli tazeleme yerine tam yeniden okuma tetiklerdi — yani kapsam 5'in istediği şey değil.
- **DOM:** satır poll aralığının çok altında değişiyor **ve** o pencerede **sıfır** `GET /api/loops` liste çekişimi var. İkinci eksen ancak bir **negatif kontrol** ile anlamlı: önce poll'un gerçekten çalıştığı ölçülüyor (boştaki liste çekişimleri ~4999 ms aralıkla), aksi hâlde "pencerede çekişim yok" gözlemi "prob çekişimleri göremiyor" demek olurdu. CDP oturumu sokettan **sonra** açılıyor: zaten açık bir soket yeni bir CDP oturumuna tekrar oynatmıyor, sayfa oluşturulurken açılan oturum hiçbir şey görmez ve frame kontrolü boşuna yeşil kalırdı.

**Proven-to-fail iki mutasyonla kanıtlandı** (ikisi de RC=1, kaynak `md5sum` ile **bayt bayt** geri alındı, yeniden kurulan bundle aynı hash'e döndü — `index-UJu4zcAg.js`):

| mutasyon | hangi kontrol kırmızıya düştü | anlamı |
|---|---|---|
| soket köprüsü frame'i alıyor, id'leri **yutuyor** (`announceLoopChange([])`) | "pencerede katalog poll'u çalışmadı" → `list fetches=1` | frame hedefli tazeleme yerine tam yeniden okumaya düşüyor; DOM yine de hızlı çünkü yeniden okuma da hızlı — **zamanlama kontrolü bu mutasyonda yeşil kalıyor** |
| köprü tamamen kaldırılıyor (`loop` frame'i hiç ilan edilmiyor) | "satır frame ile yeniden çizildi" → `dom NEVER` | frame yolu gerçekten ölü; satır ancak bir sonraki poll'da hareket eder |

İki mutasyon **farklı** kontrolü kırmızıya düşürdüğü için ikisi de yük taşıyor; ilk mutasyonun "hızlı DOM" gözlemi tek başına yanıltıcıydı ve yalnız `fetches-in-window` kontrolü onu yakaladı. Ders: bir ölçüm iki bağımsız kanaldan geliyorsa, her birinin **kendi** kırıklığının hangi assertion'ı düşürdüğünü ayrı ayrı doğrula — yoksa "yeşil" olan, kanaldan biri değil muhtemelen diğeridir.

**Ekran görüntüleri:** Kontrol'ün son satırı gereken iki kare alındı — `assets/REQ-202-ss1-loop-konsol-liste.png` (kapsam 1'in Settings → **Loops** giriş noktası, satır) ve `assets/REQ-202-ss2-loop-konsol-detay.png` (detay: "WHAT IS LEFT" 2 madde, kontrol düğmeleri, ledger). İkisi de **gerçek** bir loop + gerçek `scope.md` ile, elle hiçbir alan doldurulmadan çekildi ve prob bıraktığı loop **0** ile bitti.

**Vision uyarısı (bu turde ölçüldü, kayda değer):** ss1'i okuyan vision iki şeyi **yanlış** söyledi — konsolun görünmediğini (aynı yanıtta satırın adını, rozetini, `iter 0/400` ve ipucunu ayrıntılıyla saymış), ve `state.json` bloğunun ss2'de "görünmediğini" (blok panelin altında, kırpılmış). Buna karşılık **bütçe** etiketlerini doğru okudu: `0.0/24h · $0.00/$50`. Şüphe edilip **DOM'dan ölçüldü** (`innerText` + `getComputedStyle`) ve iki şey doğrulandı: (1) sunucu bütçeyi **varsayılan** olarak atıyor (`maxHours:24, maxUsd:50`) — yani etiketler uydurma değil, prob'un "tavansız bütçe" kontrolünün ölçtüğü **farklı** bir kayıt durumu; (2) satır ipucu **tam metni** taşıyor, vision'un "truncated" dediği şey CSS `text-overflow: ellipsis` (`scrollWidth 287` / `clientWidth 215`). Yani ekran görüntüleri **dürüst kanıt**; ekran görüntüsü kanıtı da bu REQ'in ortak dersini tekrarlıyor: renk, dolgu veya "görünüyor/yok" iddiası ölçülmeden kabul edilmiyor.

**Kapılar:** canlı prob **61/0** (RC=0) · saf kurallar **51/0** · konsol probu **7/0** · store probu **73/0** (token'lı) · core store **128/0** · server bus **7/0** (temp HOME ile) · kök `bun x tsc --noEmit` **0** · web build yeşil (**1757 modules**) · `pm2 restart lokma-web` sonrası servis edilen chunk == disk (`index-UJu4zcAg.js`) · `/health` 200 · jetonsuz `/api/auth/me` prob öncesi **ve** sonrası **401** (login kapısı hiç açılmadı) · prob bıraktığı loop/fixture **0** · çalışma ağacı temiz.

**Kapanışa kalan tek şey:** Bitirme'nin `Status: done` + hash + `git mv → finished/` + README index satırı + `Docs/00` kronoloji girdisi. Kapsam 1–7'in tamamı ölçüldü ve kanıtlandı; ayrı bir kod değişikliği gerektiren açık kapsam yok.
