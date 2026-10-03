# REQ-192 — Tasarım skill'leri seçilebilsin (Design Studio'ya skill yüzeyi)

**Status:** in-progress
**Tarih:** 2026-10-02
**Kaynak:** Kullanıcı mesajı (2 Ekim 2026):
> "+ tasarım skilleri falan ya da design branding falan seçeiblsin opendesgin de var onalrı yap"

**İlişkiler:** REQ-191 (sistem kataloğu) · REQ-190 (tweak) · REQ-181 (yüzey→araç kataloğu). OpenDesign araştırması: `Docs/raw/38-opendesign-ham-arastirma.md` §3.3 (Skills — 100+ SKILL.md) + §3.4 (şablonlar).

## Bugünkü durum (ölçülmüş)

1. **Skill sistemi var, Design skill'i yok.** `packages/lokma-core/src/skills/` tarama/registry/patch/marketplace kuruyor (`registry.ts`, `curator.ts`, `marketplace.ts`); Settings → Skills bölümü canlı (REQ-166). **Design'e özel skill listesi/yüzeyi yok.**
2. **REQ-181 bu dalganın omurgasını kurdu:** tek yüzey kataloğu (`@lokma/shared` → `surfaces`) + `<available_surfaces>` prompt bloğu + yüzey başına araç. Design yüzeyi katalogda **bir giriş** olarak duruyor; bu REQ onun **skill ekseni** ekler.
3. **OpenDesign'ın modeli:** yetenekler **SKILL.md dosyalarıdır** (100+), her biri bir işlev; şablonlar ayrı katalogdur (§3.4). Yani Lokma'da "design skill'i" = `SKILL.md` + bir `design`-scope etiketi → ajanın prompt'una girer ve **üretim sırasında** uygulanır.
4. **Bugün üretim prompt'u tek cümle:** `POST /api/design/generate` yalnız brief + type + system + model alır; skill/şablon girdisi **yok**. Yani "Stitch tarzı" ya da "brutalist" demek kullanıcıya prompt'a **elle** yazmak zorunda.

## Kapsam

