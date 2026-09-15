# REQ-153 — YouTube ana sayfası/kanal/arama da panelde açılsın (Piped yönlendirmesi)

**Status:** done
**Tarih:** 2026-09-15
**Kapsam:** `packages/lokma-web/web/src/components/browser/browser.ts` (`paneUrlFor`, `isPipedUrl`),
`components/browser/browser-pane.tsx`, `components/browser/browser.test.ts`,
`scripts/probe-browser-embed.cjs`
**İlişkili:** REQ-150 (video linkleri için no-cookie embed)

## İstek (verbatim)

> youtube açamıyor amk aq siklcem

Ekran görüntüsü: Browser paneli, adres çubuğunda **`https://www.youtube.com/`**,
altı boş.

## Kök neden

REQ-150 yalnızca **video** linklerini (`watch?v=`, `youtu.be`, `shorts`, `live`,
`playlist?list=`) embed'e çeviriyordu; ana sayfa/kanal/arama sayfalarının
YouTube tarafında gömülebilir karşılığı **yok** ve bu sayfalar
`X-Frame-Options: SAMEORIGIN` yolladığı için panelde boş kalıyordu. Kullanıcı
ana sayfayı açtığı için "hiç açılmıyor" görünüyordu.

## Ölçüm

| URL | iframe'de | Not |
| --- | --- | --- |
| `www.youtube.com` (ana sayfa) | ❌ SAMEORIGIN | embed karşılığı yok |
| `piped.video` | ✅ başlık yok | iframe'de açılıyor, `/trending`'e yönleniyor, %98–99 dolu render |
| `piped.kavin.rocks`, `invidious.f5.si` | ✅ | yedek adaylar |
| `inv.nadeko.net` | ❌ sameorigin | — |

## Çözüm

`paneUrlFor(url)` eklendi — iframe'in **gerçekten** yükleyeceği adresi seçer:

1. Video linkleri → YouTube'un kendi `youtube-nocookie.com/embed/...` oynatıcısı (REQ-150, daha kaliteli).
2. Geri kalan youtube.com sayfaları → `https://piped.video` + aynı yol/sorgu;
   `results?search_query=X` → `piped.video/search?q=X` eşlemesi.
3. YouTube dışı siteler → dokunulmaz (`null`).

Adres çubuğu ve sekme kaydı **kullanıcının yazdığını** korur; yalnızca iframe
`src`'si türetilir. Panelde `data-piped-chip` ile küçük bir **"Piped"** rozeti
çıkar (title: "iframe'e izin vermediği için Piped önyüzü üzerinden açılıyor"),
yani kullanıcı hangi adreste olduğunu bilir.

## Kanıt

- `browser.test.ts` → **42 passed, 0 failed** (ana sayfa, kanal, arama eşlemesi,
  list'li/list'siz playlist, YouTube dışı siteler, `isPipedUrl`).
- Canlı `probe-browser-embed.cjs` → **8/8 PASS**:
  `the YouTube home page is routed to the Piped front-end — https://piped.video/`,
  `the pane says it is showing Piped`, `the Piped frame actually loaded — https://piped.video/trending`,
  artı REQ-150'nin video kontrolleri (embed + gerçek `player` elementi).
- Piksel kanıtı (pngjs yok, PIL ile): panel alanı **%99,4 dolu** — reddedilen
  çerçeve ~%0 olurdu.
- `tsc --noEmit` 0, build yeşil, canlı bundle `index-BORXAuAH.js`.

## Notlar

- Piped bir **proxy önyüz**: YouTube hesabı/oturumu yok, bazı videolarda
  "upstream" hatası verebilir. Video izlemek için hâlâ en iyi yol doğrudan
  video linki (nocookie embed) — akış bu yüzden videoda YouTube'a, sayfada
  Piped'e gidiyor.
- Piped erişilemezse 2.5 sn sonra çıkan "Sayfa yüklenmedi" katmanı devreye
  girer (harici sekmede aç + kapatma) — sessiz boş ekran yok.
- `youtube-nocookie.com/embed` tercihi korunur; alternatif önyüz listesi
  (`piped.kavin.rocks`, `invidious.f5.si`) gerekirse `paneUrlFor` içinde tek
  sabitten değiştirilebilir.
