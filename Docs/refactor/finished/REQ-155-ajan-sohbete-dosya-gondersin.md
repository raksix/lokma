# REQ-155 — Ajan sohbete dosya/görsel gönderebilsin (ekran görüntüsü dahil)

**Status:** done (2026-09-15 — canlı; commit'ler `40ba6f0` (5 atomik) + prob `dfa76dc`)
**Tarih:** 2026-09-15
**İlişkili:** REQ-154 (browser motoru + araçları), REQ-149 (canlı transcript feed)

## İstek (verbatim)

> bu ekran görüntüsünü bana direkt dosya resim olarak atabilmesi lazım direkt
> sohbete dosya falan da gönderebilmesi lazım resim falan da

Ekran görüntüsü: ajan `browser_screenshot` ile PNG alıyor ama sohbete yalnızca
DOSYA YOLU yazıyor (".lokma/browser-shots/fermag-fullpage.png … read_file ile
açabilirsin"); üstelik araç dosyayı oturum workspace'i yerine SUNUCU süreç
klasörüne (`/mnt/apopic/lokma/.lokma/…`) yazdığı için ajan dosyayı elle
kopyalamak zorunda kalmış.

## Çözüm

**Sohbet eki altyapısı** — transcript satırları artık `attachments` taşır
(`{path, name, mime, size}`; yol oturum cwd'sine göreceli). Satır normal mesaj
gibi diske yazılır ve REQ-149'un append feed'i ile açık soketlere CANLI düşer —
ekstra frame yok. (`lokma-core/session/types.ts` + `lokma-shared
TranscriptRowSchema` — şema alanı ŞART: WS doğrulayıcı bilinmeyen anahtarları
düşürür.)

**`send_file` aracı** (`lokma-core/tools/attachments.ts`): `{path, caption?}`;
`WorkspaceFiles` ile jail + 25MB cap + dürüst `ChatFileError` kodları; başarıda
`{ok, delivered, name, mime, size}` döner. Gate: `WRITE_TOOLS` (auto'da ask,
plan'da deny; canlı config bypass).

**Ekran görüntüsü otomatik düşer:** `browser_screenshot` PNG'yi artık sohbete de
teslim eder (araç sonucu `attachedToChat: true`; açıklama `Ekran görüntüsü — <url>`).

**cwd düzeltmesi (kök neden):** `open_browser` sekme kaydına `cwd` yazmıyordu →
motor ekran görüntüsünü SUNUCU süreç klasörüne yazıyordu. Artık `open` + reuse
yollarında oturum cwd'si damgalanır; `browser_screenshot` çalışma cwd'sini
motora açıkça geçirir (`BrowserToolEngine.screenshot { cwd }`). Görüntüler
`<oturum>/.lokma/browser-shots/` altına düşer.

**Web:** `components/chat/attachment.tsx` — görseller satır içi (`/api/files/raw`
authed fetch → blob URL; `<img src>` Bearer token taşıyamaz), diğer dosyalar
indirme kartı (`/api/files/download`); `single-chat-view` oturum cwd'sini
(`known.cwd`) aşağı taşır.

## Kanıt

- Birim: `bun src/tools/attachments.test.ts` → **17/17** (mime, teslim, satır
  içeriği + varsayılan açıklama, jail, eksik dosya); `browser.test.ts` **20/20**
  (screenshot cwd geçişi dahil).
- Canlı E2E `node scripts/probe-chat-attachments.cjs` → **11/11**: deployed
  sunucuda gerçek modelle tek koşu — `open_browser, glob, browser_screenshot,
  send_file`; transkriptte 2 ek satırı; PNG **oturum klasörünün İÇİNDE**
  (`/tmp/lokma-chat-attach-…/.lokma/browser-shots/…`); `/api/files/raw` → 200
  `image/png`.
- Canlı UI: chat'te satır içi görsel (`img.naturalWidth = 1280`) + `hello.txt`
  indirme kartı render edildi; ekran görüntüsü kanıtı alındı.
- Motor regresyonu: `scripts/probe-browser-agent-tools.ts` **16/16**.

## Notlar

- Ekler modelin bağlamına AYRICA enjekte edilmez — transkript satırıdır (model
  ekran görüntüsünü göremez; görsel kullanıcı için).
- 25MB üstü reddedilir; 10MB üstü görseller raw cap'i yüzünden kart olarak
  render edilir (indirme çalışır).
- Deneyim: "ekran görüntüsü al" → görsel doğrudan sohbette; başka dosyalar için
  "şu dosyayı bana gönder" → `send_file`.
