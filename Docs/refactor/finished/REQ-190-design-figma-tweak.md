# REQ-190 — Figma gibi düzenleme: seçili öğeyi içerikten düzenle (canvas tweak)

**Status:** done
**Tarih:** 2026-10-02 (closed 2026-10-03)
**Kaynak:** Kullanıcı mesajı (2 Ekim 2026):
> "figma gibi düzneleme falan da yapabilen opendesign araştır ekle request olarak bunları"

**İlişkiler:** REQ-189 (artifacts paneli) · REQ-188 (composer) · REQ-191/192 (sistem + skill seçimi). OpenDesign araştırması: `Docs/raw/38-opendesign-ham-arastirma.md` §2.4 ("Question forms, critique, tweaks") + `Docs/34-DESIGN-open-design-inspired.md` §6.

## Bugünkü durum (ölçülmüş)

1. **Bugün düzenleme = artifact'ın tamamını yeniden üretmek.** Design üretim tek akış: brief → `POST /api/design/generate` → yeni artifact. `POST /api/design/:id/critique` yalnız **puanlama** döner, **düzeltme yapmaz**. Yani "şu butonu mavi yap" isteği için kullanıcı yeni brief yazmak zorunda.
2. **Mevcut düzenleme yüzeyi dar:** `PUT /api/design/:id` (`design.ts:93`) HTML'yi elle kaydeder; UI'da "Code" sekmesi bunu gösterir (REQ-172).
3. **OpenDesign'ın yaptığı:** tweaks are *questions* — kullanıcı kısa bir değişiklik cümlesi yazar, ajan mevcut artifact üzerinde **yamalı üretim** yapar (yeniden sıfırdan değil). Ham araştırma notu bunu §2.4'te açıkça tarif ediyor; DESIGN.md'te "Figma alternatifi konumlanması" var.
4. **Çıplak tuşak:** artifact'lar `~/.lokma/design/artifacts/<id>/` altında dosya; bir tweak sonrası **yeni id** üretilirse liste çoğalır ve eski tasarım "kaybolur" gibi görünür (REQ-178'in izolasyon disipliniyle aynı).

## Kapsam

1. **Tweak akışı (tek yol):** seçili artifact + kısa değişiklik cümlesi → `POST /api/design/:id/tweak` → ajan **mevcut HTML'i** okuyup yamalı yeni sürüm üretir. Çıktı **aynı artifact'ın yeni versiyonu** olur (`versions[]`), ayrı id **yaratmaz**.
2. **Versiyon geçmişi:** her artifact'ta `versions[]` (html + zaman + özet + tweak metni); artboard'ta versiyon seçici (SelectMenu) + "önceki sürüme dön" — **geri alınabilir** düzenleme.
3. **Görsel düzenleme yüzeyleri (Figma tadı, kapsamı sınırlı):** düzenlenebilir alanlar = `type`, `system`, `model`, `palette`/token, `density`, `content` (metin bloğu). Her biri için **tek** kontrol (SelectMenu/alan) + "Ask the agent" serbest metin yolu.
4. **Ajan yaması sözleşmesi:** tweak isteğinde **mevcut HTML'in tamamı** gitmez (token patlar); ajan önce hedefi okur, yalnız **değişen bölümü** yazar; `expectedSha` ile koruma (dosya araçlarındaki desen).
5. **Kritik/doğrulama:** üretim sonrası bir denetim turu (birim/paket/taşma) ve **eski tasarım bozulmadı** kontrolü; hata durumunda eski sürüm korunur (kısmi yazım yasak — REQ-183'teki "sessiz sahte-iyi sonuç yasak" ilkesi).
6. **MCP/skill çıktısı:** bu akış REQ-192'deki Design skill'inin bir yeteneği olarak da tanımlanır.

## Kontrol (kabul kriterleri)

- "butonu terracotta yap" → **aynı** artifact'ta yeni versiyon; liste sayısı **değişmez**; eski HTML korunur.
- Versiyon seçici: eski sürüne dön → canvas eski haline döner; ileri dön.
- Her düzenlenebilir alan bir kez değişince gerçek HTML'e yansır (prob `PUT`/`tweak` gövdesini + yeniden render'ı ölçer).
- Bozuk/eksik artifact'ta tweak **dürüst hata** verir, mevcut sürümü bozmaz.
- Prompt uzunluğu tavana takılır (tüm HTML gitmez), `expectedSha` koruması çalışır.
- Kapılar: design birimleri yeşil (yeni tweak testleri), tsc 0, sterilize build, pm2 restart, canlı bundle == disk, prob `scripts/probe-design-tweak-versions.cjs`.

