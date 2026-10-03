# REQ-193 — Browser uzak sunucuda çalışsın: gerçek proxy ile localhost/pört tünelleme

**Status:** in-progress (slice 1-6 done: URL policy, HTML rewriter, upstream fetch, route wiring, pane wiring + the relative-ref fix it exposed, tunnel module + routes + the live-status defect it exposed)
**Tarih:** 2026-10-03
**Kaynak:** Kullanıcı mesajı (3 Ekim 2026):
> "browser tunnelleme pport tunneleme falan tam olarak çalışmıo lokma uzak suncuuda kuruluyorken"

Ekranlar: `upload_20261003_100701_3.png` + `upload_20261003_102102_4.png` (ikisi de aynı semptom, farklı boyut): Browser pane'de adres çubuğu `http://127.0.0.1:3014/`, altında `127.0.0.1 bağlanmayı reddetti.` + `Go` düğmesi.

**İlişkiler:** REQ-150/151/153 (browser embed + X-Frame-Options) · REQ-154/155 (browser engine) · REQ-194 (settings full-screen).

## Bugünkü durum (ölçülmüş, `file:line`)

1. **Tunnel/proxy katmanı **hiç yok.** `grep -rn "tunnel|ngrok|cloudflared|publicUrl|externalUrl|trycloudflare" packages/lokma-core/src packages/lokma-web/server/src` → **0 sonuç**. `packages/lokma-core/src/cloud/` yalnız `transfer.ts` (state export/import zip), `routes/cloud.ts` yalnız `/api/cloud/export` + `/api/cloud/import`. Yani "move-to-cloud" bir **dosya paketi**, bir **tunnel** değil.
2. **Browser pane URL'yi doğrudan iframe'e veriyor — proxy yok.** `packages/lokma-web/web/src/components/browser/browser-pane.tsx:349-351`: `<iframe src={frameSrc} …>`; `frameSrc` = `paneUrlFor(selected.url) ?? selected.url` (`:134`). Yani istemci tarayıcısı **o URL'e kendisi gidiyor**.
3. **Bu yüzden uzak kurulumda iki ayrı hata birden olur:**
   - `127.0.0.1` **istemcinin** kendi makinesidir, sunucununki değil → "bağlanmayı reddetti" (kullanıcının ekranındaki semptom tam olarak bu).
   - Sunucu tarafında engellenen siteler (`X-Frame-Options` / CSP `frame-ancestors`) iframe'i **yine** öldürür — REQ-153'teki `paneUrlFor` yalnız YouTube/Piped'i çözdü, genel çözüm yok.
4. **Tunnel olmadığı için ajanın browser engine'i bu sitede zaten ayrı yoldan gidiyor:** `packages/lokma-web/server/src/browser-engine.ts` gerçek Chromium ile geziyor (REQ-154) — yani **iki farklı tarayıcı yolu** var (istemci iframe + sunucu Playwright) ve uzak kurulumda ikisi de tutarsız davranıyor.

## Kapsam

