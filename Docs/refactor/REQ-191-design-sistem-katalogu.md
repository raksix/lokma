# REQ-191 — Tasarım sistemi (branding) seçilebilsin: 151 paket gerçek listeye insin

**Status:** in-progress
**Tarih:** 2026-10-02
**Kaynak:** Kullanıcı mesajı (2 Ekim 2026):
> "+ tasarım skilleri falan ya da design branding falan seçeiblsin opendesgin de var onalrı yap"

**İlişkiler:** REQ-188 (composer'da System seçici) · REQ-190 (tweak) · REQ-192 (design skill'leri). OpenDesign araştırması: `Docs/raw/38-opendesign-ham-arastirma.md` §3.5 (151 paket + taksonomi) + `Docs/34-DESIGN-open-design-inspired.md` §5.

## Bugünkü durum (ölçülmüş)

1. **`GET /api/design/systems` var ama **sabit bir tablo** döner:** `packages/lokma-web/server/src/routes/design.ts:66-68` → `{ systems: Object.values(DESIGN_SYSTEM_META) }`. Bu sabit tablo OpenDesign'ın **katalog** değil, elle seçilmiş bir alt küme (kurulumda `~/.lokma/design/systems/` **yok**).
2. **UI'daki System seçici bu sabit listeyi gösteriyor** — `design-chat.tsx:123-125` `systemOptions`, `SelectMenu` etiketi "System". Yani seçilebilir ama **katalog değil, elle girdi**; kullanıcı Stripe/Linear/Claude/Figma gibi marka sistemlerini seçemiyor.
3. **Sözleşme hazır, uygulama yok:** `Docs/34` §5.1 paket sözleşmesini tanımlıyor — `manifest.json` + `DESIGN.md` + `tokens.css` (+ `USAGE.md`, `components.html`, `design-tokens.json`, `tailwind-v4.css`, `preview/`); kurulum yerine `~/.lokma/design/systems/<id>/`, `lokma design system add <url>` klonlar, `system use` `.lokma/DESIGN.md` + `tokens.css` kopyalar. **Hiçbir uç yok.**
4. **Taksonomi hazır:** OD kataloğunda Starter (default, warm-editorial), AI/LLM (claude, cohere, mistral, ollama, x-ai…), Developer Tools (cursor, vercel, linear-app, framer, expo, supabase, warp…), Productivity (notion, figma, miro, raycast…), Fintech (stripe, coinbase, binance, kraken, wise…), E-commerce (shopify, airbnb, uber, nike…), Media (spotify, playstation, meta…), Automotive (tesla, bmw, ferrari…), diğer (apple, ibm, nvidia, resend, spacex) — ~151 paket, taksonomi README'de kayıtlı.

## Kapsam

