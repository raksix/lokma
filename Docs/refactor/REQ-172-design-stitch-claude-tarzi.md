# REQ-172 — Design sayfası Google Stitch / Claude Design tarzına sadeleşsin (mevcut hal çok karışık)

**Status:** pending
**Tarih:** 2026-09-29
**Kaynak:** Kullanıcı mesajı + 3 ekran görüntüsü (29 Eyl 2026):
> "design kısmının tasarımı google stitch ya da claude design gibi olmalı bu çok karışık amk."
> "2. resimdeki gibi stitch var." — "diğer ssde de claude design var, 3. ss de"

**Ekler (bu klasörde):**
- `assets/REQ-172-ss1-mevcut-design.png` — bugünkü Lokma Design sayfası (kullanıcının "çok karışık" dediği hal)
- `assets/REQ-172-ss2-stitch-referans.png` — Google Stitch referansı
- `assets/REQ-172-ss3-claude-design-referans.png` — Claude Design referansı

## Bugünkü durum (sorun)

REQ-168 Design Studio'yu kendi sayfası yaptı, ama yerleşim **kart yığını**: aynı ekranda Brief kartı (Type/System dropdown + textarea + Generate), Artifacts kartı (arama + filtre + `0/0`), canvas (`◇ No artifact selected` + "sandbox iframe — stored HTML — live preview" açıklaması), altta Code/Critique/Export sekmeleri + `Save HTML`, altta iki bilgi kartı (`DESIGN.md — guard`, `6 artifacts · 4 systems`), üstte ikincil araç çubuğu (uzun açıklama + BYOK + Delete), en altta durum çubuğu. Bilgi yoğunluğu dağınık; kullanıcı sade ve odaklı bir stüdyo istiyor.

## Referanslar (eklere bak)

- **Google Stitch (ss2):** üstte proje adı + `Generate/Modify/Preview/More` + Export/Share; ortada **noktalı canvas'ta yan yana çoklu artboard** (mockup varyantları; seçili olan mavi çerçeveli; öğe üstünde bağlam menüsü: Resmi Düzenle / URL / Yükle / AI ile Düzenle / Sil); sağ kenarda ince **dikey araç şeridi**; **altta yüzen prompt kutusu** ("Ne değiştirmek veya oluşturmak istiyorsunuz?" + ekler + model seçici + mikrofon + gönder); solda küçük **ajan günlüğü**; zoom (30%) + undo/redo. Tema: koyu, noktalı zemin, sade.
- **Claude Design (ss3):** solda **sohbet paneli** (~320px: `Chat`/`Comments` sekmeleri, `You` / `Claude` mesajları, durum chip'leri `Writing ×2`, `Editing, Done`) + altta composer ("Describe what you want to create…" + `Import` + mercan `Send`); sağda **büyük canlı canvas**: üstte dosya sekmesi (`Design Files`, `X.html`), ince araç çubuğu (undo/redo, `Tweaks`, `Comment`, `Edit`, `Draw`, `100%`, `Present ▾`), sağ üstte `Share` + koyu `Export`. Tema: krem/beyaz, ince çizgiler, küçük köşe yarıçapları, bol boşluk — "quiet UI".

## Kapsam (hedef düzen)

1. **İki kolon:** solda **sohbet/prompt**, sağda **canvas**. Üçüncü bir kart kolonu YOK.
2. **Sol = sohbet:** brief'ler ve iterasyonlar **mesaj akışı** olarak (kullanıcı mesajları + üretim durum chip'leri: "Generating…", "HTML saved", "Critique done"); en altta **composer**. Mevcut **Type / System / brief** alanları ayrı "Brief" kartı olmaktan çıkıp composer'ın yanına/üstüne **kompakt chip/dropdown** olarak iner; gönderim = Generate.
3. **Sağ = canvas:** seçili artifact'ın **canlı sandbox iframe'i BÜYÜK**; üretilen varyantlar Stitch tarzı **artboard şeridi**nde (yan yana küçük önizlemeler, seçili vurgulu) — seçim tek tıkla canvas'ı değiştirir.
4. **İşlevler kayıpsız ama dağınık DEĞİL:** Code görüntüle/kaydet, Critique çalıştır, Export (tüm formatlar), Delete (iki tık), DESIGN.md guard durumu → üstte küçük bir araç çubuğu + artifact başına `⋯` menüsü ve/veya composer yanı chip'ler ile erişilir. Ayrı Code/Critique/Export sekme yığını kaldırılır.
5. **Kaldırılacaklar:** ayrı Brief kartı, ayrı Artifacts kartı (arama/filtre artboard şeridinin üstüne iner), alttaki iki bilgi kartı (tek satırlık durum chip'ine döner: DESIGN.md + artifact/sistem sayısı), ikincil araç çubuğundaki uzun açıklama; `BYOK`/`Delete` uygun yere (üst sağ / `⋯` menü).
6. **Boş durum:** canvas'ta TEK net çağrı ("Brief yaz ve Generate'e bas" tarzı) — bugünkü çok satırlı açıklama yığını yerine.
7. **Tasarım dili:** mevcut krem `#FAF9F5` + terracotta `#C96442` + koyu tema korunur; ferah boşluk, ince çizgi, az kart; Lucide ikonlar (emoji yok).

## Kabul (kabul kriterleri)

- Ekran görüntüsü: sol sohbet + sağ canvas; kart yığını yok; ilk bakışta Stitch/Claude Design hissi (before/after görselleri REQ dosyasına/commit'e eklenir).
- Tüm işlevler erişilebilir: generate, varyant seçimi, canlı önizleme, code görüntüle+kaydet, critique, export (tüm formatlar), delete, DESIGN.md guard — ölü buton yok, işlev kaybı yok.
- Yeni canlı prob `scripts/probe-design-studio-layout.cjs`: sol composer görünür + sağ canvas iframe yükleniyor; `Brief` / `Artifacts` / `DESIGN.md — guard` başlıkları AYRI KART olarak yok; generate akışı PASS.
- Kapılar: `bun x tsc --noEmit` 0; `design.test.ts` güncel; sterilize build; pm2 tek-proc restart; canlı bundle == disk hash.

## Dokunulacak yerler (öngörü)

- `packages/lokma-web/web/src/components/design/design-page.tsx` (+ `use-design-studio.ts`, `design.ts` state)
- Yeni alt bileşenler: sohbet paneli, artboard şeridi, `⋯` menü / üst araç çubuğu
- `Docs/refactor/assets/` — before/after ekran görüntüleri

## Bitirme (done)

1. Kontroller canlıda PASS + kanıt (prob çıktısı + before/after ekran görüntüsü + bundle hash).
2. Atomik İngilizce commit(ler) + `git push origin main`.
3. Bu dosya: `Status: done` + hash'ler; `git mv` → `Docs/refactor/finished/`; README index güncellenir; `Docs/00-LOKMA-KONTEKST.md`'ye kronoloji satırı.

## Notlar

- İskelet **Claude Design** (sol sohbet + sağ canvas); Stitch'ten **artboard/varyant** fikri ve **altta prompt** deneyimi uyarlanır; ikisi de "az krom, çok canvas" diyor.
- Emoji yasak (kullanıcı kuralı); mevcut işlevler kayıpsız sadeleşir.
- Write-only: kod yazılmadı; worker uygular.
