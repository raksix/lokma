# REQ-149 — Sessionlar websocket'e bağlı olsun, veriler WS'ten canlı gelsin

**Status:** done (2026-09-15 — probes `d363cab`, close-out commit follows)
**Tarih:** 2026-09-15
**Kapsam (öngörü):** `packages/lokma-web/server/src/routes/ws.ts` (protokol),
`packages/lokma-shared/src/protocol/ws.ts`, `packages/lokma-web/web/src/lib/ws.ts`,
`hooks/use-ws.ts`, `stores/session.ts`

## İstek (verbatim)

> sessionlar web sockete bağlı olsun web scoketten anlık yenielnsin ben sesşona
> açınca web socketle iştek gitsin ordangelsin verileri

## Yorum

Oturum verisi (liste + transcript) bugün REST ile çekiliyor, canlılık ise
"önce poll, sonra `done` frame'inde tazele" deseniyle sağlanıyor (4 sn'lik
liste poll'u + transcript reload). İstenen: oturum açıldığında veri **istek/cevap
olarak WS üzerinden** alınsın; liste ve transcript değişiklikleri WS'ten anlık
yayılsın — poll'a bağlı kalmadan.

## Kabul kriterleri (öngörü)

1. WS protokolüne oturum verisi RPC'leri eklenir: örn. `{type:'sessions_list'}` /
   `{type:'transcript_get', sessionId}` istekleri ve `sessions` / `transcript`
   cevap frame'leri (mevcut `prompt`/`done`/`text_delta` akışı bozulmadan).
2. Oturum açıldığında istemci transcript'i WS'ten ister; cevap gelene kadar
   iskelet/boş durum gösterilir (sessiz boş değil).
3. Sunucu tarafında transcript'e yazılan her satır (kullanıcı promptu, asistan
   metni, tool satırı) bağlı soketlere **itilir**; istemci 4 sn'lik poll'a
   bağlı kalmadan güncellenir.
4. Mevcut REST uçları geriye dönük uyumluluk için çalışmaya devam eder
   (CLI ve `curl` akışları kırılmaz).
5. Soket kopması/yeniden bağlanma sonrası istemci tek bir tazeleme isteğiyle
   senkronu yakalar (tam sayfa yenileme gerekmez).

## Verify planı (öngörü)

- Prob: aynı oturumda iki soket açılır; birinden `prompt` gönderilir, diğerinin
  transcript frame'lerini **poll beklemeden** aldığı doğrulanır.
- Ölçüm: 10 sn'de istemci başına REST transcript/poll isteği sayısı (hedef: 0;
  şu an 4 sn'lik liste poll'u var).

## Notlar

- REQ-144 (kimlik sabitleme) ve REQ-148 (boş dönüş) bu işin önkoşulu gibi
  duruyor: WS'e taşınırken aynı önbellek tuzaklarına düşülmemeli.
- Kardeş oturumun çalıştığı `probe-prompt-rail.cjs` + `single-chat-view.*`
  dosyalarına dokunulmaz.

## Uygulama (tick log)

