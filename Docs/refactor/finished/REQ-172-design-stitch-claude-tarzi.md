# REQ-172 — Design sayfası Google Stitch / Claude Design tarzına sadeleşsin (mevcut hal çok karışık)

**Status:** done (2026-09-29) — kod `f70ab50` (web) + prob `8b83e89` (probe); canlıda doğrulandı
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

## Kapanış kanıtı (2026-09-29)

**Uygulama:** Design sayfası kart yığınından iki kolonlu stüdyoya çevrildi — `design-page.tsx` yeniden yazıldı; `design-chat.tsx` (sol) brief/iterasyon mesaj akışı + durum chip'leri + composer (Type/System selectleri + brief + Generate), sağda büyük canlı viewer + ince araç çubuğu (Code / Critique / Export / ⋯, DESIGN.md guard header çipi) ve altında `design-artboards.tsx` Stitch tarzı varyant şeridi (gerçek `/api/design/:id/view` önizlemeleri, ilk 24 thumbnail iframe). Kaldırılanlar: ayrı Brief kartı, ayrı Artifacts kartı (arama + tip filtresi şeride indi), Code/Critique/Export sekme yığını (drawer + menüye döndü), iki alt bilgi kartı (guard çipi + sayımlar), uzun araç çubuğu açıklaması. `use-design-studio.ts`: oturum aktivite chip'leri (`appendDesignEvent`, sınırlı + birim testli), canvas drawer durumu, ref-guard'lı generate, açık PNG 1x/2x export.

**Birim:** `design.test.ts` **39/39 PASS** (yeni activity-chip + guard kontrolleri dahil); komşu süitler panes 106+120+126+159, skills 35, inspector-rail 24 — hepsi PASS.

**Canlı prob:** `scripts/probe-design-studio-layout.cjs` (minted Bearer; login gate AÇIK) — **31/31 PASS**:
- Yerleşim: sol kolon sohbet 380px (composer: Type/System/brief/Generate hazır) + sağ kolon büyük canvas 1115×851, yan yana, overflowX=0 — üçüncü kolon yok.
- Eski kart yığını yok: `[data-design-tab]` 0, `[data-design-row]` 0, `[data-design-delete]` 0; 'Artifacts' başlık metni 0; 'Brief' yalnız composer field label'ı (1); 'DESIGN.md — guard' kart metni yok — guard header çipi ("No .lokma/DESIGN.md — bundled tokens").
- Generate gerçekten koşuyor: yeni brief → sohbet mesajı + `Generated … — overall 7/10` chip'i + viewer iframe gerçek `/api/design/:id/view` build'ini render ediyor (`page.frames` ile okundu, bodyLen 775) + varyant şeridinde thumbnail.
- Ölü buton yok: Code drawer gerçek HTML'i gösterdi (1691 karakter), Critique drawer Re-run ile açıldı, Export menüsü 6 formatı listeledi (HTML / ZIP / JSON / PNG 1x / PNG 2x / WebM), ⋯ menüsü iki-tık Delete'i arm etti (`Confirm delete`).
- Cleanup: prob artığı sayfa-içi iki-tık ⋯ Delete ile silindi + canlı liste üzerinden 'stays gone' re-check; 0 sayfa JS hatası.

**Kapılar:** root `bun x tsc --noEmit` 0; steril web build yeşil (entry `index-DxUl1rCS.js`, disk == servis edilen); `pm2 restart lokma-web` sonrası servis edilen entry == disk; concept build yeşil; tokenless `/api/auth/me` 401 (gate ON). Ekran görüntüleri: `assets/REQ-172-ss1-mevcut-design.png` (önce — kullanıcı) ve `assets/REQ-172-ss4-sonra.png` (sonra — prob koşusu).

**Kapsam notu:** Export formatlarının gerçek indirmesi bu probda sürülmedi (menü + 6 format + enabled doğrulandı; gerçek dosya indirmesi REQ-168 probunda kanıtlanmıştı); code kaydetme butonu (`data-design-save`) yerinde ve gerçek `api.saveDesignHtml` yoluna bağlı.
