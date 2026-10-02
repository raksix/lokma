# REQ-186 — Yüklenen görseller gerçekten görülsün (görsel içeriği konuşmaya girsin)

**Status:** in-progress
**Tarih:** 2026-10-01
**Kaynak:** Kullanıcı mesajı (1 Ekim 2026):
> "kanka resim atınca resmi görmüyor ve attığım remsi de mesaj içeriğinde görebielyim aq sik sik işler resim dosya falan attığımda alıp görebilsin"

Ek gözlem: bu oturumda ekran görüntüleri şu biçimde geliyor:
> `[The user attached an image: upload_20261001_174722_1.png]`
> `[Examine it with the vision_analyze tool using image_url: /root/.hermes/images/upload_20261001_174722_1.png]`

**İlişkiler:** REQ-183 (space-bunny tool çağrısı) ile **bağımsız** — bu bir Hermes-tarafı eksik, Lokma'ya değil.

## Bugünkü durum (ölçülmüş)

1. **Dosya diskte gerçekten var ve okunabilir.** `~/.hermes/images/upload_20261001_174722_1.png` = 277.035 bayt, 2776×1906 px. Yani sorun yükleme/erişim değil.
2. **Model görüntüyü okuyabiliyor.** Test görseli (`VISION TEST`, kırmızı `42`, mavi `7`) üç yolla denendi:
   | Kanal | Sonuç |
   |---|---|
   | Hermes `auxiliary.vision` (`cmd-sexgoat` + `deepseek/deepseek-v4.1-flash`, `/root/.hermes/config.yaml:1673-1676`) | ✅ `"42 7"` — **doğru** |
   | aynı model, `stealth/space-bunny-alpha` | ✅ `"42 7"` — **doğru** |
   | `image-picker` MCP (`mcp__image_picker__analyze_images`) | ❌ `HTTP 400 insufficient credits` (vision MCP kaldırılmadan önceki kalıntı) |
   
   → **Model ve anahtar sağlam; görmeme sebebi aracın/kanalın kendisi.**
3. **Her iki ekran görüntüsünde de aynı şey oldu ve sonuç aynı:** MCP 400 döndü → ben OCR'a (tesseract) düştüm → tesseract'in okuyabildiği kısmı (`Lokma`, `2.7k`, `space-bunny-al...`) geldi ama **yerleşim, renk, ikon, hizalama, "ne var" bilgisi kayboldu.** OCR metin verir; görsel değil.
4. **Oturumda `vision_analyze` aracı hiç yok.** Sistem istemi vision MCP'sini işaret ediyor ama MCP `mcp_vision_analyze_image` listede bulunmuyor (30 Eyl'de kaldırıldı); `image-picker`'ın `analyze_images`'ı ise kredisiz kalıntı. Yani talimat çalışmayan bir araca işaret ediyor → ajan ya hata mesajını kullanıcıya döndürür ya da (bu oldu) OCR'a düşer.
5. **İçerik bağlamı da kaybediliyor.** Kullanıcının isteği görsele göre değişiyor ("ikonların yarısı görünmüyor", "space-bunny tool çağrısı yapamıyor"). Görseli gerçekten görmeden bu isteklerden biri bile doğru yorumlanamaz.

## Kapsam

1. **Görsel, mesajın içeriğine gerçekten girsin:** kullanıcı bir görsel eklediğinde modele giden mesaj `content` dizisinde `image_url` taşır (data URL veya dosya yolu); model yanıtı bu görseli **görmüş gibi** yazabilmeli. Bu, Hermes'in mesaj kurucusunun (provider'a `image_url` geçirmenin) düzeltilmesi veya eklenmesidir.
2. **Çalışmayan vision kanalını temizle:** `image-picker` MCP'sinin `analyze_images` çağrısı kredisiz 400 veriyor → listeden kaldırılır veya sağlıklı bir araca yönlendirilir; sistem istemindeki `vision_analyze` talimatı **gerçekten var olan** bir araca işaret etmeli (yoksa talimat kaldırılır, yalancı bir araç vaat edilmez).
3. **Görsel yükleme kanalları ayrışsın:** (a) model görüntüyü kendisi okur (tercih edilen — `image_url` içerik parçası), (b) görsel okunamıyorsa **açıkça söyle** ("bu görseli okuyamadım, dosya şurada"), (c) dosya/ek varsa metin olarak al (PDF/kod gibi). Sessiz OCR'a düşmek veya görseli görmediğini söylemeden cevap vermek yasak.
4. **Çoklu ek/çoklu görsel:** tek mesajda birden fazla dosya/görsel sırayla ve hepsi aktarılır (bugün yalnız son/ilk görsel görünüyor gibi davranış olmasın).
5. **Boyut koruması:** büyük ekran görüntüleri (4K+) modele gönderilmeden önce makul ölçeğe indirilir (`maxImageEdge` gibi tek sabit), yoksa payload/timeout patlar; indirilme kullanıcıya bildirilir.
6. **Dosya içeriği de okunsun:** kullanıcı `.pdf`/`.txt`/`.json`/`.csv` eklediğinde içeriği sohbete **gerçekten** girsin (REQ-137 html preview + attachment yoluyla); ikili dosyalarda dürüst red (binary → metin değil).

## Kontrol (kabul kriterleri)

