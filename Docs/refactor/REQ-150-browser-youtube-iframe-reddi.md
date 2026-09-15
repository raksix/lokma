# REQ-150 — Browser'dan YouTube (ve iframe'i reddeden siteler) açılmıyor

**Status:** pending
**Tarih:** 2026-09-15
**Kapsam (öngörü):** `packages/lokma-web/web/src/components/browser/browser-pane.tsx`
(+ gerekiyorsa `packages/lokma-web/server/src/routes/browser.ts`)

## İstek (verbatim)

> bu arada browserdan youtube.com falan açılmıyor

## Teşhis (canlı ölçüm, bu oturum)

Panel, sayfayı düz bir iframe ile gömüyor:

```
<iframe src={selected.url} sandbox="allow-scripts allow-same-origin allow-forms" />
```

Ölçülen başlıklar:

| URL | X-Frame-Options | Sonuç |
| --- | --- | --- |
| `https://www.youtube.com` | **SAMEORIGIN** | iframe reddedilir → panel **boş** kalır, hiçbir hata mesajı yok |
| `https://www.youtube.com/embed/<id>` | yok | gömülebilir ✅ |
| `https://www.youtube-nocookie.com/embed/<id>` | yok | gömülebilir ✅ (gizlilik dostu) |
| `https://example.com` | yok | normal çalışıyor |

Yani hata harness'ta değil, sitenin kendi politikasında: tarayıcı çerçeveyi
reddediyor. Panel bunu algılamadığı için kullanıcıya "yükleniyor/boş" olarak
görünüyor; çubuğun sağındaki küçük "harici sekmede aç" ikonu tek çıkış yolu ve
gözden kaçıyor.

## Önerilen çözüm (kabul kriterleri)

1. **Reddi algıla ve söyle.** iframe `onLoad` hiç tetiklenmez; 2–3 sn sonra
   yükleme tamamlanmadıysa panelde görünür bir bilgi katmanı çıkar:
   "Bu site iframe içinde açılmayı reddediyor (X-Frame-Options)" + iki buton:
   **Harici sekmede aç** ve (varsa) **Embed olarak aç**.
2. **YouTube için embed'e çevir.** Adres çubuğuna şu formlardan biri girilirse
   otomatik embed URL'ine çevrilir ve gömülür:
   - `youtube.com/watch?v=<id>` → `https://www.youtube-nocookie.com/embed/<id>`
   - `youtu.be/<id>` → aynı
   - `youtube.com/shorts/<id>` → `https://www.youtube-nocookie.com/embed/<id>`
   - `youtube.com/playlist?list=<id>` → `.../embed/videoseries?list=<id>`
   (Kanal/ana sayfa gibi embed'i olmayan adresler 1. maddedeki katmana düşer.)
3. **Genel kural:** bilinen "iframe reddeden" siteler (google.com, x.com,
   facebook.com, instagram.com, reddit.com ana sayfası …) için de aynı bilgi
   katmanı çıkar; sessiz boş ekran yasak.
4. **Proxy seçeneği (opsiyonel, ayrı REQ):** sunucu üzerinden başlıkları
   soyan `/api/browser/proxy?url=` gömme — SSRF koruması + sitelerin
   top-level kontrolü yüzünden çoğu sitede kırılgan; varsayılan çözüm değil.

## Verify planı (öngörü)

- Prob: adres çubuğuna `youtube.com/watch?v=dQw4w9WgXcQ` yazılır → iframe
  `src`'si `youtube-nocookie.com/embed/dQw4w9WgXcQ` olur ve iframe içinde video
  oynatıcı DOM'u görünür (`video` elementi veya `#movie_player`).
- Prob: `google.com` girilir → 3 sn içinde bilgi katmanı metni görünür ve
  "Harici sekmede aç" linki doğru URL'i taşır.

## Notlar

- Mevcut harici-link butonu korunur (`browser-pane.tsx` toolbar'ı).
- REQ-145 (browser'ı yan panele yasla) ve REQ-146 (açık browser'ı yeniden
  kullan) ile aynı dosyada çalışır — sıralı ele alınmalı (dosya kilitlenmesin).
