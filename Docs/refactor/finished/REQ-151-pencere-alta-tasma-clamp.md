# REQ-151 — Pencere modunda alta sürükleyince taşma (y ekseninde hatalı clamp)

**Status:** pending
**Tarih:** 2026-09-15
**Kapsam (öngörü):** `packages/lokma-web/web/src/components/panes/windowed-canvas.tsx`
(`clampWindowPos`, ~satır 27-35) — muhtemelen tek satırlık düzeltme
**İlişkili:** REQ-152 (focus → öne gelme)

## İstek (verbatim)

> bu pencere modunda ise browser yarım ekran. sessiondan da alttan çeyreği yok.
> sağ soldan taşma olmuyor ama alta sürüyüklen ce alta geçip taşma oluyor.
> 2. ssde taşmayı görebilirsin

Ekran görüntüleri: (SS-2) üstte oturum penceresi, altında yarı ekran Browser
penceresi — oturumun alt kısmı altta kalıyor; (SS-3) pencere modunda birden çok
yüzen pencere.

## Kök neden (koddan)

`clampWindowPos` x ve y eksenlerini **farklı** kurallarla sınırlıyor:

```ts
x: Math.max(0, Math.min(Math.round(p.x), Math.max(0, box.w - WIN_M - w))),   // tüm pencere içeride
y: Math.max(0, Math.min(Math.round(p.y), Math.max(0, box.h - WIN_M - 40))),  // sadece 40px başlık payı
```

Yani sağa/sola sürüklerken pencere tuvalin içinde kalıyor (kullanıcının
"sağ soldan taşma olmuyor" gözlemi doğru), ama **aşağı sürüklerken pencerenin
üst kenarı `box.h - 48`'e kadar inebiliyor** — pencerenin tamamı tuvalin
dışına taşıyor, `overflow-hidden` yüzünden alt kısmı kesiliyor ve başlık
çubuğundan başka tutunacak yer kalmıyor.

## Kabul kriterleri

1. Sürükleme ve boyutlandırma sonrası pencere **tamamen** tuvalin içinde kalır:
   `y` üst sınırı `box.h - WIN_M - h` (x kuralının aynısı).
2. Pencere tuvalden büyükse (`h > box.h`) en az başlık çubuğu görünür kalır
   (y = 0'a sabitlenir, taşma yok).
3. Yeniden boyutlandırma (RESIZE) yolu da aynı kuralı kullanır — alt kenardan
   büyütünce pencere dipte taşmaz (`windowed-canvas.tsx` `WindowResizeHandles`).
4. Kaydedilmiş (localStorage) bir konum yeniden yüklenirken de clamp uygulanır.

## Verify planı (öngörü)

- Birim prob: `clampWindowPos({x:0,y:9999,w:400,h:300}, {w:1200,h:800})` →
  `y === 800 - 8 - 300` olmalı (şu an `752`).
- Canlı prob: pencere başlığından tutup tuvalin altına sürükle → pencerenin
  `getBoundingClientRect().bottom` tuvalin `bottom`'undan büyük olmamalı.

## Notlar

- "Browser yarım ekran" gözlemi ayrı bir konu: `defaultWindowPos` yeni pencereyi
  **varsayılan olarak yarım genişlikte** açıyor (`floor((box.w - WIN_M*3)/2)`).
  Bu bilinçli mi, değişsin mi — kullanıcı kararı; bu dosyada yalnızca not.
- Aynı ekranda pencerelerin üst üste binmesi REQ-152 ile birlikte anlam
  kazanıyor (focus edilen pencere öne gelince alttaki oturum tıklanabilir olur).