## Dokunulacak yerler

- `packages/lokma-core/src/design/store.ts` (artifact şeması + `versions[]`), `generate.ts`
- `packages/lokma-web/server/src/routes/design.ts` (`POST /api/design/:id/tweak`, `GET .../versions`)
- `packages/lokma-web/web/src/components/design/*` (versiyon seçici + düzenleme yüzeyleri)
- `packages/lokma-shared` transcript/artifact şeması (yeni alanlar → **zod validator** alanı taşımak zorunda)

## Bitirme (done)

1. Kontroller PASS + prob + ekran görüntüsü.
2. Atomik İngilizce commit(ler) + push.
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index + `Docs/00`.

## Notlar

- **Write-only:** kod yazılmadı.
- Kapsam disiplini: "Figma gibi" **kanvas editörü** anlamına gelmez — OpenDesign'ın kendi konumu pixel'lerin kod olduğu yönünde. Bu REQ onu korur; sürükle-bırak resim editörü kapsam **dışıdır**.

## Uygulama ilerlemesi (worker)

### Tur 1/5 — sürüm defteri (`2288a19`)

Çekirdek katman hazır; UI ve route sonraki turlarda.

- `DesignVersion` + `manifest.versions[]` (en eski önce). Emekli gövde `versions/<sha8>.html`'e arşivlenir, **güncel** gövde `artifact.html`'de kalır — mevcut okuma yolları **hiç değişmez** (`store.ts:persist`).
- **Yazmadan ÖNCE arşivle**, üstelik kayıtlı sha'ya karşı doğrulanarak: bir ledger girdisi asla yazılmamış bir dosyayı gösteremez, elle bozulmuş bir manifest yanlış isimle arşivleyemez.
- `appendArtifactVersion()` tek append yolu: tweak **aynı** artifact id'sine yeni sürüm olarak düşer → liste sayısı büyümez.
- `expectedSha` kilidi (tweak + Code sekmesi yazmaları) `sha256Hex`'i (files modülü) yeniden kullanır; eski değer `stale_version` **409**, sessiz üzerine yazma yok.
- `revertArtifact()` eski gövdeyi **yeni `revert` girdisi olarak ekler** (yok etmez) → ileri dön = bir revert daha. Gövdesi silinmiş girdi `version_body_missing` 409 verir, artifact **bozulmaz**.
- `listArtifacts()` satırları zayıf (`versionCount` + `currentVersion`, ledger dizisi yok); `getArtifact()` `sha` + `currentVersion` ekler.
- REQ-190 öncesi artifact (ledgersız) okunur ve **dürüstçe** v0 / boş geçmişmi bildirir (uydurma v1 yok); ilk düzenlemesi v1 ile başlar.

