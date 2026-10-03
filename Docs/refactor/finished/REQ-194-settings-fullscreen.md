# REQ-194 — Settings bölümleri tam ekran (full-screen) açılabilsin, en azından Models

**Status:** done
**Tarih:** 2026-10-03
**Kapanış commit'leri:** bc6948c (slice 1) · 902385f (slice 2) · 8ad5f48 (düzeltme) · e5ea527 (AST kapısı) · 3371ec7 (canlı prob)
**Kaynak:** Kullanıcı mesajı (3 Ekim 2026):
> "settings modeli daha büyük full screen gibi bişi olsun"

**İlişkiler:** REQ-163…167 (Settings bölümleşmesi) · REQ-193 (browser proxy). Kapsam bölüm bazında: **Models öncelikli**, kural tüm bölümlere uygulanır.

## Bugünkü durum (ölçülmüş, `file:line`)

1. **Modal sabit boyutlu:** `packages/lokma-web/web/src/components/settings/settings-modal.tsx:179` → `flex h-[640px] max-h-[85vh] w-full max-w-3xl …`. Yani **768px × 640px**, ekranın ne kadar büyük olursa olsun büyümüyor. Models bölümü 600+ model satırı listelediği için sürekli kaydırılıyor.
2. **Mevcut genişletme yolu yok:** bir `max-w`/`w-[Npx]` override'ı, "expand" düğmesi veya tam ekran modu bulunmuyor (grep sonucu: yalnız `:179` ve `:323`'te `min-w-[92px]`, o da nav etiketi için).
3. **Bölümler hazır:** `SETTINGS_SECTIONS` (`settings.ts:455-478`) 17 bölüm: admin, appearance, providers, models, agents, orchestration, permissions, mcp, vault, memory, cron, shortcuts, plugins, skills, about… — hepsi aynı 768px kabukta.

## Kapsam

1. **Tam ekran modu:** modal kabuğuna bir **büyütme** düğmesi (Lucide `Maximize2`/`Minimize2`, emoji yasak) → `w-screen h-screen max-w-none max-h-none rounded-none`; geri düğmesi ve `Esc` geri alır. İki durum arası **geçiş anında içerik yeniden ölçülür** (taşma/kaydırma düzelmesi için `ResizeObserver`).
2. **Kalıcılık:** tercih `localStorage` (`lokma-settings-fullscreen:v1`), reload'da korunur; "Reset layout" ile geri alınabilir.
3. **Bölüm bazlı açılış:** URL/snapshot ile **doğrudan Models'te tam ekran** açılabilir (`?settings=models&fullscreen=1`), rail/ikon girişleri de bunu destekler.
4. **Models özelinde:** tam ekranda liste **iki kolona** çıkar (kategori/panel solda, satırlar sağda) + güçlü arama (`/` kısayolu) + sağda **önizleme/özellik paneli** (kapasite, context, fiyat, sağlayıcı, id). Model listesi zaten `GET /api/models` (canlı 600+ satır REQ-130 notu).
5. **Klavye/erişilebilirlik:** odak hapsi tam ekranda da çalışır (mevcut `useFocusTrap`), `Esc` önce kapatır sonra moddan çıkar, `aria-expanded` düğmede.
6. **Diğer bölümler:** kural **tümüne** uygulanır (aynı kabuk), ama her bölüm ekranına özel iki-kolon kuralı yalnız Models'te — ölçüyü bozmamak için.
7. **Mobil:** tam ekran zaten tam ekran; düğme gizlenir (tek kolon).

## Kontrol (kabul kriterleri)

- Varsayılan **değişmez**: 768×640 (regresyon yok).
- Büyütme → modal `w-screen h-screen`; geri düğmesi/`.keyboard Esc` eski boyuta döner.
- Reload sonrası tercih korunur; Reset geri alır.
- Models tam ekranda iki kolon + `/` arama + sağda önizleme paneli; **600+ satırda** kaydırma akıcı (ilk/son satır ölçümü).
- `?settings=models&fullscreen=1` doğrudan o bölümü açar.
- 1500px ve 390px'te taşma yok.
- Kapılar: birim + tsc 0 + sterilize build + `pm2 restart lokma-web` + canlı bundle == disk + prob `scripts/probe-settings-fullscreen.cjs` (boyut ölçümü + reload kalıcılığı + Models iki kolon).

