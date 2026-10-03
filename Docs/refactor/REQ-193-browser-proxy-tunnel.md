# REQ-193 — Browser uzak sunucuda çalışsın: gerçek proxy ile localhost/pört tünelleme

**Status:** pending
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

## Bitirme (done)

1. Kontroller PASS + prob + ekran görüntüsü.
2. Atomik İngilizce commit(ler) + push.
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index + `Docs/00`.

## Notlar

- **Write-only:** kod yazılmadı. Ekranlar bu REQ'in kanıtı (`assets/REQ-193-ss1..2.png`).
- Kapsam notu: "tunnel" = **dışarıdan erişim** (uzak sunucuyu panelden açmak). `127.0.0.1` hatasının kendisi proxy ile çözülür (madde 1); tunnel bunu **tamamlıyor**, ikisi aynı iş değil.