Birim: `versions.test.ts` **53/53** (ledger, yazmadan-önce-arşivle, 409 kilidi, revert, cap budama, legacy bozulma). Mevcut `store.test.ts` 27/27 + `generate.test.ts` 24/24 yeşil kaldı. `lokma-core` dist yeniden derlendi (sunucu `dist`'ten çözüyor); server typecheck 0.

**Kalan:** `POST /api/design/:id/tweak` ucu (ajan yama üretimi + `expectedSha` koruması) → versiyon seçici/geri alma UI'ı → düzenlenebilir alan yüzeyleri (type/system/model/token/density/content) → `packages/lokma-shared` transcript/artifact alanları → `scripts/probe-design-tweak-versions.cjs`.

### Tur 3/5 — tweak ucu + yama üretimi (`edd453f`)

Agent yamaları hazır; UI ve düzenlenebilir alan yüzeyleri sonraki turlarda.

- `POST /api/design/:id/tweak` + `GET .../versions` + `POST .../revert` ucu canlıda. Tweak **aynı** artifact id'sine yeni sürüm olarak düşer; liste büyümez.
- **Token sözleşmesi ölçülüyor:** belge 24K altındaysa **tamamı** gider (tek yeniden yazım); üstündeyse model hedef **indeksini** görür (başlık + 1.2K önizleme + bayt) ve yalnız **değişen bölümü** yazar. Böylece prompt büyüklüğü artifact boyutuna bağlı **değil**.
- Belge H2'lere bölünür ve **tam bayt offsetleri** taşır → `applyTweakedSections` dokunulmayan bölümleri **harf harf** kopyalar; modelin değiştirmediği markup sessizce yeniden yazılamaz.
- Yama işaretleri **HTML yorumu** (`<!--lokma:section 3-->`): sızarsa inert olur. Yarım kapanan, numarası tutmayan, çift gelen, **olmayan bölümü** hedefleyen veya hiçbir şey değiştirmeyen yanıt **typed DesignError** atar — mevcut sürüm **bozulmaz**, kısmi yazım yok (REQ-183).
- `expectedSha` **iki kez** kilit: metered model çağrısından **önce** (bayat panel kredi yakmasın) ve yazma anında (eşzamanlı yazma → 409).
- **DRY düzeltmesi:** `model-call.ts` model taşımasını `generate.ts`'ten çıkardı (provider çözümleme, streaming, timeout, hata eşleme tek yer). Bağımlılık **tek yönlü** — generate taşımayı import eder, tersi değil; ilk denemede oluşan döngü bu yüzden kırıldı.
- Birim: `tweak.test.ts` **44/44** (offset sözleşmesi "baş + bölümler girdiyi birebir yeniden kurar", prompt tavanı, her reddediliş **kendi code/status**'uyla, splice kuyruk kaybı). Mevcut süitler yeşil kaldı: generate **24**, versions **53**, store **27** (taşıma çıkarımının regresyon kanıtı). tsc 0, sunucu build, web build.

**Canlı doğrulama (dağıtılmış sunucu, gerçek token):** generate v1'i `origin=generate` ile tohumluyor · notsuz tweak → 400 `bad_tweak` · bayat sha → **model çağrısından önce** 409 `stale_version` · ikisinden sonra sürüm sayısı **değişmiyor** · revert eksik gövdeyi dürüstçe 409, bilinmeyen sürümü 404 · prob artifact silindi ve 404 kaldı · tokenless `/api/auth/me` **401** (giriş kapısı kapalı).

**Not — ölçüm disiplini:** `pm2 restart lokma-server` sırasında sunucu çöktü (`parse.ts` içinde kardeş oturumun REQ-196 dosyasında çift `ZW_RE` bildirimi). Bu **benim** alanım değildi; dosya o arada kendiliğinden düzeldi, core dist yeniden derlenip sunucu **online + /health 200** ile ayağa kalktı. Kardeşin `tools/parse.*` değişikliklerine **dokunulmadı** ve commitime **swept edilmedi** — işte HEAD'te kendi hunk'larıyla duruyorlar. Kardeşin kendi `parse.test.ts` probunda 1 assertion hâlâ kırmızı (`path is a clean filename`), o da benim REQ'im değil.

**Kalan:** versiyon seçici/geri alma UI'ı (artboard) → düzenlenebilir alan yüzeyleri (type/system/model/token/density/content) → `packages/lokma-shared` transcript/artifact alanları → `scripts/probe-design-tweak-versions.cjs` (tarayıcı UA'sız, sadece REST sözleşmesi ölçen).

### Tur 4/5 — tweak + sürüm seçici arayüzü (`d021f73`)

Çekirdek defter (`2288a19`) ve tweak ucu (`edd453f`) üstüne arayüz yarısı.

- **VersionsDrawer:** kısa değişiklik cümlesi + History seçici; Lucide `History`
  araç çubuğu düğmesinde sürüm sayısı rozeti. Tweak **aynı** artifact id'sine
  yeni sürüm olarak düşer → liste büyümez, eski gövde geri alınabilir.
- `useDesignStudio` defteri kendi istek-sıra numarasıyla tutuyor — yavaş bir
  history cevabı gövde yüklemesini iptal edemiyor (REQ-168'de liste/detay için
  yaşanan tuzağın aynısı, tek sayaç burada da işe yaramazdı). `runTweak` gövde +
  defter + listeyi yeniden okuyor; `runRevert` de öyle ve sunucunun yeni
  manifest'ini detaya yansıtıyor. 409 `stale_version` ikisini de tazeler.
- `runTweak` cümleyi ancak sunucu kabul ETTİKTEN SONRA temizliyor → başarısız
  tweak'te metin yerinde kalıyor, tekrar denenebilir. Tekrar giriş koruması
  **ref** (her çağrı metered model turu harcıyor).
- Artifact silinince veya proje değişince defter + not + hata temizleniyor —
  bayat defter başka projenin tasarımına bu artifact'in geçmişini etiketler.
- Saf yardımcılar `design.ts`: `validateTweakNote` (metered çağrıdan ÖNCE boş
  not reddi), `versionLabel` (mevcut girdi işaretli, puan varsa yazılı — `null`
  yazılmıyor), `canRevertTo` (ledger'da olmayan sürüm + ekranda görünen sürüm
  reddedilir → sunucunun 404'üne yol açan tıklama imkânsız), `versionAfterRevert`.
- **Dürüst boş durum:** REQ-190 öncesi artifact `versions: []` + `currentVersion: 0`
  döner → seçici uydurma v1 değil, "No history yet" çizer.

Kanıt: `design.test.ts` **85/85** (63'ten; yeni blok 22 kontrol) · proven-to-fail:
`canRevertTo`'ı yalnız indeks kontrolüne mutasyona uğratmak suite'i iki ledger
assertion'ında kırmızıya düşürüyor, geri alma **md5 birebir** ve yeşil · kök
`bun x tsc --noEmit` **0** · sterilize web build yeşil (`index-BnfA_NWQ.js`) ·
`pm2 restart lokma-web` sonrası servis edilen bundle == disk, chunk'ta
`data-design-versions-toggle` **1** kez, tokenless `/api/auth/me` **401** (kapı
AÇIK kalmadı).

**Kalan:** düzenlenebilir alan yüzeyleri (type/system/model/token/density/content)
→ `packages/lokma-shared` transcript/artifact alanları (yeni alan zod validator'ı
taşımak zorunda) → `scripts/probe-design-tweak-versions.cjs` (tarayıcı UA'sız,
yalnız REST sözleşmesi ölçen; 409/stale + liste sayısı değişmez + revert
dürüstlüğü).

### Tur 5/5 — ölçülmüş kusur: `expectedSha` yalnız **tweak** yolundaydı (`52ddc44`, `e396328`)

Prob yazılırken ölçülen iki bulgu — biri **yanlış beyan**, biri REQ'in kendi
kabul kapısı.

**1. Doküman yeşil yalan söylüyordu.** Tur 1 "Code sekmesi yazmaları" için de
`expectedSha` kilidini yazılı sayıyordu; ölçüm bunun **yanlış** olduğunu
gösterdi: `PUT /api/design/:id` gövdeden yalnız `body.cwd` okuyor, `expectedSha`
düşüyor (`updateArtifactHtml`'in 4. argümanı hep `undefined`); istemci
`saveDesignHtml`'e hiç parametre geçmiyor; `runTweak` de `expectedSha` **göndermiyor**.
Sonuç: UI'dan **hiçbir** yoldan 409 `stale_version` üretilemezdi — kilit yalnız
elle yazılmış bir istekte çalışırdı. Code sekmesi, tweak/revert ile değişmiş
bir gövdenin **üstüne sessizce** yazıyor, kullanıcının hiç görmediği bir sürümün
üzerine `edit` girdisi ekliyordu.

- Uç `body.expectedSha`'yı iletir; `updateArtifactHtml` yazdığı sha'yı + `currentVersion`'ı
  döndürür (bir sonraki yazmanın taze token'ı).
- `saveDesignHtml` opsiyonel `expectedSha` alır; `SaveDesignRes` `sha`/`currentVersion` taşır.
- Stüdyo yüklenen gövdenin sha'sını **`ref`**'te tutar (`detailShaRef`) — state
  olsaydı bir yazma pane'i yeniden render ederdi — ve **iki** yazma yoluna da
  gönderir. Token gövde her düştüğünde (yükleme, silme, proje değişimi) temizlenir:
  başka artifact'a taşınmış bir sha, oradaki ilk yazmayı garanti 409 yapardı.

**2. Prob — REQ'in kendi kabul kapısı.** Üç dilim birim testleriyle geldi, yani
**dağıtılmış** sunucunun davranışını ölçen hiçbir şey yoktu; yukarıdaki boşluk
iki tur hayatta kaldı. `scripts/probe-design-tweak-versions.cjs` canlı REST'i
tarayıcısız ve **model maliyeti olmadan** ölçer (offline-template sentinel'i):
tek sha üzerinde anlaşma · edit'in id'yi koruması + listeyi büyütmemesi ·
emekli gövdenin bayt-aynı arşivlenmesi · bayat sha'nın **reddi** + aynı yazmanın
güncel sha ile **kabulü** · metered yolun dürüst reddi (sürüm üretmeden) ·
revert'in bayt-aynı geri dönmesi ve **eklenerek** kaydedilmesi · kötü hedeflerin
dürüst hataları · silinmiş arşiv gövdesinin 409 vermesi · temizlik + kapının
**401** kalması.

**Kanıt:** canlı **52/52** (`/tmp/lokma-req190/summary.json`) · **proven-to-fail:**
PUT rotasından `expectedSha` düşürülünce koşu 23. kontrolde kırmızıya düşüyor
(`D: a stale-sha write is refused 409 stale_version`) → kapı yalnız rotanın
*varlığını* değil **kilit davranışını** ölçüyor; mutasyon `git diff` boş kalacak
şekilde **bayt-aynı** geri alındı. Kök `bun x tsc --noEmit` **0** · sterilize
server + core + web build · `pm2 restart` ikisi · servis edilen bundle == disk
(`index-CB4KPKko.js`).

**Kapsam düzeltmesi (ölçülen, varsayım değil):** Kapsam §4'teki
"`packages/lokma-shared` transcript/artifact şeması" maddesi **geçersiz** —
Design yüzeyi **hiçbir** zod validator'ından geçmiyor: `protocol/ws.ts` frame
birliğinde design frame'i **yok**, `schemas/` altında tek bir design/artifact
şeması **yok**; tüm Design trafiği REST (`use-design-studio.ts` yalnız `lib/api.ts`'i
çağırıyor). Bu yüzden yeni alanlar için validator taşımak **gerekmiyor**; o
maddenin doğru karşılığı aşağıda.

**Kalan:** §3 düzenlenebilir alan yüzeyleri (type/system/model/token/density/content)
→ sonra yakma + kapanış.

### Tur 6/10 — §3 düzenlenebilir alan yüzeyleri (`468eb5e`)

Altı alan, **her biri için tek kontrol**: type · system · palette · density ·
model · content. Serbest metinli tweak kutusu **duruyor**; alan seçimi yeni bir
yazma yolu açmıyor, aynı cümleyi üretip **aynı metered çağrıyı** tetikliyor.

- **Tek uygulama (DRY):** `runTweakNote(note)` artık TEK metered yazma yolu;
  `runTweak` ona devrediyor. Alan seçimi ile serbest metin kutusu iki ayrı
  tweak implementasyonu değil — aynı yeniden-giriş korumasını paylaşıyorlar.
- **Canlı katalog, ikinci liste yok:** system seçenekleri `GET /api/design/systems`'ten,
  model seçenekleri kompozitörün kullandığı `enabledModels(useProviderStore(...))`
  kataloğundan geliyor (aynı `models.ts` yardımcısı). REQ-191 bu listeyi
  değiştirdiğinde alan yüzeyi kendiliğinden yeni kataloğu gösterir.
- **Dürüstlük (ölçülen sınır):** manifest yalnız `type`/`system`/`model`
  kaydediyor. `palette`/`density`/`content` sadece HTML'in içinde yaşıyor, bu
  yüzden `fieldCurrentValue` onlar için **`null` döner** ve çip `—` basar —
  ilk seçeneği "mevcut" diye göstermek uydurma olurdu. Manifest yoksa da `null`.
- **No-op metered çağrı yok:** `buildFieldTweakNote` boş değerde **ve** mevcut
  değere eşit seçimde `null` döner → düğme pasif kalır, hiçbir model turu yanmaz.
- **Kapalı katalog dürüstlüğü:** sistem/model listesi boşsa kontrol **pasif**
  (`title` ile sebebi yazılı) — boş bir açılır menü değil.
- `content` alanı `text` türünde (serbest metin bloğu), diğer beşi `select`.
  Alan şeridi `data-design-field-strip` + `data-design-field-toggle/apply`
  kancalarını taşıyor (canlı prob için).

Kanıt: `design.test.ts` **115/115** (85'ten, 30 yeni kontrol: 6 alan, katalog
 kaynaklı seçenekler, `null` dürüstlüğü ×6, no-op ×3, tüm üretilen notların
paylaşılan 400 karakter tavanına sığması). **proven-to-fail:** no-op koruması
kaldırılınca iki assertion kırmızıya düşüyor (113 passed / 2 failed) ve dosya
**md5 birebir** geri alınıyor. Kök `bun x tsc --noEmit` **0** · sterilize web
build yeşil (`index-oVvhZEDr.js`) · `pm2 restart lokma-web` sonrası servis
edilen bundle == disk, chunk'ta `data-design-field-strip` **1** kez,
`runTweakNote` **1** kez · tokenless `/api/auth/me` **401** (kapı AÇIK kalmadı).

**Kalan:** canlı tarayıcı probu (`scripts/probe-design-fields.cjs` — alan
seçiminin tek tweak çağrısına indirdiğini, kapı kapatıldığında uygulama
kalkmadığını ve **kapı AÇIK kalmadığını** ölçen) → yakma + kapanış.

### Tur 7/15 — canlı tarayıcı probu (`1c05c23`) → KAPANIŞ

Altı dilim birim testleriyle geldi; **dağıtılmış sayfayı** ölçen tek bir şey
yoktu (tur 5'te ölçülen `expectedSha` boşluğu iki tur hayatta kaldı).
`scripts/probe-design-fields.cjs` gerçek SPA'yı sürüyor (minted Bearer, gate
ON) ve §3'ün iddialarını hem DOM'da hem **telde** ölçüyor.

- **Tek yazma yolu, ölçülmüş:** bir alan seçimi tam **1** `POST
  /api/design/:id/tweak` üretiyor, `POST /api/design/generate` **0**; gövde
  üretilen cümleyi + sayfanın **kendi** sha kilidini + kapsamlı cwd'yi
  taşıyor, ve **aynı cümle** serbest metin kutusunda görünüyor (DRY iddiası
  ölçülüyor, iddia edilmiyor).
- **Dürüstlük DOM'da:** Type/System/Model çipi manifest'in gerçekten kaydettiği
  değeri basıyor; Palette/Density yalnız HTML'in içinde yaşadığı için `—`
  basıyor (ilk seçeneği "mevcut" göstermek uydurma olurdu).
- **No-op koruması yüzeyde:** mevcut değere eşit satır **hiç sunulmuyor**
  (`["deck","mobile","image","document","hyperframe"]` — `prototype` yok), yani
  hiçbir şeyi değiştirmeyen metered tur yazılamıyor.
- **Boş içerik ateşlenmiyor:** boş Apply `disabled`; dolu içerik **aynı** tek
  tweak çağrısına iniyor ("Rewrite the copy … Fresh replacement copy").
- **Kapalı katalog:** `/api/models` tek okuma stub'lanıp boşaltılınca Model
  kontrolü `disabled` + `title="No model options loaded"`; diğer alanlar
  etkilenmiyor (stub TEK uca bağlı).
- **Maliyet sıfır — yapısal olarak, şansla değil.** Alan seçimi `model`
  taşımadığı için kendi halinde **canlı default sağlayıcıyı** çözer ve bir
  dakika gerçek token yakardı (ilk koşuda olan da bu: probe uçuş ortasında
  ölçtü, iki yanlış kırmızı üretti). Prob sayfanın tuttuğu sha kilidini
  **bayatlatıyor** → aynı tıklama model çağrısından ÖNCE gelen 409
  `stale_version` ile düşüyor; reddediş panelde görünüyor, **sürüm
  oluşmuyor**, `v1 · 1 version(s)` korunuyor. Yani gerçek sayfa yolu
  (cümle kuruldu, POST atıldı, hata çizildi) hiçbir maliyetle sürüldü.
- **Probun kendi hatası (ölçüldü):** ilk koşunun iki kırmızısı ürün değil
  probdu — sabit `sleep(2500)` uçuş ortasını ölçüyordu (hata henüz çizilmemiş,
  düğmeler hâlâ `busy`). Düzeltme: `waitSettled()` durumu bekler. İkinci
  gerçek hata shim'de: `push(body)` **canlı referans** saklıyor, sonraki
  `expectedSha` ataması yakalanan "sayfa gövdesi"ni de eziyordu → snapshot
  önce alınıyor; "sayfa kendi sha'sını gönderdi" kontrolü ancak bundan sonra
  anlamlı.
- **proven-to-fail:** `design-page.tsx`'ten mevcut-değer filtresi kaldırıldı →
  build (`index-DN4weiFv.js`) + restart + koşu → **yalnız E kontrolü**
  kırmızı ("the current value is NOT offered"), diğer 43 yeşil. Dosya
  **md5 birebir** geri alındı (`5f0fabba…`), bundle hash bilinen iyi değere
  döndü (`index-oVvhZEDr.js`) ve koşu yeniden **44/44**.

Kanıt: canlı **44/44** (`/tmp/lokma-req190/fields-summary.json`; `wire:
tweak POSTs=2 generate POSTs=0`) · birim `design.test.ts` **115/115** · kök
`bun x tsc --noEmit` **0** · steril web build `index-oVvhZEDr.js`, servis edilen
== disk · 0 JS hatası · ekran `/tmp/probe-design-fields.png` · prob artifact'ı
silindi + stays-gone · tokenless `/api/auth/me` **401** (kapı AÇIK kalmadı).

Commitler: `2288a19` (sürüm defteri) · `edd453f` (tweak ucu) · `d021f73`
(tweak + seçici arayüzü) · `52ddc44`+`e396328` (expectedSha ölçümü + prob) ·
`468eb5e` (düzenlenebilir alan yüzeyleri) · `1c05c23` (canlı tarayıcı probu).

**Kapsam notu (ölçülen düzeltme):** Kapsam §4'teki "`packages/lokma-shared`
transcript/artifact şeması" maddesi **geçersizdi** — Design trafiği hiçbir
zod validator'ından geçmiyor (design frame'i `protocol/ws.ts` birliğinde yok,
`schemas/` altında design şeması yok, tüm trafik REST). Yeni alanlar için
validator taşımak gerekmedi; ölçüm tur 5'te alındı.

**Sıradaki REQ'ler:** REQ-191 (sistem kataloğu) → REQ-192 (tasarım skill
seçimi) → REQ-193 (browser proxy/tunnel) → REQ-194 (settings fullscreen) →
REQ-195 (sessions altındaki server kartı).
