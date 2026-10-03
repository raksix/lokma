# REQ-190 — Figma gibi düzenleme: seçili öğeyi içerikten düzenle (canvas tweak)

**Status:** pending
**Tarih:** 2026-10-02
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

