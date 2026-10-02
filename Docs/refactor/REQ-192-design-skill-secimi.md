# REQ-192 — Tasarım skill'leri seçilebilsin (Design Studio'ya skill yüzeyi)

**Status:** pending
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

## Notlar

- **Write-only:** kod yazılmadı.
- Bu dalga OpenDesign'ın **iki ayrı** kataloğunu (skill + şablon) bilinçli olarak ayırır; REQ-191 ise üçüncüsü (marka sistemi).
