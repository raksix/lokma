# REQ-149 — Sessionlar websocket'e bağlı olsun, veriler WS'ten canlı gelsin

**Status:** in-progress (tick 3/5)
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