- Test görseli (`VISION TEST` + kırmızı `42` + mavi `7`) kullanıcı mesajıyla verildiğinde model yanıtı **`42` ve `7`** sayılarını içerir (doğru okuma; OCR değil).
- Gerçek bir ekran görüntüsü verildiğinde yanıt **yerleşimi** tarif eder (hangi sütunda ne var, hangi ikon, hangi renk) — OCR metni değil.
- `deepseek-v4.1-flash` 400 alırsa (kredi/upstream) yanıt **"görseli okuyamadım"** der, uydurma tarif üretmez.
- 2+ ek/ek görselinin **hepsi** aktarılır.
- 4K görsel küçültülür ve indirgemenin farkı belirtilir.
- Kalıbın (projenin/oturumun) `vision` kanalı 1 kez doğrulanır; her oturumda yeniden keşfedilmez.
- Prob: `scripts/probe-vision-attachment.cjs` (ya da Hermes tarafında eşdeğer) — pozitif (okuma doğru), negatif (400 durumunda dürüst hata), çoklu-ek ve boyut ölçümü.

## Dokunulacak yerler

- Hermes mesaj kurucusu (user content → provider `image_url`), `auxiliary.vision` bağlama kısmı
- `~/.hermes/config.yaml` → `auxiliary.vision` (kanal seçimi, model id'si tek kaynak)
- MCP listesi: `image-picker` (`analyze_images` kredisiz) ve `mcp_vision_analyze_image` referansları
- Lokma tarafı eşdeğer: `packages/lokma-core/src/tools/attachments.ts` + `REQ-155` ek renderer'ı (dosya/görsel sohbete) — Lokma için de aynı kural geçerli

## İş günlüğü

- Tur 1 (2026-10-02): Provider katmanı — ProviderMessage.images alanı (+ ProviderImage tipi, messageImages/imageDataUrl yardımcıları); üç wire dönüştürücü görseli gerçek içerik parçası olarak üretiyor (chat image_url, Responses input_text/input_image, Anthropic base64 image bloğu). Yeni birim prob images.test.ts 17/17 PASS; adapters.test.ts 162/162 regresyon temiz; kök tsc 0; lokma-ai dist yeniden derlendi. Sıradaki: composer (data URL + maxEdge küçültme) + protokol alanı.
- Tur 2 (2026-10-02): Composer + protokol — `prompt` frame `images` taşıyor (PromptImageSchema name/mime/dataBase64; PROMPT_MAX_IMAGES=6, PROMPT_IMAGE_BASE64_CHARS=2M; shared ws.test 20/20). Composer görseli tarayıcıda createImageBitmap + canvas ile JPEG'e çevirir: maxEdge 1568 (gerekirse 1176→882/quality ladder), şeffaflık beyaza kompozit, aşım dürüst hatayla reddedilir; marker `[image attached: …]` + "downscaled from WxH" notu (chat.test 4 downscale senaryosu). Wire: ComposerSend.images → sendText → promptMessage → frame; WS maxPayload 1MB→16MB (eski tavan ilk gerçek ekran görüntüsünde soketi 1009 ile kapatırdı). Kök tsc 0, web build yeşil (index-DmMBZxyp.js), served bundle == disk, lokma-web + lokma-server restart, health 200. Sıradaki: sunucu tarafı — ws.ts prompt handler'ın images'ı kullanıcı satırına yazması, runAgentLoop'un ProviderMessage.images ile beslemesi, kullanıcı mesajında görsel render'ı.
- Tur 3 (2026-10-02): Sunucu→müşteri boru hattı — `ws.ts` prompt handler'ı `images`'ı kullanıcı satırına yazıyor (görsel-only prompt da kabul; `if (!prompt && !images.length)`); `buildLoopHistory` kullanıcı satırlarının baytlarını `ProviderMessage.images` olarak yeniden oynatıyor (yeni-önce `HISTORY_IMAGE_CHAR_CAP` 4M bütçesi; boş metinli görsel satırı artık düşmüyor); `TranscriptRowSchema` + `toTranscriptRow` görselleri telde taşıyor (REQ-160 tuzağı); sohbette kullanıcı balonunun altında görsel render (`UserImage`: data URL, tıkla → yeni sekmede blob). **Ek bulgu:** `web/dist`'te `emptyOutDir:false` birikimi 905MB'a çıkmıştı (242 `index-*.js` + 15.5k dosya) ve `/mnt/apopic` %100 doldu — superseded chunk'lar (son 24h penceresi dışı) temizlendi, **893MB** açıldı; `emptyOutDir:false` politikası korundu. Kanıt: agent-loop-images 37/37 (6 yeni assert) + session-feed 10 grup + shared ws 20/20 + kök tsc 0 + server/web/concept build yeşil + served bundle == disk (`index-DO7CCju_.js`); `pm2 restart lokma-server` + `lokma-web`, health 200/200. Sıradaki: canlı kanıt — 42/7 test görseli gerçek modelle WS'ten gönderilip yanıtta okunması + reload'da görselin kalıcılığı.

## Bitirme (done)

1. Kontroller PASS + kanıt (prob çıktısı + transcript satırı).
2. İngilizce commit + push (Hermes tarafı varsa ayrı commit'ler).
3. Dosya: `Status: done` + hash'ler; gerekirse `git mv` → `finished/`.

## Notlar

- **Write-only:** kod yazılmadı; uygulama ayrı fiil bekliyor.
- Bu bir **kullanıcı deneyimi / doğruluk** sorunu: "görseli görmeden cevap vermek" sessiz bir yanlış cevap üretir. REQ-183'teki "sessiz sahte-iyi sonuç yasak" ilkesinin görsel tarafı.
- Kullanıcının cümlesi tek cümlede iki şey istiyor: **(1) görseli gerçekten görmek, (2) eklediği dosyanın içeriğini mesajda görmek.** İkisi ayrı kanallar (görsel vs dosya), tek REQ'te toplandı.