1. **Design skill kataloğu:** skill'e `scope: 'design'` (ya da `tags: [design]`) alanı; `GET /api/design/skills` **yalnız** design kapsamlılarını döner (gruplu: stil, düzen, erişilebilirlik, bileşen, içerik, marka).
2. **Seçici:** composer'da `Design skills` `SelectMenu`'su (gruplu, aramalı) + **çoklu seçim** (bir brief birden çok stil isteyebilir). Seçim snapshot'ta kalıcı + **reset** düğmesi.
3. **Prompt'a giriş:** seçili skill'ler `generate` isteğinde `skills: string[]` olarak **gerçek SKILL.md içeriğiyle** (yalnız adı değil) modele verilir — ajan talimatı uygular. (Not: REQ-181'de ölü kod bulunan `buildSkillsSystemPrompt` bu yolda **gerçekten çağrılır**.)
4. **Şablonlar ayrı eksen:** `GET /api/design/templates` + seçici (`prototype`, `deck`, `mobile`, `document`; OD'de 15 deck şablonu × 36 tema). Şablon = çıktı iskeleti, skill = nasıl üretilir — ikisi karıştırılmaz.
5. **Kurulum:** OpenDesign tarzı skill kurulumu (`lokma design skill add <url>` + marketplace'den), `scope` alanı doğrulanır (kurulu skill scope'suzsa tasarımda seçilemez, dürüst mesaj).
6. **Önizleme:** seçili skill'in `SKILL.md`'si bir panelde okunabilir (kullanıcı ne seçtiğini görür).
7. **Dürüstlük:** seçili skill üretimde kullanılmadıysa (model yok saydı) metadata satırında belirir; "uygulandı" iddiası uydurulmaz.

## Kontrol (kabul kriterleri)

- `GET /api/design/skills` yalnız design kapsamlılarını döner; gruplu menüde hepsi görünür.
- İki skill seçilip üretim yapıldığında **giden istek gövdesi** her iki SKILL.md içeriğini taşır (prob isteği okur).
- Snapshot: seçim reload'da korunur; Reset tümünü temizler.
- Şablon seçimi ayrı ve bağımsız çalışır.
- Marketplace'den kurulan skill `scope: design` ile listede (scope'suz kurulursa dürüst uyarı).
- Üretim sonrası metadata'da "uygulandı/uygulanmadı" ayrımı var.
- Kapılar: birim + tsc 0 + sterilize build + pm2 restart + canlı bundle == disk + prob `scripts/probe-design-skills-picker.cjs`.

## Dokunulacak yerler

- `packages/lokma-core/src/skills/` (scope alanı + design filtresi + **`buildSkillsSystemPrompt` gerçek çağrısı**)
- `packages/lokma-core/src/design/generate.ts` (istek şeması `skills[]`/`template`)
- `packages/lokma-web/server/src/routes/design.ts` (`/skills`, `/templates`)
- `packages/lokma-web/web/src/components/design/design-chat.tsx` (seçici + önizleme paneli)

## Bitirme (done)

1. Kontroller PASS + prob + ekran görüntüsü.
2. Atomik İngilizce commit(ler) + push.
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index + `Docs/00`.

## Dilim durumu (ilgilendirme sırası: yetenek → yüzey → katalog)

**Dilim 1 — YETENEK (bitti, `7ea0c4c` · `f32d125` · `604cf1b` · `f49b8ee` · `1b142b8`)**

1. `SkillSchema`'ya isteğe bağlı `scope` + `group`; `parseFrontmatter` ikisini de
   okur (`registry.ts` iki push noktası da iletir). Alanlar opsiyonel: scope'suz
   skill eskisi gibi çalışır.
2. `packages/lokma-core/src/design/skills.ts` — **ikinci katalog**, `systems.ts`'in
   yanında: `listDesignSkills()` (gerçek registry taraması, YALNIZ `scope: design`,
   gruplu + taksonomi sıralı, `unscoped`/`invalid` sayaçlarıyla), `parseSkillSelection()`
   (tip hataları sessizce düşmez), `resolveDesignSkills()` (id → **SKILL.md gövdesi**;
   bilinmeyen 404 / scope'suz 400 / okunamayan 409).
3. `buildDesignSkillsPrompt()` — `<design_skills>` bloğu token tablosu ile
   tip direktifi arasında, gövdelerle; skill başına + toplam karakter bütçesi ve
   görünür `[truncated: …]` işareti. Seçim yoksa prompt bayt bayt eskisi gibi.
4. `generateArtifact(…, skillsRaw)` önce çözer, `manifest.skills` (id + `sentChars`)
   dürüstlük kanalı olarak yazılır; REST `POST /api/design/generate` `skills` alır,
   `GET /api/design/skills` katalogu döner, `design_generate` aracı aynı alanı alıp
   modele **gerçekten giden** skill'leri raporlar.
5. `skills/design-*/` altında **6 scope'lu skill** (brutalist-web, editorial-serif,
   product-hierarchy, data-dense-dashboard, accessibility-basics, brand-voice) —
   katalog aksi halde boş bir katalog olurdu.

**Ölçülen:** birim 44/44 (`skills.test.ts`) · mevcut design probları 24/111/27/53
regresyonsuz · kök `tsc --noEmit` 0 · `@lokma/shared` → `@lokma/core` → `lokma-server`
build yeşil · canlı `/api/design/skills` 6 skill gruplu, 7 scope'suz elendi ·
canlı hata yolları `skill_not_found` 404 / `skill_not_design` 400 / `bad_skills` 400 ·
token'siz `/api/design/skills` **401** (login gate AÇIK kaldı).

**Dilim 2 — YÜZEY (bitti, `72b8014` · `f915d4d` · `5d94a15` · `ab86557` ·
`2217bc9` · `22501e1` · `0f9da09`)**

1. `SelectMenu` **opt-in `multi`** modu: opt-in olduğu için mevcut tekli
   seçim çağıranları hiç etkilemiyor (commit yolu menüyü kapatmaya devam
   ediyor). Seçim `value`'dan değil, çağıranın verdiği `multiValues`
   kümesinden okunuyor — tek değerli bir trigger üçlü seçimi anlatamaz.
   Satır tıklaması **toggle** edip menüyü **açık** bırakıyor; işaretli satır
   `data-select-picked` ile DOM'dan okunuyor.
2. Saf yardımcılar (`design.ts`): `toggleSkill` (tek yazar — sıra korumalı,
   server cap'i aynalanmış, geçersiz id sessizce reddedilir), `clearSkills`,
   `normalizeSkillIds`, `skillSelectionLabel`, `groupSkillRows`.
3. `GenerateForm.skills` + **snapshot geri yükleme**: seçim reload'da
   korunuyor, ama **sadece şekil** üzerinden (geçerli/dedup/cap) — katalog
   üyeliğine göre değil; katalog makineye özel, sunucu zaten dürüst 404
   veriyor.
4. Hook: ikinci katalog kendi state'inde (sistem listesi **yerine geçmez**),
   tek SKILL.md okuyucu (`GET /api/skills/:id` — ikinci okuyucu yok) tek
   sequence guard'la; toggle önizlemeyi de açıyor.
5. Composer: gruplu + aramalı çoklu seçici, **Reset** düğmesi, skill chip'leri
   (oku/çıkar), SKILL.md önizleme paneli, boş katalog **dürüst** mesajı
   ("N skill `scope: design` beyan etmediği için atlandı").
6. Dürüstlük: üretim sonrası sohbet **sunucunun kaydettiği** skill'leri
   adlandırıyor; giden'den az döndüyse "N/M modele ulaştı" diyor.
   Seçim üretimden **sonra korunuyor** (Type/System/Model gibi kalıcı eksen).

**Ölçülen:** web birim 148/148 (`design.test.ts`) · core skill 44/44 ·
slash probu yeşil · kök `tsc --noEmit` 0 (aynı dalgada bulunan ve bu dalgaya
ait olmayan `skills.test.ts` tip hatası da giderildi) · web `tsc -p` 0 ·
sterilize build yeşil (`index-D5NquoI8.js`) · `pm2 restart lokma-web` sonrası
**canlı bundle == disk** · yeni hook'lar (`data-design-composer-skills`,
`data-design-skill-chip`, `data-design-skills-reset`,
`data-design-skill-preview*`) servis edilen bundle'da **gerçekten** var.

**Kalan dilimler:** (3) ayrı **şablon** ekseni (`GET /api/design/templates`);
(4) `lokma design skill add` kurulum ucu; (5) marketplace'den kurulum +
scope'suz skill dürüst uyarısı; (6) canlı tarayıcı probu
`scripts/probe-design-skills-picker.cjs` (iki skill seç → **giden istek
gövdesi** her iki SKILL.md içeriğini taşıyor).

## Notlar

- **Write-only:** kod yazılmadı.
- Bu dalga OpenDesign'ın **iki ayrı** kataloğunu (skill + şablon) bilinçli olarak ayırır; REQ-191 ise üçüncüsü (marka sistemi).
