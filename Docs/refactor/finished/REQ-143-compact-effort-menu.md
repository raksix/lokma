# REQ-143 — effort menüsü: açıklamalar gitti, menü kompaktlaştı

**Status:** done
**Tarih:** 2026-09-14
**Kapsam:** `packages/lokma-web/web/src/components/chat/composer.tsx`, `scripts/probe-thinking-ladder.cjs`

## İstek (verbatim)

> knaka bunda açıklamları kaldır gerek yok ve daha compact olsun orası

Ekran görüntüsü: composer'daki **Effort** menüsü — yedi seviyenin her birinin
altında bir açıklama satırı (`Answer straight away — fastest, fewest tokens.`,
`Balanced reasoning budget (recommended).` …).

## Ne değişti

1. **Açıklamalar tamamen kaldırıldı.** `THINKING_LEVELS` artık `{ id, label }`
   tutuyor; `hint` alanı ve render edilen açıklama satırı silindi. Seviye
   listesi kısaldığı için menü iki satırlık bloklar yerine tek satır çiziyor.
2. **Kompakt görünüm:** menü genişliği `250px → 168px`, `max-h` `340px → 240px`,
   satır dolgusu `px-2.5 py-1.5 → px-2 py-1`, etiket `13px → 12.5px`.
3. **Hizalama düzeltmesi:** aktif seviyenin terracotta noktası artık sabit
   genişlikli (`w-2`) bir işaret kolonunda duruyor — nokta göründüğünde etiket
   kaymıyor (eski halde satır içi `gap` etiketi sağa itiyordu).
4. **Kararlı seçiciler:** satırlara `data-effort-option={id}`, menüye
   `data-effort-menu` eklendi. Prob eskiden açıklama satırının CSS sınıfına
   (`span.block.pl-3`) tutunuyordu; açıklama kalkınca o seçici kırılacaktı.

## Kanıt

- `probe-thinking-ladder.cjs` (canlı `lokma.fermag.com.tr`) — **9 passed, 0 failed**
  (+1 SKIP: reasoning bloğu olmayan oturumda kompakt önizleme, tasarım gereği):
  - `picker header reads Effort`
  - `picker lists all 7 rungs` (Off/Minimal/Low/Medium/High/Extra High/Max)
  - `every rung is one compact line` — en yüksek satır ≤ 32px
  - `menu stays short` — yükseklik ≤ 240px
  - `menu stays narrow` — genişlik ≤ 200px (ölçülen değer 168px)
  - `no description text under the labels` — satır metni en fazla 2 kelime
  - `picking Max persists to localStorage`
  - `no failed requests`
- `composer.test.ts` thinking-picker kontrolleri PASS, `bun x tsc --noEmit` exit 0,
  `bun run build` yeşil, canlı `index-C4Sa-s-v.js` servis ediliyor.

## Notlar

- Menü hâlâ Hermes'in tek merdivenini listeliyor (REQ-139); model bazlı menü yok.
- Açıklama metinleri ürün kararı olarak istendiğinde geri eklenebilir; `hint`
  alanı bilerek tamamen silindi ki ölü kod kalmasın.
