# REQ-179 — Design arayüzü görsel kalite geçişi (native select'ler gitsin, hiyerarşi/boş durum düzelsin)

**Status:** in-progress (worker tur 2/5 — boş durum/örnek çipler + composer hiyerarşisi landed; kalan: görsel denetim probu + before/after + kapanış)
**Tarih:** 2026-09-30
**Kaynak:** Kullanıcı mesajı (30 Eyl 2026):
> "bunların tasarımı desgin de çok kötü."
**Ek:** `assets/REQ-177-ss1-design-form.png` (aynı ekran görüntüsü — composer'daki TYPE/SYSTEM kontrolleri)

## Bulgular (ekran görüntüsü + kod)

- Composer'daki **TYPE ve SYSTEM kontrolleri native `<select>`** (`components/design/design-chat.tsx:22,125-155`): açılır liste tarayıcının kendi mavi vurgusuyla çiziliyor — uygulamanın krem/terracotta diliyle çelişiyor (görsel denetimde açıkça "yabancı" duruyor).
- Sol composer ile sağ canvas arasındaki hiyerarşi zayıf: küçük gri ALL-CAPS etiketler, sıkışık dikey ritim; boş durumda sayfa "ölü form" gibi görünüyor (canvas boş, sağda yalnız arama).
- Kullanıcı ifadesi: "çok kötü".

## Kapsam

1. **Native kontroller gitsin:** TYPE/SYSTEM için uygulamanın kendi menü/dropdown komponenti (mevcut `ui/` menü deseni; terracotta vurgu, krem zemin, koyu tema uyumlu; klavye erişilebilir, `aria-*`). Native `<select>` yalnız erişilebilirlik yedeği olarak kalmamalı — gerçek komponent kullanılmalı.
2. **Hiyerarşi/ritim:** composer bölgesinde tipografi ölçekleri netleşir (başlık/etiket/yardım metni); boşluk ve gruplama düzenlenir; Generate birincil eylem olarak belirgin.
3. **Boş durumlar:** canvas boşken TEK net çağrı + **örnek brief çipleri** (tıklanınca composer'ı doldurur); sol panelde artifact yokken ölü görünüm yerine yönlendirici içerik.
4. **Tutarlılık:** krem `#FAF9F5` / terracotta `#C96442` / koyu tema tokenları; Lucide ikonlar; emoji yok; komşu yüzeylerle (chat composer, settings modalı) aynı görsel dil.
5. **Erişilebilirlik/taşma:** kontrast ≥ 4.5:1 (etiketler dahil), dar ekranda taşma yok, focus halkaları görünür.

## Kabul (kabul kriterleri)

- Before/after ekran görüntüsü (koyu + açık tema) — native mavi vurgu hiçbir yerde kalmamış.
- Görsel audit probe'u `scripts/probe-design-visual.cjs`: (a) `select` elementi YOK (veya stilize komponentle değiştirilmiş), (b) kontrast ölçümleri ≥ 4.5:1, (c) yatay taşma yok, (d) boş durum çağrısı + örnek brief çipleri DOM'da var.
- Kapılar: tsc 0; design testleri + yeni UI testleri; sterilize build; pm2 tek-proc; canlı bundle == disk hash.

## Dokunulacak yerler (öngörü)

- `packages/lokma-web/web/src/components/design/design-chat.tsx`, `design-page.tsx`, `design-artboards.tsx` (+ gerekirse `components/ui/` menü komponenti)

## Bitirme (done)

1. Kontroller canlıda PASS + kanıt (probe + before/after görseller + bundle hash).
2. Atomik İngilizce commit(ler) + push.
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index; 00-KONTEKST kronoloji.

## İlerleme (worker turları)

- **Tur 1 (30 Eyl):** yeni `components/ui/select-menu.tsx` primitifi (buton trigger + listbox popup; Enter/Space/Ok tuşları, Home/End, Escape; `aria-haspopup/expanded/controls`, role=option/aria-selected; terracotta vurgu + krem/koyu tokenlar) ve Design yüzeyindeki TÜM native `<select>`'lerin değişimi: composer Project/Type/System/Model + artboard tip filtresi. Etiket/meta metinleri geçen kontrast tokenlarına çekildi (kremde zinc-500 ≈4.7:1, koyu panelde zinc-400 ≈6.5:1; ölçüm script'i ile doğrulandı). İki eski prob SelectMenu akışına uyarlandı (layout: popup'tan seçim + sayfada `<select>` kalmadığı assert'i; model: seçenekler DOM sırasıyla gruplu okunur, trigger BUTTON). Canlı kanıt: smoke 11/11 (fare + klavye + Escape + taşma −5px + 0 hata), adapte model probu **20/20** (giden gövdede seçilen model; 613 seçenek/4 grup), servis edilen bundle == disk. Commit'ler: `94abfbc` + `2848629` + `b2f5c92` (push'lu). **Kalan:** hiyerarşi/boş durum adımı (canvas tek CTA + örnek brief çipleri), `scripts/probe-design-visual.cjs` + before/after görseller, kapanış.
- **Tur 2 (30 Eyl):** boş durum + hiyerarşi adımı. `DESIGN_SAMPLES` (4 örnek brief; tipi `DESIGN_TYPES` doğrulamalı) + studio hook'ta `applySample` (brief + doğal tipi doldurur, formError temizler, caret brief textarea'sında) + canvas boş durumu artık TEK net çağrı ("Start with a brief" + Generate yönlendirmesi) ve tıklanınca composer'ı dolduran örnek çipler; sol thread'in ölü tek satırı yönlendirici karta dönüştü; composer'a başlık satırı ("New artifact" + ⌘/Ctrl + Enter ipucu) ve seçicilerle brief grubunu ayıran ayraç geldi (Generate tek birincil eylem kaldı). Kanıt: design birim probu **60/60** (5 yeni örnek-çip kontrolü), kök `bun x tsc --noEmit` 0, steril web build yeşil (`index-CqUmSrti.js`), `pm2 restart lokma-web` sonrası servis edilen bundle == disk + yeni işaretler servis edilen chunk'ta (design-sample / 'Start with a brief' / 'New artifact'), canlı smoke **12/12 ALL PASS** (boş durum + 4 çip + çip tıklaması brief ve tipi dolduruyor + caret textarea'da + 0 JS hatası; mint edilmiş token'la, gate ON, tokenless `/api/auth/me` 401). Commit'ler: `fc4645f` + `770ebef`. **Kalan:** `scripts/probe-design-visual.cjs` (select yok + kontrast ≥4.5 + taşma yok + boş durum DOM) + before/after görseller + kapanış.

## Notlar

- Write-only: kod yazılmadı; worker uygular. İlişkili: REQ-172 (yerleşim), REQ-177 (model), REQ-178 (proje).
