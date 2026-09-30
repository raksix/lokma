# REQ-179 — Design arayüzü görsel kalite geçişi (native select'ler gitsin, hiyerarşi/boş durum düzelsin)

**Status:** pending
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

## Notlar

- Write-only: kod yazılmadı; worker uygular. İlişkili: REQ-172 (yerleşim), REQ-177 (model), REQ-178 (proje).