## Dokunulacak yerler

- `packages/lokma-web/web/src/components/settings/settings-modal.tsx` (`:179` kabuk + düğme + state)
- `packages/lokma-web/web/src/components/settings/settings.ts` (Models bölümü iki kolon)
- `packages/lokma-web/web/src/components/settings/index.ts` (export)
- `packages/lokma-web/web/src/stores/` veya `layout.ts` (snapshot alanı)

## Bitirme (done)

1. Kontroller PASS + prob + ekran görüntüsü.
2. Atomik İngilizce commit(ler) + push.
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index + `Docs/00`.

## Notlar

- **Write-only:** kod yazılmadı. Ekranlar bu REQ'e **ait değil** (browser hatası gösteriyor), bu yüzden ss eklenmedi — REQ-193'e eklendi.

## Slice 1 — full-screen kabuk (bc6948c)

Kapsam 1, 2, 3, 5 ve 6 **bitti**; kapsam 4 (Models iki kolon + önizleme) ve canlı prob sırada.

1. **Tek çözümleyici:** `settings.ts` `settingsShellClass(fullscreen)` iki kabuk geometrisinin tek sahibi. Varsayılan **hiç değişmedi** (`h-[640px] max-h-3xl` → 768×640; probe bunu geriye-dönük guard olarak ölçüyor), tam ekran `h-screen w-screen max-w-none` + köşesiz.
2. **Kalıcılık:** `lokma-settings-fullscreen:v1`, `"1"` = tam ekran. `readSettingsFullscreen`/`writeSettingsFullscreen` **enjekte edilebilir storage** alır (probe DOM'suz ölçüyor) ve storage bloklanmışsa varsayılan kabuğa düşüyor, patlamıyor.
3. **Düğme:** `Maximize2`/`Minimize2` (emoji yok), `aria-expanded`, `sm` altında **gizli** (Kapsam 7 — telefonda tam ekran zaten mevcut düzen).
4. **Esc sırası:** `useFocusTrap`'in `onEscape` callback'i önce tam ekrandan çıkıyor, ikinci basışta kapatıyor; kullanıcı büyük kutuda hapsolmaz (Kapsam 5'in "önce kapatır sonra moddan çıkar" cümlesi bu sırayla çeliştiği için dosyada ölçülebilir sıra yazılı).
5. **Yeniden ölçüm:** kabuk bir flex column, gövde kaydırmayı sahipleniyor; `ResizeObserver` panele bakıyor ve **window `resize` eventi** de yayıyor (container-query paneler + xterm ölçümü yeniden tetiklenir — `@container` bölümleri bunu kullanıyor, `ResizeObserver`'ı dinlemez). Toggle remount YAPMIYOR: açık arama alanı odakta kalıyor.
6. **Backdrop:** tam ekranda `bg-black/40` + `p-4` düşüyor ve backdrop tıklaması **kapatmıyor** (arkada açığa çıkacak bir şey yok, dolguya tıklayan formu bozmaz).
7. **Deep link (Kapsam 3):** `?settings=models&fullscreen=1` mount'ta bir kez okunuyor, sonra **parametreler URL'den siliniyor** — yeniden yükleme ya da paylaşılan çıplak URL tam ekran kutuyu tekrar açmıyor. `fullscreen=1` kalıcı tercihe yazılıyor, modal açılışta onu okuyan taraf.
8. **Reset layout:** `RESET_LAYOUT_EVENT` handler'ı (`workspace.tsx:389`) tercihi tiling snapshot'ıyla birlikte temizliyor — Kapsam 2'nin "Reset layout ile geri alınabilir" maddesi, ikinci bir düğme uydurmadan.

### Ölçüm

- `bun src/components/settings/settings-modal.test.ts` → **70 passed, 0 failed** (+37 yeni).
- `bun x tsc --noEmit` → **0 hata**.
- `env -u NODE_CHANNEL_FD -u NODE_ENV bun run build` → **built in 3.37s**, `index-CDbfNXGK.js` (683.77 kB).
- Canlı: `pm2 restart lokma-web` → servis edilen `assets/index-*.js` **disk ile aynı** (`index-CDbfNXGK.js`), `web=200`, `api /health=200`, login gate **ON** (`/api/auth/me` tokenless → 401).
- Yeni sembol demesi: `grep -c 'lokma-settings-fullscreen:v1' dist/assets/index-CDbfNXGK.js` = **1** (eski hash'lerde 0 — canlıya gerçekten çıkmış).
- `a11y.test.ts` → 48 passed / 4 failed; **4'ü de clean baseline'da aynı** (`git stash` ile doğrulandı): `single-chat-view.tsx:248` nameless button, dialog registry, `fullscreen-modal.tsx` + `pane.tsx` focus trap. Bu REQ'in regresyonu değil, ayrı iş.

### Kalan

- **Kapsam 4:** Models tam ekranda iki kolon (kategori/panel solda, satırlar sağda) + `/` arama kısayolu + sağda önizleme paneli (kapasite/context/fiyat/sağlayıcı/id). Not: mevcut `models-pane.tsx:147` satır listeyi `max-h-[320px] overflow-auto` ile **kendi içinde** kaydırıyor — tam ekranda bu sabit yükseklik kullanılmayacak, gövde kaydıracak.
- **Prob:** `scripts/probe-settings-fullscreen.cjs` (ölçüm + reload kalıcılık + Models iki kolon) + 1500px/390px taşma kontrolü.
- Kapsam 4 ölçülebilir bir düzen gerektirdiği için ayrı slice: önce iki kolonun düzeni, sonra ona `/` ve önizleme.

## Slice 2 — Models iki kolon + `/` + önizleme (902385f)

Düzen bitti; **prob ve ekran görüntüsü** sırada.

1. **Tek çözümleyici, geriye-dönük guard:** `models.ts` `modelsListClass(wide)` / `modelsListScrollClass(wide)` iki liste geometrisinin tek sahibi. `wide=false` **birebir** eski değerleri verir (`max-h-[320px] overflow-auto` dahil) — Inspector sekmesi/paneli `<ModelsPane />`'i prop'suz çağırıyor, yani o yüzeyler **hiç değişmedi**; prob bunu ayrı bir assert ile sabitler.
2. **Yükseklik zinciri:** tam ekranda `h-full` + gövde `flex flex-col overflow-hidden` → bölme grid'i gerçek bir kutu alıyor ve **kapaksız** kaydırma kuyusu (`h-full min-h-0 overflow-auto`) tüm yüksekliği kullanıyor. 600+ satırda liste artık 320px'lik bir kuyuda sıkışmıyor; kısa listede de altta boşluk kalmıyor. Diğer bölümler gövde kaydırmasını **olduğu gibi** bırakıyor (yalnız Models + yalnız tam ekran).
3. **Bölme:** `MODELS_SPLIT_CLASS` = `lg:grid-cols-[180px_minmax(0,1fr)_240px]` → solda sağlayıcı dizini, ortada satırlar, sağda önizleme. `lg` altında iki yan kolon `hidden`, yani 390px telefonda tam olarak eski tek kolon.
4. **Sağlayıcı dizini** `providerIndex(groups)` ile **aynı** gruplardan türüyor (sıralamayı ikinci kez yapmıyor; ikinci bir kopya kaydrı). Kapsama `null` = hepsi; **bilinmeyen** sağlayıcı **boş** liste veriyor, "her şey" değil — bayat bir seçim listeyi sessizce genişletemiyor.
5. **`/` kısayolu** `shouldFocusModelSearch(key, inEditable)` saf yardımcısı üzerinden: alan dışında `/` aramaya odaklanıyor, **içindeyse `/` literal kalıyor** (yola filtre yazmak bozulmaz). Prob iki yarıyı da doğruluyor.
6. **Önizleme paneli — dürüstlük kararı:** Kapsam 4 kapasite/context/fiyat istiyordu, **sunucu kataloğunda bu alanların hiçbiri yok** (`CatalogModel` = id/label/provider/enabled + REQ-183 `unsupported` bayrağı; bu pane portlandığından beri konseptin sahte "Ctx" sütununu bilerek taşımıyor). Uydurma sayı katalogun yalan söylemesi olurdu, o yüzden panel yalnız **gerçek** alanları gösteriyor: label, tam id, sağlayıcı, durum, sunucu desteği. Alanlar sağlayıcı feed'i onları getirdiğinde tek bir listeye (`modelPreviewRows`) eklenecek — prob `context|ctx|price|cost|token` etiketli **hiçbir** satır üretilmediğini sabitliyor.
7. **Seçili satır stili tam literal Tailwind sınıfı** (`bg-terracotta/10`) — `bg-${}` interpolasyonu v4'te hiç derlenmez, stil sessizce kaybolurdu (prob/skill tuzağı).
8. `modelRowKey` sağlayıcı-kapsamlı (`provider::id`): aynı id iki sağlayıcı altında var, DOM/store anahtarı çakışmasın.

### Ölçüm (slice 2)

- `bun src/components/providers/models.test.ts` → **66 passed, 0 failed** (+30; varsayılan geometri geriye-dönük guard'ı, kapsam boş-liste, `/` iki yarı, önizleme alanları dahil).
- `bun src/components/settings/settings-modal.test.ts` → **70 passed, 0 failed** (değişmedi).
- `bun x tsc --noEmit` (kök) → **0 hata**.
- `env -u NODE_CHANNEL_FD -u NODE_ENV bun run build` → **built in 4.03s**, `index-DpD-8Pw2.js` (684.66 kB).
- Canlı: `pm2 restart lokma-web` → servis edilen `assets/index-*.js` **disk ile aynı** (`index-DpD-8Pw2.js`), `web=200`, `api /health=200`, login gate **ON** (tokenless `/api/auth/me` → 401).
- Yeni sembol demesi: çözümleyiciler `index-DpD-8Pw2.js` içinde (`180px_minmax(0,1fr)_240px` → 1, `h-full min-h-0 overflow-auto` → 1, `min-h-0 overflow-hidden rounded-lg border border-line` → 1); lazy pane chunk'ında `models-pane-DG5Oj6Sp.js` beş `data-model*` hook'u → 1'er, **o chunk'ta `320px` = 0** (sabit kuyuk gerçekten gitti).
- `data-models-*` hook'ları index chunk'unda **değil** lazy `models-pane` chunk'ında — probe hook ararken önce doğru chunk'u `dist/index.html`'den türetmeli (eskiden `ls -t | head -1` ile yanan hata).
- Disk 97%'ydi: `emptyOutDir` kapalı olduğu için biriken **80 eski chunk (9.5 MiB)** silindi (24 saat penceresi, güncel chunk'lar `dist/index.html`'den doğrulandıktan sonra). `emptyOutDir` **kapalı kaldı**.

### Kalan

- **`scripts/probe-settings-fullscreen.cjs`** (canlı, login gate AÇIK kalmalı): shell ölçümü (768×640 varsayılan / tam ekran), reload kalıcılığı, Models üç kolon + `/` + önizleme paneli, 1500px ve 390px taşma kontrolü, ilk/son satır yükseklik farkı (600+ satırda akıcılık göstergesi). Mint'lenmiş superadmin token ile (prob `requireLogin`'ı **asla** açmıyor).
- Sonra: `Status: done` + `git mv` → `finished/` + README + `Docs/00` kapanışı.

## Slice 3 — canlı prob + GERÇEK ürün hatası (`8ad5f48`, `e5ea527`, `3371ec7`)

Düzen ölçülürken **slice 2'nin ekranda hiç görünmediği** ortaya çıktı: Models
bölmesinin orta kolonu **0px**'di.

1. **Kök neden:** `settings-modal.tsx:309-311` gövdenin üstündeki üç satırlık
   yorum **çıplak `//`** ile yazılmıştı. JSX **children** konumunda `//` yorum
   DEĞİLDİR — parser metin olarak saklar, yani 213 karakterlik bir text node
   DOM'a render edilir. Ölçüm: o text node `x=209..1458` (**1249px**), flex
   satırının **anonim flex öğesi** oluyor ve gövdeyi sağa itiyor (x=1467/1498).
   Sonuç: orta kolon `180px 0px 240px`, kaydırma kuyusu 86px, `overflowX=78`.
   `tsc` 0, 70 birim assert yeşil, build yeşil — **hiçbir render ölçümü
   dışında görünmez**. Düzeltme: yorum JSX yorum biçimine çevrildi (`8ad5f48`).
2. **Teşhis yolu (kuramsal değil, ölçüm):** ilk varsayım "flex `justify-content`"
   idi — `flex-start` zorlanınca dağılım **değişmedi**; `transform: none` ve
   `position: static` ölçüldü (yani görsel kayma değil, gerçek layout); aynı
   sınıflarla kurulmuş **klon** doğru dizildi (1290px) → sınıflar suçlu değil;
   `row.childNodes` üç eleman gösterdi: `NAV`, **`#text`**, `DIV`. Metin
   düğümünün ham içeriği **birebir yorumun kendisiydi**.
3. **Kalıcı kapı (`e5ea527`):** `scripts/audit-jsx-text-comments.cjs` — TypeScript
   AST'siyle **birebir** taraması. Satır sezgiseli denendi ve **başarısız
   oldu**: gerçek tek örneği **kaçırdı**, buna karşılık arrow-function gövdesi
   içindeki (JS bağlamında geçerli) üç yorumu **işaretledi**. AST'de yorumlar
   `JsxText` olmadığı için doğru yerde çıkmıyorlar; bulgu başına **exit 1**.
4. **Canlı prob (`3371ec7`):** `scripts/probe-settings-fullscreen.cjs` —
   **47 assert**, mint'lenmiş superadmin token ile (login gate **AÇIK**,
   `requireLogin` hiç çevrilmedi). Varsayılan 768×640 geriye-dönük guard, tam
   ekran viewport, Esc sırası (önce moddan çıkar, ikinci basışta kapanır),
   reload kalıcılığı, `?settings=models&fullscreen=1` + parametre silme, üç kolon
   + kapaksız kuyu, `/` kısayolunun **iki** yarısı, seçim → önizleme,
   önizlemenin `context|ctx|price|cost|token` **uydurmaması**, 1500px ve 390px
   taşma yok.
5. **Proven-to-fail (iki kapı, ikisi de ölçüldü):** `git show 902385f` ile
   **aynen** orijinal blok geri kondu → bundle `index-DpD-8Pw2.js` (yani
   yayınlanan hatalı hash), orta kolon yeniden **0px**, prob **rc=1**. AST kapısı
   da aynı mutasyonda **rc=1**. Düzeltilmiş dosya `md5sum` ile **bayt-aynı**
   geri alındı (`b4a840df…`), düzeltilmiş build'de ikisi de yeşil.

### Ölçüm (slice 3)

- Canlı prob **47/47 PASS**, `rc=0` (düzeltilmiş build).
- `bun src/components/settings/settings-modal.test.ts` → **70 passed** (değişmedi).
- `bun src/components/providers/models.test.ts` → **66 passed** (değişmedi).
- Kök `bun x tsc --noEmit` → **0 hata**.
- `env -u NODE_CHANNEL_FD -u NODE_ENV bun run build` → `index-JkClP2LT.js` (684.66 kB).
- Canlı: `pm2 restart lokma-web` → servis edilen == disk (`index-JkClP2LT.js`),
  `web=200`, `api /health=200`, login gate **ON** (tokenless `/api/auth/me` → **401**).
- Ölçülen düzelme: orta kolon `180px 0px 240px` → **`180px 806px 240px`**,
  kuyu `86px` → **`620px`**, `overflowX 78` → **`0`**.
- Ekran görüntüleri `/tmp/req194-fullscreen-general.png`,
  `/tmp/req194-models-fullscreen.png`, `/tmp/req194-models-390.png`
  (vision kredisi bittiği için kanıt **computed style** ölçümü; bu skill'in
  "computed style, ekran görüntüsü değil" kuralı gereği).

### Ölçülen iki prob kusuru (ürün hatası **değil**)

- `modelsInfo()` yardımcısı `data-models-pane` kancasına bağlıydı; o nitelik
  **yalnız wide modda** var (`wide ? 'wide' : undefined` nitelik basmaz), yani
  küçük kabuk kontrolleri **var olmayan** bir pane ölçüyordu ("no models pane").
  Yardımcı artık daima render edilen `data-models-scroll`'a bakıyor, kancanın
  kendisi olduğu durum kimlikle çözülüyor.
- 390px taşma kontrolü **backdrop** öğesini ölçüyordu; onun `clientWidth`'i
  viewport kaydırma çubuğu payını (390−5) içermiyor, dolayısıyla ürünün değil
  çubuğun 5px'ini "taşma" diye raporluyordu. Artık **içerik** kutuları
  (shell/body/list) ölçülüyor: `{"shell":0,"body":0,"list":0}`.

### Sonuç

Tüm kapsam (1-7) ve kabul kriterleri karşılandı; `Status: done`.