1. **Katalog ucu:** `GET /api/design/systems` **dizinden okusun** (`~/.lokma/design/systems/*/manifest.json`), katalog verilmezse mevcut `DESIGN_SYSTEM_META` **fallback** olarak çalışmaya devam etsin (geriye dönük). Yanıt: `[{ id, label, category, description, manifestUrl }]`.
2. **Taksonomi:** `category` ile gruplansın (SelectMenu `groups`, REQ-179 deseni — gruplu menü zaten var).
3. **Kurulum ucu:** `POST /api/design/systems` (`{ source: <url|path> }`) paketi klonlar/indirir; **SSRF guard** (loopback/özel/link-local red) + boyut sınırı (zip bomb) + yol jail'i — `browser-engine.ts`'teki guard'ın aynısı, ikinci uygulama yok.
4. **Aktifleştirme:** `POST /api/design/systems/:id/use` → seçili projenin `.lokma/DESIGN.md` + `tokens.css` dosyalarına kopyalar; **ozgü** olan kalır (klasör `tokens.css`, proje kökü `DESIGN.md`) ve **canlı üretimde okunur** (guard bunu zaten okuyor — `GET /api/design/guard`).
5. **Mevcut seçici gerçek listeyi gösterir:** `design-chat.tsx` `systemOptions` dizinden gelen katalogdan üretilir; seçim `generate` isteğinde `system` olarak gider ve **üretimde gerçekten uygulanır** (bugün `system` alanı formda taşınıyor ama doğrulanmadı).
6. **CLI:** `lokma design system list|add|use` (Docs/34 §5.1'deki sözleşme).
7. **Seçili sistem rozeti:** canvas'ta "System: Stripe 12" gibi bir rozet + değiştirme/iptal tek tıkla.

## Kontrol (kabul kriterleri)

- `GET /api/design/systems` gerçek katalog döner (≥1 paket, `manifest.json` okunmuş); dizin yoksa fallback listesi **aynen** çalışır.
- Seçici gruplu (taksonomi başlıkları görünür), arama kutusu katalogda çalışır.
- `add` → kurulum → `use` → seçili projede `.lokma/DESIGN.md` + `tokens.css` **dosya sisteminde** doğrulanır.
- Üretimde **o** sistemin token'ları HTML'e giriyor (prob: üretilen CSS'te beklenen token/renk adı).
- SSRF: loopback/özel IP ile `add` reddedilir; zip bomb boyut sınırı çalışır.
- Bozuk `manifest.json` paketi katalogu bozmaz (dürüst `status`).
- Kapılar: yeni birim testleri + tsc 0 + sterilize build + pm2 restart + canlı bundle == disk + prob `scripts/probe-design-system-catalog.cjs`.

## Dokunulacak yerler

- `packages/lokma-core/src/design/` (yeni `systems.ts`: dizin tarama + manifest doğrulama + use/install)
- `packages/lokma-web/server/src/routes/design.ts` (`:66` ucu dizine geçsin + `POST` uçları)
- `packages/lokma-web/web/src/components/design/design-chat.tsx` (`systemOptions`)
- `packages/lokma-core/src/cli/` (alt komut)

## Bitirme (done)

1. Kontroller PASS + prob + ekran görüntüsü.
2. Atomik İngilizce commit(ler) + push.
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index + `Docs/00`.

## Notlar

- **Write-only:** kod yazılmadı.
- Sıra: REQ-190 (tweak) önce, REQ-191 sonra — çünkü tweak'in token/renk düzenleme yüzeyleri katalogdan besleniyor.

## Dilim kaydı (slice log)

### Dilim 1 — çekirdek katalog (`dbb3994`)

`packages/lokma-core/src/design/systems.ts` (yeni) + `systems.test.ts` + `index.ts` dışa aktarımı.

- **Katalog tarama:** `listDesignSystems()` `~/.lokma/design/systems/*/manifest.json` dizinini okur; `source: 'catalog' | 'bundled'` **dürüstlük kanalı** — dizin boşken bugünkü 4 kart `origin: 'bundled'` etiketiyle döner, katalog varmış gibi görünmez.
- **Taksonomi:** `normalizeSystemCategory()` OpenDesign başlıklarını (`Starter`…`Other`) eşler; `e_commerce` / `AI & LLM` gibi varyantlar ve bilinmeyen başlıklar `Other`'a düşer (sıralamasız grup uydurmaz).
- **Bozuk paket kataloğu bozmaz:** `parseSystemManifest()` ayrım sonucu (discriminated union) döner; okunamayan paket `status: 'invalid'` + `problem` ile **listelenir**, kaybolmaz.
- **SSRF:** `assertInstallSource()` — `marketplace.ts`'teki `isPrivateHost` kalıbı, **genişletilmiş**: link-local (`169.254.0.0/16` — bulut metadata sıçraması) ve CGNAT (`100.64/10`) de reddedilir; `172.15`/`172.32` özel blok dışı olduğu için **serbest** (bulan üst/alt sınır testleriyle kanıtlandı). İkinci guard uygulaması yok.
- **Kurulum:** `installDesignSystem()` yerel yol kopyalar / https `git clone --depth 1`. Manifest'ı okunamayan paket **geri alınır** (yarım paket satırı kalmasın diye); var olan id → 409.
- **Aktifleştirme:** `useDesignSystem()` paketin `DESIGN.md` + `tokens.css` dosyasını projenin `.lokma/` klasörüne kopyalar — `GET /api/design/guard` **zaten tam olarak bu yolu okuyor**, yani ikinci bir okuyucu yazılmadan üretimde görünür. Cezaevi paket **dizini**: id paterni + çözülmüş yolun katalog kökü içinde kalması.
- **Ölçülen tuzak:** `os.homedir()` runtime'da **önbellekli** — probe içinde `process.env.HOME` değiştirmek onu taşımıyor. Bu yüzden katalog kökü `rootOverride` ile **açıkça enjekte** ediliyor; aksi halde test gerçek `~/.lokma`'ya yazardı (kontrol: probe sonrası `/root/.lokma/design/` altında `systems/` yok).

**Kapılar:** birim probu **100/100** · `tsc --noEmit` **0** · sterilize concept build yeşil · mevcut `store.test.ts` **27/27** etkilenmedi.

**Kalan (sonraki dilimler):** sunucu uçları (`GET` dizinden + `POST` kurulum + `POST :id/use`) → `design-chat.tsx` gruplu/arama'lı seçici + sistem rozeti → CLI `lokma design system list|add|use` → `scripts/probe-design-system-catalog.cjs` canlı probu (kapı `prob` maddesi).

### Dilim 2 — sunucu uçları + seçici + token çözümleyici (`931c3eb`, `5262371`)

Dilim 1 katalogu **yazdı**; bu dilim ona **ulaşılabilirlik** ve asıl kabul kriterini verdi: *"Üretimde o sistemin token'ları HTML'e giriyor."*

**Sunucu:**
- `GET /api/design/systems` artık `listDesignSystems()` sonucunu yayıyor (`count`/`source`/`root`/`categories`) — istemci katalog mu fallback mı gördüğünü **tahmin etmiyor, okuyor**.
- `POST /api/design/systems { source }` → **201 Created** (prob eski 200'ü bekliyordu; dilim değiştirdi, prob da güncellendi).
- `POST /api/design/systems/:id/use { cwd }` → paketi projenin `.lokma/` klasörüne yazar; `GET /api/design/guard` **zaten aynı dosyaları okuyor**, ikinci okuyucu yazılmadı.
- İki yeni uç plugin kataloğuna da işlendi (REQ-130'ın `documented!` benimseme kapısı bildirilmiş uçları sayıyor).

**Üretim — asıl neden:** `DesignSystem` kapalı bir union'dı; paket id'leri için **açmak** zorundaydı ve 4 girdili bir tabloya parantezsiz indekslemek `undefined` verir — yani prompt **arka plan rengi olarak `undefined` basar**. Üç ayrı `DESIGN_SYSTEM_META[req.system]` okuması tek yerinde toplandı:
- `resolveSystemTokens()` (async, diski okur) + `buildBundledResolved()` (sync, saf prompt builder'ları için) — `generate.ts`/`tweak.ts`'in mevcut sync birim probları bozulmadan korundu.
- `store.ts` seçilen sistemi **bir kez** çözüp gerçek model çağrısına veriyor → paketin kendi `tokens.css`'i üretilen stil katmanına giriyor.
- Bilinmeyen id `hasTokens:false` döner ve prompt paleti **uydurmaz**, bunun yerine "token tablosu yok" der.
- `SYSTEM_ID_PATTERN` artık `store.ts` ile **paylaşılıyor** (kopyalanmadı — kayan bir jail yol-kaçış deliğidir).

**İstemci:**
- System seçici canlı katalogdan **taksonomiye göre gruplu** + **aranabilir**; fallback satırları `(preset)` etiketiyle görünür, paket gibi sunulmaz.
- `SelectMenu`'ya **opt-in** `searchable` modu eklendi (varsayılan kapalı, mevcut çağıranların hiçbiri etkilenmez): filtre hem düz options hem grup gövdelerini daraltır, boşalan grup başlığını düşürür, "No matches" yazar, kapanışta sıfırlanır.
- `validateGenerateForm` + sayfa snapshot'ı artık üyelik değil **id şeklini** denetliyor — yoksa seçici, gönderilemeyecek bir sistem teklif ederdi.

**Ölçülen tuzak (prob buldu, unit bulamadı):** arama kutusunda **Space** basmak listbox handler'ına bubble oluyor, vurgulu satırı commit edip menüyü kapatıyordu ("boşluk yazınca sistem seçiliyor"). Tek `stopPropagation` ile kapandı.

**Kapılar:** `tsc` **0** · core systems **111/111** (13 yeni çözümleyici iddiası) · generate 24 · tweak 44 · store 27 · web design **117/117** · design-slash yeşil · sunucu + web build yeşil · `probe-design-system-catalog.cjs` **25/25** canlı · `probe-design-system-picker.cjs` **10/10** canlı tarayıcı · servis edilen bundle == disk (`index-BPUMVPL8.js`) · kapı **ON** kaldı (anon `/api/auth/me` → 401) · prob paketleri silindi, katalog dürüstçe `bundled`'a döndü.

**Ölü ölçüm notu:** `probe-design-page.cjs`'de 4 hata var (chrome toggles / tabs / generate) — **REQ-191'den önce de aynı 4 hata** (6da95e4 worktree'sinde doğrulandı), sebebi bayattaki `lokma:sessionId` → 404; bu dilimin regresyonu **değil**, dokunulmadı.

**Kalan:** sistem rozeti (canvas'ta "System: X" + tek tıkla değiştir/iptal) + CLI `lokma design system list|add|use` + üretimde token'ın CSS'e girdiğinin gerçek model çağrısıyla kanıtı (capture stub).