### Tur 1/5 — kontrat + append feed (2026-09-15)
- `packages/lokma-shared/src/protocol/ws.ts`: yeni istemci mesajları
  `sessions_list` + `transcript_get`; yeni sunucu frame'leri `sessions`,
  `transcript`, `transcript_append` ve wire satırları `SessionRowSchema` /
  `TranscriptRowSchema` (REST'e paralel, geriye dönük uyumlu).
- `packages/lokma-core/src/session/store.ts`: `onSessionAppend(listener)`
  kaydı — `append()` satır DISKE yazıldıktan sonra abonelere haber verir
  (fırlatan dinleyici yutulur; CLI abone olmadığı için davranış değişmez).
  Sunucu bu kancayla canlı soketlere push yapacak.
- Kanıt: `lokma-shared/src/protocol/ws.test.ts` 12/12,
  `lokma-core/src/session/append-feed.test.ts` 4/4 (HOME=$(mktemp -d) ile),
  shared+core dist yeniden derlendi, root `tsc --noEmit` 0, concept build yeşil.
- Sıradaki: (2) sunucu handler'ları + fan-out, (3) istemci lib/ws + use-ws,
  (4) store/sidebar/chat wiring (4 sn poll yerine WS), (5) canlı prob + kapanış.

### Tur 2/5 — sunucu feed (2026-09-15)
- `packages/lokma-web/server/src/session-feed.ts` (yeni): `sessions_list` /
  `transcript_get` isteklerini yanıtlar, her persisted satırı
  `transcript_append` olarak iter, liste abonelerine debounce'lu (750 ms)
  `sessions` yayını gönderir; kapanışta `unsubscribeSocket`.
- `routes/ws.ts`: iki yeni handler (REST ile aynı sahiplik kuralı; `?token=`
  soketleri için handshake kullanıcısı devrede).
- `SessionRowSchema`: `running`/`queued` opsiyonel alanları — REQ-121
  rozetleri soket üzerinden de taşınır.
- Kanıt: `session-feed.test.ts` 8 grup PASS, shared proto 16/16, root tsc 0,
  shared+core+server dist yeniden derlendi, concept build yeşil.
- Commit'ler: `b965a48` (shared run flags) + `2b75f69` (server feed).

### Tur 3/5 — istemci plumbing (2026-09-15)
- `web/src/lib/ws.ts`: `sessionsListMessage()` + `transcriptGetMessage()`
  builder'ları; `SessionsFrame` / `TranscriptFrame` / `TranscriptAppendFrame`
  tipleri; reducer'da oturum verisi frame'leri için no-op dal (chat state'ine
  dokunmaz).
- `web/src/hooks/use-ws.ts`: her (re)connect'te `sessions_list` gönderilir
  (soket liste abonesi olur), her frame session store'a da iletilir,
  `requestTranscript(id)` dışa açıldı.
- Kanıt: `web/src/lib/ws.test.ts` PASS (yeni builder/decode/reducer
  kontrolleri; REQ-133'ün bayat `'max'` assert'i düzeltildi — REQ-139
  merdiveni genişletmişti), web build yeşil (573 kB index), root tsc 0, canlı
  bundle hash disk ile aynı (`index-Cy2-hJqP.js`).
- Commit: `f39398c`.
- Sıradaki: (4) store/sidebar/chat wiring (4 sn poll yerine WS),
  (5) canlı prob + kapanış.

### Tur 4/5 — mağaza + sidebar + sohbet kablolaması (2026-09-15)
- `stores/session.ts`: `applyWsEvent` artık oturum frame'lerini gerçekten
  işliyor — `sessions` (liste push'u; REQ-148 prune politikası korunur),
  `transcript` (tam anlık görüntü), `transcript_append` (tek satır büyüme).
  Elde olmayan bir oturum için append yok sayılır (yarım geçmiş çizilmesin).
  Yeni sayaç: `wsSockets` + `noteWsOpen`/`noteWsClose` (sidebar poll kapısı).
- `hooks/use-ws.ts`: soket açılınca sayacı artırır, kapanışta (onclose /
  disconnect / unmount) düşürür; `requestTranscript` istenen id'yi hatırlar ve
  her (yeniden) bağlanışta tek `transcript_get` ile tazeler (kriter 5).
- `sessions-sidebar.tsx`: 4 sn'lik poll artık SADECE açık soket yokken koşuyor
  (soketsiz sekmeler için yedek) — sayaç tick anında okunur, interval bir kez
  kurulur.
- `chat/index.tsx`: pane açılışında transcript WS'ten istenir; bir çalışma
  sürerken REST transcript reload'u yalnız soket kapalıyken yapılır (rozet
  probu kalır); `visiblePending` — sunucu satırı canlı geldiğinde iyimser
  kullanıcı balonu gizlenir (kendi mesajı iki kez çizilmez; yalnız kuyruk
  eşleşir, eski aynı metinli prompt yenisini saklamaz).
- Kanıt: `stores.test.ts` yeni REQ-149 bloğu PASS (2 soket sayımı, taban 0,
  sessions/transcript/append fold'ları, yarım önbellek yok), `ws.test.ts` PASS,
  sohbet testleri PASS, root `tsc --noEmit` 0, web build yeşil
  (`index-Bjih_AMc.js` 574.71 kB), pm2 `lokma-web` restart + canlı bundle hash
  disk ile aynı, canlı bundle'da `wsSockets`/`noteWsOpen`/`noteWsClose` var.
- Sıradaki: (5) canlı E2E probu (iki soket, poll'suz büyüme) + kapanış.

### Tur 5/5 — canlı E2E probu + kapanış (2026-09-15)
- Yeni canlı problar (commit `d363cab`):
  - `scripts/probe-session-feed-ws.cjs` — **10/10 PASS**: tek sokette
    `sessions_list` → `sessions` frame (121 ms) ve `transcript_get` →
    `transcript` anlık görüntüsü (60 ms); aynı oturumda İKİ soket: A'dan
    prompt gönderildi, B'ye kullanıcı satırı **61 ms'de** push edildi (4 sn
    poll kadansının çok altında, B hiç REST'e gitmedi), aynı satır ikinci
    sokete 0 ms'de fan-out oldu; asistan satırı da WS üzerinden düştü (tur
    başına 15 push satırı). REST `GET /api/sessions/:id` aynı transcript'i
    döndürmeye devam ediyor (kriter 4). Soket kapatılıp ikinci tur
    koşulduktan sonra TAZE bir soket TEK `transcript_get` ile tüm geçmişi
    (4 satır, iki tur) aldı — catch-up ek REST isteği gerektirmedi (kriter 5).
  - `scripts/probe-session-feed-browser.cjs` — **4/4 PASS**: gerçek tarayıcıda
    (canlı token + basic-auth) 15 sn'lik ölçüm penceresi — soket açıkken
    `GET /api/sessions` poll'u **0** (hedef 0; eski davranış ~3-4/15 sn) ve
    liste WS'ten `sessions` frame'i olarak geldi (pane açılışında gelen
    `transcript` frame'i de WS'ten — kriter 2); negatif kontrol: soket
    reddedilince (routeWebSocket) poll geri geliyor (15 sn'de 4) → sıfır
    ölü poll değil, kapı gerçekten `wsSockets` sayaçına bağlı.
- Kapanış: beş kabul kriterinin tamamı canlı kanıtlı; ek olarak root
  `bun x tsc --noEmit` 0, steril web build yeşil, servis edilen bundle
  (`index-Bjih_AMc.js`) disk ile aynı.
- Commit zinciri: `b965a48` (shared wire satırları) → `2b75f69` (sunucu feed)
  → `f39398c` (istemci plumbing) → `c68189e` (store + sidebar + sohbet) →
  `d363cab` (canlı problar) → kapanış docs commit'i.
