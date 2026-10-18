# REQ-205 — Ücretsiz modeller **client-side** çalışsın (OmniRoute keyless yol)

**Status:** pending — tur 2/5 tamam (dilim 1: katalog 46/46 ✓ · dilim 2: SSE koşucu 65/65 + PTF ✓; sırada dilim 3: kalıcılık `origin:'client-free'`)
**Tarih:** 2026-10-18
**Kaynak:** Kullanıcı mesajı (10 Ekim 2026):
> "abi opencode free kullanım var ya api üzerinden api key gerekmeden omniroute da var. o client side apiye bağla. kullancılar direkt ordan free modellere erişebilsin. client side olarak ama backenden istek gönderme şey için gelen sonuçları falan backende alırsın ama. ai tarafı client side olcak kullancının webten gönderdiği isteklere göre anladınnn."

**İlişkiler:** REQ-204 (ofis yüzeyi — bu REQ ondan **bağımsız**, önce/sonra uygulanabilir) · REQ-130/131 (model kataloğu + bulk toggle) · REQ-076 (global auth gate — bu yol gate'in **dışında değil**, oturumlu kullanıcı için) · Docs/22 (provider/model/session) · Docs/26 (config & credentials) · `opencode-free-bridge` (raksix, public — **loopback** varyantı, tarayıcıdan kullanılamaz).

---

## 1. İstenen (tek cümle)

Kullanıcı **hiçbir API anahtarı olmadan**, doğrudan **tarayıcıdan** OmniRoute'un ücretsiz model havuzuna erişip sohbet edebilsin; AI çağrısı istemciden (client-side) gitsin, sonuç yine de oturuma/kayda işlensin.

## 2. Ölçülen gerçek (18 Eki 2026, canlı problar — hepsi anahtarsız)

| Ölçüm | Sonuç |
|---|---|
| `GET https://omniroute.fermag.com.tr/v1/models` **anahtarsız** | **HTTP 200**, 321 KB, **821 model** |
| Ücretsiz kimlikler (örnek) | `free-opencode` · `auto/best-free` · `auto/coding:free` · `opencode-zen/deepseek-v4-flash-free` · `opencode-zen/mimo-v2.5-free` · `oc/hy3-free` · `opencode-zen/nemotron-3-ultra-free` · `cmd/poolside/laguna-s-2.1-free` · `command-code/LongCat-2.0:free` |
| `POST /v1/chat/completions` **anahtarsız**, model `free-opencode` | **HTTP 200**, ~2.0 sn; upstream çözümü `model: deepseek/deepseek-v4.1-flash` |
| CORS **preflight** (`OPTIONS`, `Origin: https://lokma.fermag.com.tr`) | **HTTP 204** + `access-control-allow-origin: https://lokma.fermag.com.tr` + `allow-methods: GET, POST, PUT, DELETE, PATCH, OPTIONS` + `allow-headers: Content-Type, Authorization, x-api-key, anthropic-version, x-omniroute-connection, x-internal-test, accept` |
| Origin **yansıtma** (`Origin: https://evil.example.com`) | Aynen yansıtıldı → uç nokta **açık CORS** (tasarım gereği herkese açık keyless havuz) |
| `stream:true` **anahtarsız** | **HTTP 200 `text/event-stream`**, `cache-control: no-cache, no-transform`; chunk'lar `reasoning_content` delta'sı taşıyor (SSE tarayıcıda çalışır) |
| Ücretsiz **olmayan** model, anahtarsız (`opencode-zen/claude-opus-5`) | **HTTP 502 `bad_gateway`** ("fetch failed") — temiz bir 401 yok; **dürüst hata gösterimi şart** |
| Topoloji | DNS `omniroute.fermag.com.tr` → `77.90.41.67` (67 edge nginx) → `upstream omniroute_app { server 77.90.41.53:20128; }` (uygulama **53'te**) |

**Ölçüm tuzakları (REQ'e gömülü uyarılar):**
1. **Küçük `max_tokens` reasoning modelinde boş `content` üretir** — `max_tokens: 10` ile yanıt `content: ""`, `finish_reason: "length"`, tüm bütçe `reasoning_content`'e gitti. Varsayılan bütçe cömert olmalı, akıl yürütme ayrı gösterilmeli.
2. **Anahtarsız hata modu 502**, 401 değil → "anahtar yok" diye yorumlamak yanlış; gerçek hata metni (`bad_gateway`) gösterilmeli.
3. Upstream takma adlar **çoklu**: `free-opencode` (alias), `oc/*`, `opencode/*`, `opencode-zen/*`, `cmd/*`, `command-code/*` aynı modellerin farklı yazımları → katalog **tekilleştirilmeli** (aynı modeli 4 kez listelemek kullanıcıya yalan).

## 3. Lokma'da bugün ne var (ölçülmüş)

1. **Model çağrısı tamamen sunucu tarafında:** `packages/lokma-web/server/src/agent-loop.ts` + sağlayıcı adaptörleri; anahtarlar sunucuda durur, istemciye **hiç gitmez**, istemci yalnız WS çerçevelerini görür (`packages/lokma-shared/src/protocol/ws.ts` → `text_delta` / `reasoning` / `tool_start` / `tool_result` / `cost`).
2. **Anahtarı olmayan kullanıcı bugün hiç sohbet edemez** — sağlayıcı eklemeden model çağrısı yok; ücretsiz/keyless bir yol **yok**.
3. **İstemciden modele giden hiçbir yol yok:** web kodu hiçbir model API'sine doğrudan istek atmıyor (`grep` ile ölçülür).
4. **Oturum/kalıcılık hazır:** transcript sunucuda; istemci kendi ürettiği satırı da mevcut mekanizmayla (WS `prompt` / `transcript_append` akışı) kayda geçirebiliyor — yani "sonuçları backende al" isteği **mevcut yola** bağlanır, ikinci bir yazma yolu açılmaz.
5. **Auth gate açık kalır:** bu yol oturumlu kullanıcı içindir; gate'i baypas eden bir "public demo" **bu REQ'in kapsamı değil** (istenirse ayrı REQ).

## 4. Kapsam (dilimler)

1. **Ücretsiz katalog (istemcide):** `GET {base}/v1/models` **anahtarsız** çekilir, ücretsiz kimlikler süzülür (`:free` / `-free` / `free-*` / `auto/*free*`), **takma adlar tekilleştirilir** (kanonik etiket + alias rozeti), `localStorage`'ta TTL'li önbellek. OmniRoute düşerse **dürüst hata** ("ücretsiz katalog alınamadı") — uydurma liste **yasak**.
2. **İstemci taraflı koşucu:** tarayıcıdan `POST {base}/v1/chat/completions` (`stream:true`) + SSE ayrıştırma → mevcut sohbet yüzeyine **aynı** çerçevelere dönüştürülür (metin + `reasoning` bloğu); sunucu tarafı koşucu **değişmez**, ikinci bir yol olarak eklenir ve UI'da hangi yolun kullanıldığı görünür (`free` rozeti).
3. **Kalıcılık (kullanıcının şartı):** koşu bitince istemci sonucu **backende** yazar (mevcut transcript yolu), satır `origin: 'client-free'` ile işaretlenir → sunucu bunun **kendi anahtarını harcamadığını** bilir; reload/başka cihazda sohbet durur.
4. **Sır yok:** bu yolun isteğinde **hiçbir anahtar** yok; istemci paketinde anahtar materyali bulunmaz (`grep` kanıtı); sunucu tarafı sağlayıcı yolu ve anahtarları **aynen** kalır.
5. **Yalnız ücretsiz modeller:** seçici yalnız ücretsiz katalogdan beslenir; ücretsiz olmayan bir id bu yolla **çağrılamaz**; reddedilirse gerçek hata gösterilir — **sessiz ücretli modele düşme yok**.
6. **İptal ve tekillik:** oturum başına tek uçuşan istek; Stop → `AbortController` ile akış **gerçekten** kapanır (yetim fetch kalmaz); sayfa kapanınca da akış ölür.
7. **Araç çağrısı (v1 dışı):** ilk sürüm metin+reasoning; tool-calling istemci yolunda **sonraki adım** (REQ'te ayrı dilim olarak işaretli, sessizce yarım bırakılmaz).
8. **Tek yapılandırma noktası:** taban URL tek sabit + ayarlardan geçersiz kılınabilir → CORS ileride kapanırsa **aynı origin proxy**'si eklenir, çağrı yerleri değişmez.

## 5. Kontrol (kabul kriterleri)

- **Canlı prob (tarayıcı):** hiç sağlayıcı kaydı olmayan bir hesapla giriş → ücretsiz model seç → prompt gönder → (a) istek **tarayıcıdan** OmniRoute'a gidiyor (CDP `Network` kaydı ile tel kanıtı), (b) SSE delta'ları ekrana akıyor, (c) sayfa yenilenince sohbet **duruyor** (backend'e yazıldı), (d) `origin: 'client-free'` kayıtta görünüyor.
- **Preflight kanıtı:** tarayıcının kendi `OPTIONS`'u 204 döner (ölçüldü: `access-control-allow-origin` origin'i yansıtıyor) — tel üzerinden assert edilir.
- **Sır yok kanıtı:** üretilen bundle'da `sk-`, `Bearer `, sağlayıcı anahtarı araması **0**.
- **Dürüst hata:** bilinmeyen/ücretsiz olmayan model → UI'da upstream hatası (`502 bad_gateway` veya 429) **aynen** görünür; sessiz düşüş yok. Negatif kontrol: OmniRoute adresi geçici olarak bozulunca katalog "alınamadı" der, eski liste **uydurulmaz**.
- **İptal:** akış ortasında Stop → fetch kapanır, sonrasında ağ kaydında **yeni istek yok**, oturum bozulmaz.
- **Regresyon:** sunucu taraflı sağlayıcı yolu (anahtarlı) aynen çalışır; `bun x tsc --noEmit` 0 + sterilize build + canlı bundle == disk + gate **401**.
- Kapılar: birim (katalog süzme/tekilleştirme + SSE ayrıştırma saf fonksiyonları) + canlı prob + **proven-to-fail** (en az bir assertion gerçekten kırmızıya düşer).

## 6. Karar bekleyen noktalar (varsayılanlar uygulanır, itiraz edilirse değişir)

1. **Varsayılan ücretsiz model:** `free-opencode` (ölçüldü: çalışıyor, `deepseek/deepseek-v4.1-flash`'a çözülüyor).
2. **Kimler kullanabilir:** oturum açmış herkes (gate açık kalır); çıkışsız ziyaretçi için public demo **kapsam dışı**.
3. **Araç çağrısı:** v1'de yok (metin + reasoning), ayrı dilim.
4. **Çok kiracılı kullanım:** ücretsiz havuz herkese açık; istemci tarafında **kibarlık sınırı** (oturum başına tek uçuşan istek + kısa bekleme) uygulanır, sunucu tarafında ek kısıt **istenmedi**.

## 7. Dokunulacak yerler (öngörü)

- `packages/lokma-web/web/src/lib/` (ücretsiz katalog + SSE istemcisi; saf ayrıştırma ayrı dosyada, test edilebilir)
- `packages/lokma-web/web/src/components/chat/` (composer/model seçici: `free` rozeti + yol göstergesi)
- `packages/lokma-web/web/src/stores/` (koşu durumu + iptal)
- `packages/lokma-web/server/src/routes/` (yalnız kayıt: `origin: 'client-free'` alanını kabul eden mevcut yol)
- `packages/lokma-shared/src/protocol/ws.ts` (gerekirse alan; mevcut çerçeveler yetiyorsa **dokunulmaz**)
- `Docs/00-LOKMA-KONTEKST.md` (kronoloji)

## 8. Uygulama günlüğü

### Tur 1/5 — dilim 1: ücretsiz katalog (istemci) — 2026-10-18
- `packages/lokma-web/web/src/lib/free-models.ts` — keyless katalog modülü: `fetchFreeCatalog` (anahtarsız `GET {base}/models`), `normalizeFreeCatalog` (ücretsiz süzme + takma ad tekilleştirme + deterministik sıra), `loadFreeCatalog` (localStorage TTL 10 dk, anahtar `lokma:free-catalog:v1`), `isFreeId`, `modelsUrl` + tipler. Tek yapılandırma noktası: `FREE_BASE_URL` (kapsam 8).
- TEKİLLEŞTİRME ÖLÇÜMÜ: canlı payload 821 model → 46 ücretsiz → **23 kanonik**. Aileler upstream davranışıyla doğrulandı: `oc/` ≡ `opencode/` ≡ `opencode-zen/` (üçü de aynı `fetch failed` hatası), `cmd/` ≡ `command-code/`, `veoaifree-web/` ≡ `veo-free/`. Kanonik = rank 0 (en açık yazım); diğerleri `aliases[]` tercih sırasında (ileride yedek deneme için hazır). Farklı aile + aynı ad AYRI kayıt kalır (farklı rota).
- DÜRÜSTLÜK (kabul kriteri): bozuk uç + bayat önbellek → `ok:false`; bayat liste taze gibi servis edilmez, önbellek baytlarına dokunulmaz. Boş/hasarlı payload da hata. Uydurma liste yok.
- PROB: `free-models.test.ts` **46/46** (`bun src/lib/free-models.test.ts`; 4 negatif kontrol: bozuk uç + bayat önbellek, HTTP 502, boş katalog, ağ reddi).
- KAPILAR: kök `bun x tsc --noEmit` 0 · sterilize web build yeşil · uygulama chunk'ı `index-CsWBliF3.js` değişmedi (modül henüz import edilmiyor).
- SIRADA: dilim 2 (istemci koşucu — SSE ayrıştırıcı + akış) ve dilim 3 (kalıcılık `origin: 'client-free'`).

### Tur 2/5 — dilim 2: istemci koşucu (anahtarsız SSE akışı) — 2026-10-18

- `packages/lokma-web/web/src/lib/free-runner.ts` — `runFreeChat` tarayıcıdan DOĞRUDAN `POST {base}/chat/completions` (`stream:true`, **anahtar yok**); `drainSseData` (kanal sınırına dayanıklı satır tamponu — çok-baytlı karakter ortasından bölünen chunk'lar dahil), `parseStreamPayload` (saf; `[DONE]` olay üretmez, `error` payload'ı ve bozuk JSON dürüst hataya düşer), `chatCompletionsUrl`. DRY: base birleştirme `free-models.ts`'teki paylaşılan `apiUrl` yardımcısına çıkarıldı (`modelsUrl` onu kullanır); tek yapılandırma noktası korunuyor.
- TEL ŞEKLİ CANLI ÖLÇÜLDÜ (anahtarsız, gerçek 5.192 baytlık akış): rol deltası → `reasoning_content` deltaları → `content` deltaları → `finish_reason:'stop'` + `usage` (294/48/342, `estimated:true`) → `: x-omniroute-*` yorum satırları → `data: [DONE]`.
- DÜRÜSTLÜK (kabul kriterleri): HTTP 502/429 aynen gösterilir (anahtar yokluğu diye yorumlanmaz, `HTTP 502: bad_gateway` biçiminde durum + upstream detayı); yanıt METNİ olmayan koşu tamamlama SAYILMAZ (yalnız reasoning da yetmez — thinking bloğu cevap değildir), `finish_reason:'length'` ise gerçek sebep ('token bütçesi') yazılır; hata/abort'ta kısmi metin+reasoning KORUNUR (kalıcılık dilimi onu yazabilsin); terminal hatada `reader.cancel()` (yetim fetch kalmaz). Varsayılan `max_tokens` 4000 (REQ §2 tuzağı 1: küçük bütçe `content`'i boş bırakır).
- PROB: `free-runner.test.ts` **65/65** (ölçülen şekle birebir fixture; sınır testi: chunk'lar çok-baytlı karakter ve JSON satırı ORTASINDAN bölünüyor; 10 negatif kontrol). PTF: boş-metin dürüstlük kuralı `if (false && …)` ile mutasyona uğratıldı → prob **RC=1, 2 kırmızı**; geri alma md5 bayt-aynı.
- CANLI SADAKAT (kod sonrası, fixture ⊂ gerçek tel kanıtı): yazılan MODÜL gerçek uca karşı koşuldu (tek istek, anahtarsız) → `ok:true`, metin birebir `lokma live`, **579 karakter reasoning** deltası ayrıştırıldı, `finishReason:'stop'`, usage 294/169/463 (`estimated:true`), çözülen model `deepseek/deepseek-v4.1-flash`, 2.085 sn.
- KAPILAR: kök `bun x tsc --noEmit` 0 · sterilize web build yeşil · concept build yeşil · uygulama chunk'ı `index-CsWBliF3.js` DEĞİŞMEDİ (modül henüz import edilmiyor).
- SIRADA: dilim 3 (kalıcılık `origin:'client-free'`) + koşucunun UI bağlantısı (mevcut reducer çerçeveleri + `free` rozeti).
