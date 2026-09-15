# REQ-149 — Sessionlar websocket'e bağlı olsun, veriler WS'ten canlı gelsin

**Status:** pending
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