0. **Yapılan dilimler (bu dosya kapanırken güncellenir):**
   - Slice 1 — `packages/lokma-core/src/browser/url-policy.ts` + `url-policy.test.ts` (51/51). Tek SSRF politikası: `http(s)` only, credential reddi, uzunluk cap'i, loopback/RFC1918/link-local/CGNAT/multicast literal reddi (DNS'siz, senkron), `LOKMA_BROWSER_LOCAL_HOSTS` allowlist'i (`host` ya da `host:port` → tek port açar). Commit `7a805de`.
   - Slice 2 — `packages/lokma-web/server/src/browser-proxy/rewrite.ts` + `rewrite.test.ts` (49/49). Tek yeniden yazan modül: `<base href>` injection, mutlu `src/href/poster/action` → proxy, `srcset/imagesrcset` aday aday, `ws:`/`wss:` → ws proxy, `data:/blob:/about:/mailto:/tel:/javascript:` dokunulmaz. Korumalı bölgeler (script/style/textarea içeriği + yorum) bayt-aynı; **açılış etiketi** ayrı yakalanır (aksi halde `<script src>` kendisi yeniden yazılmıyordu). Commit `1482746`.
   - Slice 3 — `packages/lokma-web/server/src/browser-proxy/fetch.ts` + `fetch.test.ts` (43/43). Upstream çekişi: **her redirect hop'ı yeniden doğrulanır** (302 → `169.254.169.254` reddedilir, ikinci hop hiç istenmez). Gövde content-type'a göre AYRI: `text/html` → rewrite, geri kalanı **byte** (latin-1/binary bozulmaz). Yanıt başlıkları **filtrelenir**: `X-Frame-Options`/CSP `frame-ancestors`/`Set-Cookie`/`Content-Encoding`/`Content-Length`/`Transfer-Encoding` düşer. İstek başlıkları **kurulur, iletilmez** (pane `cookie`/`authorization` hedefe gitmez). Commit `a6356f9`.
   - Slice 4 — `packages/lokma-web/server/src/browser-proxy/proxy-routes.ts` + `proxy-routes.test.ts` (23/23) + `app.ts` bağlantısı. **Slice 1-3'ün hiçbirini çağıran yoktu**: `GET /api/browser/proxy?url=…` 404 dönüyordu, yani uzak kurulumda ekrandaki hata duruyordu — pane hâlâ hedefi iframe'e doğrudan veriyor, `127.0.0.1` **kullanıcının** makinesine gidiyor. Mount edilen iki yarı: (a) **HTTP** — yanıt **sunucunun ağından** gelir + proxy `<base>` taşır, `X-Frame-Options`/CSP proxy'nin kendi origin'inde ölür (siteye özel durum gerekmez); gövde Fastify'ye **Buffer** olarak verilir, `Uint8Array` verilseydi JSON nesnesi olarak serileşir ve her görsel bozulurdu; `x-lokma-proxy-url` redirect zincirinin nereye indiğini pane'e söyler. (b) **Websocket** — `ws:`/`wss:` referansları zaten `/api/browser/ws`'e yeniden yazılıyordu ama o yol **yalnız string sabiti** idi, yani canlı sayfalar (HMR'li dev sunucu) proxy'de sessizce ölüydü; **aynı** politikayla mount edildi, yani socket http yolunun kapattığı deliği açamaz. Node 22'nin global `WebSocket`'i → ek bağımlılık yok. **Route bazında auth YOK**: yol `/api/*` altında, REQ-076 global gate'i zaten kapsıyor; iframe uygulamayla aynı origin'de, `lokma_token` cookie'si kendiliğinden gider (iframe Authorization header koyamaz ve koymamalı). Prob **yerel** stub upstream kullanır (asla internet), ve üç birim paketinin yapısal olarak örtemediği dikişi ölçer: route mount mu, framing/cookie başlıkları pane'e **ulaşıyor mu**, binary gövde byte-byte sağ mı, redirect hop raporlanıyor mu. SSRF kontrolünün **negatif kontrolü** vardır: allowlist boşaltılınca loopback de ölür — tek bir IP'nin engellendiğini gösteren kontrol, hiçbir şeyi engellemeyen politikada da geçer. Commit `ade9b70`.
   - Slice 5 — `web/src/components/browser/browser.ts` `frameSrcFor()` + `browser-pane.tsx` + `browser.test.ts` (51/51) + `server/scripts/probe-browser-proxy-allowlist.ts` (12/12). **Slice 1-4'ün hiçbirini çağıran yoktu**: pane iframe'e hedefi doğrudan veriyordu, yani `127.0.0.1:3014` **kullanıcının** tarayıcısına gidiyordu — ekrandaki hata tam olarak bu ve proxy'nin var olması işe yaramıyordu. Tek karar noktası `frameSrcFor()`: YouTube video native no-cookie embed'i, diğer YouTube sayfaları Piped'i tutar (**ikisi de native frame'liyor ve proxy'den daha iyi oynatıyor** — sıra bu yüzden embed → proxy, tersi değil), geri kalan her sayfa sunucudan çekilir. `Sunucu` çipi ikinci derece etkiyi görünür kılar: proxy'lenen sayfanın kendi çerezi yoktur, yoksa login sayfası sebepsiz döngüye girerdi.
     **Bu dilim bir GERÇEK ürün hatası buldu (commit `90c72a5`):** `<base href="/api/browser/proxy?url=…">` kök-göreli referansları (`/css/site.css`) **kapsamıyor** — HTML spec'e göre `/…` base'in **origin**'ine göre çözülür ve query'si düşer, yani sayfa kendi asset'ini **Lokma uygulamasından** ister (SPA fallback `index.html` + HTTP 200 döner: stil gider, linkler proxy'den çıkar). Slice 2'nin birim testleri **geçiyordu** çünkü hiçbiri render edilmiş bir belgeyi ölçmüyordu; "`<base>` kapsar" diyen assert'ler de aynı yanlış inancı kodluyordu — ikisi de düzeltildi, doğruluk kaynağı artık spec'in çözümleme kuralı ve hatanın durduğu yerde yazılı. `ws:` hedefler baytlarını korur (ws proxy yolu base'inde hedef taşımıyor, websocket url `<base>` üzerinden çözülmez).
     **Prob iki uçtan ölçer:** allowlist **açıkken** (12/12 — ref'ler yeniden yazıldı, `X-Frame-Options`/`Set-Cookie` düştü, binary gövde byte-byte sağ) ve allowlist **boşaltılınca aynı host reddedildi** — bu negatif kontrol olmadan "her şeyi reddeden" bir politika yukarıdaki tüm kontrolleri geçerdi. Canlı dağıtılmış süreçte ayrıca: route mount, SSRF (metadata IP + RFC1918 + `file:` → 400), login gate 401 (token'siz proxy dahil). Not: allowlist **kapalıyken** loopback canlıda 400 döner ve bu **tasarlanmış davranıştır** — prob eskiden 200 bekliyordu, yani yanlış bekleniyordu. Commit `045a5e9`.

   - Slice 6 — `packages/lokma-core/src/cloud/tunnel.ts` (31/31 birim) + `routes/cloud.ts` üç ucu + `server/scripts/probe-cloud-tunnel.ts` (20/20 canlı). **Kapsam 4 — tunnel (dışarıdan erişim).** Proxy'nin çözdüğü "pane hedefi sunucudan çeksin" yarısı ayrı; bu dilim diğer yarıyı kapatıyor: **bu kutunun kendisine** dışarıdan erişim. Modül tünel uygulamaz — kurulu olan binary'yi sürer (`cloudflared`, `ngrok`), yoksa **yapılandırılmışsa** `LOKMA_RELAY_URL`'deki relay'e düşer.
     **Dürüstlük sözleşmesi (kontrol 5) modülün kendi kuralı:** hiçbir dal `url` uyduramaz; tek `url` kaynağı provider'ın kendi stdout'unu ayrıştıran `parseProviderUrl`/`parseNgrokJsonUrl`'dir (loopback yankısını ve uzunluğu reddederler). Provider yok → `TunnelError` + kurulum cümlesi; url basmadan çıktı → `TunnelError`, sahte `*.trycloudflare.com` **yok**. `LOKMA_TUNNEL_PROVIDER` açıkça seçilmişse **kurulu değilse bile o istenir** — sessizce başka bir servis seçmek kullanıcının istemediği bir url'yi panele koyardı. Kayıtlı `running` ama pid ölmüşse **stopped** okunur (erişilemeyen tünel çalışan değildir). Relay token yalnız env'den, çağrı anında okunur; state dosyası **yalnız provider adı** yazar.
     **Bu dilim de bir GERÇEK ürün hatası buldu (commit `6f5036d`)** — ve bulunması ilginç, çünkü 27 birim assert'inin **hiçbiri** kırmızıya dönmedi: `persistState` `~/.lokma/tunnel.json` yolunu sabit kodluyordu, yani birim probu **canlı kurulumun** durum dosyasını gerçek bir sahte provider'ın hatasıyla ezdi (`state: error`, `provider: cloudflared`, *"exited without printing a public url"*). Her assert dönüş değeriyle ilgiliydi, baytların NEREYE düştüğüyle ilgili değildi. `LOKMA_TUNNEL_STATE` yolu şimdi **çağrı anında** çözüyor (modül yükleme anında yakalanırsa test env'i ayarlayamaz); iki prob da geçici dizine bakıyor ve birim prob sonunda **izolasyon kontrolü** var (geçici dosya VAR OLMALI) — env bir gün sessizce saygısız kalırsa diğer tüm kontroller geçerken yine eve yazardı. Probun yazdığı canlı dosya silindi: bu özellikten önce var olmayan bir durum dosyası test koşusundan sonra da var olmamalı.
     **Prob (canlı Fastify app'e karşı, 20/20) iki ölçümü varsayım olmaktan çıkarıyor:** (a) **token'sız 401 kontrolü her authed kontrolden ÖNCE** çalışıyor — sızan bir route dosyanın geri kalanına PASS olarak raporlanmasın diye; (b) gövdesiz POST `application/json` içerik-tipiyle geldiğinde Fastify'in kendi parser'ı `FST_ERR_CTP_EMPTY_JSON_BODY` ile reddediyor, handler'a hiç girmiyor (ilk prob koşusu bunu "route bozuk" sandı) — panel istemcisi ya gerçek gövde ya da içerik-tipsiz istek yollamalı. Yükleme **negatif kontrolü** yine taşıyıcı: hiçbir şey kurulu değilken start 501 + kurulum cümlesi döner ve yanıtta **`url` anahtarı hiç yok**. Login gate prob boyunca **AÇIK** (gerçek superadmin bearer basılıyor, `requireLogin` hiç çevrilmiyor). Commit `9660091` + `bedad87`, düzeltme `6f5036d`.

1. **Sunucu tarafı proxy ucu (tek yol, tüm iframe trafiği buradan):** `GET /api/browser/proxy?url=…` → sunucu hedefi **kendi ağından** çeker, HTML'i yeniden yazar (`<base>`, link/script/img kaynakları proxy'ye çevrilir) ve döner. Böylece:
   - `127.0.0.1:3014` **sunucudaki** port olur (istemci localhost'u değil) → ekrandaki hata çözülür;
   - istemci tarafında `X-Frame-Options` **anlamsızlaşır** (proxy kendi origin'inde döner).
2. **Kaynak yeniden yazma kuralı:** relative `/x.js` → `/api/browser/proxy?url=<base>/x.js`; mutlu kaynak → aynı kural; `ws://` → `ws` proxy; `data:`/`blob:` dokunulmaz. Yeniden yazanlar **tek modül** (`rewrite.ts`), ikinci uygulama yok.
3. **URL güvenliği (zorunlu, SSRF):** yalnız `http/https`; `localhost`/loopback/link-local/özel aralıklar **izinli** (sunucunun kendi hizmetleri — bu bir istisna, ama **yalnız** yapılandırılmış allowlist ile: `LOKMA_BROWSER_LOCAL_HOSTS`); aksi her şey reddedilir. `browser-engine.ts`'teki mevcut guard **aynı** uygulanır.
4. **Tunnel (dışarıdan erişim):** ayarlarda **"Share/tunnel"** bölümü — `lokma tunnel start|stop|status` CLI + sunucu ucu:
   - `cloudflared`/`ngrok` **varsa** onu kullanır (kurulu değilse dürüst mesaj + kurulum komutu),
   - yoksa **token'lı kendi relay'imiz** (`LOKMA_RELAY_URL`) — anahtar hiçbir dosyaya yazılmaz (env/credential store),
   - durum: aktif URL + sonlanma zamanı + yeniden bağlanma durumu, **panelde görünür**.
5. **Ajanın `open_browser` da proxy üzerinden açsın** (tek yol): `ui_action` frame'i proxy tablosunu işaret eder; engine ayrı kalsın (Playwright zaten sunucuda) ama **pane her zaman proxy URL'i gösterir**.
6. **Dürüstlük:** proxy/tunnel yoksa Browser pane **"Sunucuya bağlanılamıyor / tunnel kapalı"** der, boş beyaz iframe göstermez (bugünkü sessiz hata yasak).
7. **Çerez/oturum notu:** proxy kendi origin'inde döndüğü için `httponly` cookie'ler hedef-siteye **gitmez**; bu sınır **panelde yazılır** ("login gereken sayfalar harici sekmede aç").

## Kontrol (kabul kriterleri)

- Uzak kurulumda `127.0.0.1:3014` sunucunun portu olarak **açılır** (prob: uzak mod taklidi — istemci `localhost`'u kapalı, sunucu `curl` ile doğrular).
- X-Frame-Options gönderen site (youtube.com) proxy üzerinden **render edilir**; `paneUrlFor` özel durumu **gerekmiyor** ama mevcut davranış bozulmuyor.
- Relative kaynaklar proxy'ye yönlendirilir; konsolda 404/混合-content **yok**.
- Loopback/özel IP allowlist dışındaysa proxy **dürüst 400** döner (SSRF kanıtı: `169.254.169.254` reddi).
- Tunnel: `status` panelde gerçek URL gösterir; `stop` sonrası **dürüst** "kapalı"; sahte URL uydurulmaz.
- Login gereken sayfa: proxy'de boş form yerine **harici sekme yönlendirmesi** + açıklama.
- Kapılar: birim (`rewrite` + guard) + tsc 0 + sterilize build + `pm2 restart lokma-web` + canlı bundle == disk + prob `scripts/probe-browser-proxy-tunnel.cjs` (canlı: proxy getirir, X-Frame-Options site render, SSRF reddi, tunnel status).

## Dokunulacak yerler

- `packages/lokma-web/server/src/routes/browser.ts` (`/api/browser/proxy`, ws yükseltme)
- `packages/lokma-web/server/src/browser-engine.ts` (guard tek uygulama)
- `packages/lokma-web/web/src/components/browser/browser-pane.tsx` (`frameSrc` = proxy URL) + `browser.ts` (`paneUrlFor` geriye dönük)
- `packages/lokma-core/src/browser/` (URL politikası + tunnel durumu)
- Yeni: `packages/lokma-web/server/src/browser-proxy/rewrite.ts`, `packages/lokma-core/src/cloud/tunnel.ts`

## Kalan iş (slice 5 sonrası)

- **Kapsam 4 — tunnel: SUNUCU TARAFI TAMAM (slice 6), panel + CLI eksik.** Modül ve üç HTTP ucu yazıldı ve dürüstlük kuralı kanıtlandı (yukarıda). Kalan **yüzey**: `lokma tunnel start|stop|status` CLI komutu (`cli/index.ts` + `printHelp` satırı, `design` dalının dispatch kalıbı) ve ayarlardaki **"Share/tunnel"** bölümü — panel gerçek provider url'sini göstermeli, `stop` sonrası dürüst "kapalı", kurulum yoksa **kurulum komutu**. Sahte URL üretmek hâlâ yasak; ölçüm hazır: mevcut prob aynı yanıt şeklini doğruluyor, panel yalnız tüketici.
- **Kapsam 7 — çerez sınırı panelde:** `Sunucu` çipi etkiyi görünür kılıyor, ancak REQ madde 7 "login gereken sayfa harici sekmeye yönlendirilsin" diyor; bu bir davranış (link/buton), çip değil. Bu dalda browser pane'in **tek yüzeyi** olduğu için, panel eklenince 7 + 4'ün panel yüzeyi tek dosyada birleşebilir.
- **Kapsam 5 — ajan `open_browser` proxy üzerinden:** ajan zaten sunucu motorunu (Playwright) kullanıyor, yani kendi yolunda; pane tarafı bu dalda kapandı, `ui_action` işaretinin proxy tablosunu göstermesi gerekiyor.
- Ekran görüntüsü kapısı (`## Bitirme` madde 1) slice 5'te çalıştırılmadı — DOM/bundle/prob ölçümleri yeşil, görsel kanıt eksik.

## Bitirme (done)

1. Kontroller PASS + prob + ekran görüntüsü.
2. Atomik İngilizce commit(ler) + push.
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index + `Docs/00`.

## Notlar

- **Write-only:** kod yazılmadı. Ekranlar bu REQ'in kanıtı (`assets/REQ-193-ss1..2.png`).
- Kapsam notu: "tunnel" = **dışarıdan erişim** (uzak sunucuyu panelden açmak). `127.0.0.1` hatasının kendisi proxy ile çözülür (madde 1); tunnel bunu **tamamlıyor**, ikisi aynı iş değil.
