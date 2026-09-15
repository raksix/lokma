# REQ-152 — Pencere modunda tıklanan pencere öne gelsin (focus → z-order)

**Status:** pending
**Tarih:** 2026-09-15
**Kapsam (öngörü):** `packages/lokma-web/web/src/components/panes/windowed-canvas.tsx`
(pencere çerçevesi), `components/panes/workspace.tsx` (`onWinDragStart`/state),
`stores/layout.ts` (kalıcı sıra alanı)
**İlişkili:** REQ-151 (alta taşma)

## İstek (verbatim)

> bir de tıkladığım en son focus olan pencere katman olarak en öne gelsin.
> windwos pencere yönetimi gibi.

## Kök neden (koddan)

`windowed-canvas.tsx` pencereleri **dizi sırasıyla** çiziyor:

```tsx
{panes.map((pane, i) => {
  const p = pos[pane.id] ?? {...};
  return (
    <div className="absolute flex flex-col overflow-hidden rounded-lg border bg-white shadow-xl"
         style={{ left: p.x, top: p.y, width: p.w, height: p.h }}>   // z-index YOK
```

Pencere çerçevesinde `zIndex` yok ve tıklama/pointerdown ile pencereyi öne
alacak bir handler de yok (yalnızca başlıkta `onPointerDown` → sürükleme).
Bu yüzden alt pencereye tıklamak onu **öne getirmiyor**: SS-2'deki gibi Browser
penceresi oturum penceresinin üstünde kalıyor ve oturumun alt kısmı erişilemez
görünüyor. (Tiling tarafında `workspace.tsx` zaten `onFocus={focusPane}` ile
focus takibi yapıyor; pencere modunda eşdeğeri yok.)

## Kabul kriterleri

1. Bir pencereye **herhangi bir yerinden** tıklamak (başlık, içerik, resize
   tutamacı) onu diğerlerinin önüne getirir — Windows/VS Code davranışı.
2. Sürükleme de pencereyi öne getirir (sürüklerken arkada kalmaz).
3. Sıra kalıcıdır: F5 sonrası aynı ön/arka düzeni korunur (layout store'da
   saklanan bir sayaç/sıralama alanı ile).
4. Odaklanan pencere görsel olarak ayırt edilir (aktif gölge/kenarlık tonu);
   odak değişince önceki pencerenin vurgusu söner.
5. Klavye erişilebilirliği bozulmaz (Tab ile gezinirken odaklanan pencere öne
   gelir; `aria-hidden`/`inert` ile arkada kalan pencereler yanlışlıkla
   etkileşim yakalamaz).

## Verify planı (öngörü)

- Canlı prob: iki pencere aç → alttakine tıkla → `getComputedStyle(el).zIndex`
  değerinin diğerinden büyük olduğunu ve DOM/state sırasının değiştiğini
  doğrula; tıklamadan önce/sonra sıra karşılaştırılır.
- F5 sonrası aynı sıra: `localStorage`'daki `lokma:layout*`/pencere konum
  kaydında sıra alanı okunur.

## Notlar

- REQ-151 ile aynı dosyada çalışıyor; ikisi tek turda birlikte yapılmalı
  (dosya kilidi / çakışma olmasın).
- Tiling (split) panellerin davranışı değişmez — bu istek yalnızca pencere
  (floating) modunu kapsıyor.
