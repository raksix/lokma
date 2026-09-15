# REQ-154 — Agent tarayıcıyı kullanabilsin: sayfayı oku / kaydır / tıkla / yaz

**Status:** done (2026-09-15 — canlı; commit'ler `9eff39b` · `6d688f6` · `0729003` · `e71e1d8` · `83f926d` · `bbd43ea`)
**Tarih:** 2026-09-15
**Kapsam (öngörü):** `packages/lokma-core/src/tools/` (yeni browser araçları),
`packages/lokma-web/server/src/routes/browser.ts` + yeni bir motor modülü,
`packages/lokma-web/web/src/components/browser/browser-pane.tsx` (görünüm eşleme)
**İlişkili:** REQ-146 (sekme yeniden kullanımı), REQ-150/153 (iframe kısıtları)

## İstek (verbatim)

> browserdan aşağı scroll etmiyor amk

Ekran görüntüsü: kullanıcı sohbette "aşağı scroll et" diyor, Lokma şu cevabı
veriyor:

> "Bunu yapamıyorum — bana verilen araçlar arasında sayfayı scroll etme/
> tıklama/yazma yetkisi yok. Elimdeki browser aracı sadece bir URL'yi sekmede
> açıyor (open_browser) … 'Scroll ettim' desem yalan olurdu."

## Teşhis (koddan, doğrulandı)

- Ajan araçları: `read_file, list_files, search_files, glob, grep, edit_file,
  write_file, run_command, ask_user, todos, ui-control`.
- Tarayıcı tarafı yalnızca **UI kontrolü**: `open_browser` (sekme aç/yeniden
  kullan, REQ-146) — sayfa içeriğine dokunan hiçbir araç yok.
- Sunucudaki "browser", gerçek bir tarayıcı değil: `/api/browser/*` uçları
  sekme + URL geçmişi kaydı tutuyor; çalışan bir motor yok.
- Panel tarafında sayfa bir **iframe** (`sandbox="allow-scripts
  allow-same-origin allow-forms"`) — sayfalar çapraz kaynaklı olduğu için
  istemci, iframe'in içine script enjekte edip **kaydıramaz/tıklayamaz**.
  Yani "istemciden halledelim" kısayolu mimari olarak kapalı.
- Kullanıcının KENDİ iframe scroll'u ayrıca ölçüldü: çalışıyor (gerçek
  Chromium'da wheel ile scrollY 0→2000) — şikâyet ajanın kaydıramamasıydı.

## Çözüm (uygulandı: Aşama 2 — gerçek motor)

Aşama 1'e (fetch tabanlı okuma) gerek kalmadı — `browser_read_page` doğrudan
motordan okuyor.

**Motor** — `packages/lokma-web/server/src/browser-engine.ts` (yeni):
- `playwright-core@1.62.1` (sunucu bağımlılığı) + makinedeki mevcut Chromium
  (`/root/.cache/ms-playwright/chromium-*`; `LOKMA_BROWSER_CHROME` override).
- Lazy: ilk araç çağrısına kadar hiçbir şey başlamaz; boşta kalan sayfalar
  10 dk sonra kapanır, son sayfa gidince tarayıcı da kapanır; SIGTERM/SIGINT
  temizliği + sekme kapanışında (DELETE /api/browser/:id) sayfa teardown'ı.
- Sekme başına bir sayfa; her çağrıdan önce sayfa, sekme kaydındaki GÜNCEL
  url'e senkronlanır (pane ile tek doğruluk kaynağı: sekme kaydı).
- SSRF guard: loopback/özel/link-local adresler ve öyle adreslere çözülen
  host'lar `blocked_url` ile reddedilir (yalnız motor; kullanıcının iframe'i
  etkilenmez). Timeout katmanı: nav 25 sn, op 20 sn, screenshot 30 sn.
- Her etkileşimde `browserTabs.touchAgentUse(tabId)` → pane rozeti bunu okur.

**Araçlar** — `packages/lokma-core/src/tools/browser.ts` (yeni): 5 araç —
`browser_read_page`, `browser_scroll`, `browser_click`, `browser_type`,
`browser_screenshot` (PNG → `<cwd>/.lokma/browser-shots/`).
- Hedef sekme: çağrıdaki `tabId`, yoksa oturumun EN YENİ sekmesi (pane
  varsayılanıyla aynı); sekme yoksa dürüst `no_tab` ("önce open_browser").
- Motor yoksa (CLI host'ları) her çağrı dürüst `engine_unavailable` döner.
- `browser_type` parola/token alanlarını maskeler (değer sonuçta ve logda yok).
- Gate: `BROWSER_TOOLS` read-only değil — `auto`'da onay ister, `plan`'da
  reddedilir (canlı config `bypass` olduğundan fiilen serbest).

**Bağlama** — `agent-loop.ts` (`browserEngine` seam'i ile kayıt) +
`routes/browser.ts` (DELETE'te motor sayfası teardown). Pane: motor kullanılan
sekmeye `data-engine-chip` **"Ajan motoru"** rozeti — iki görünümün ayrıştığı
görünür, sessiz fark yok.

## Kanıt

- Birim: `bun src/tools/browser.test.ts` → **20/20** (fake engine: sekme
  çözümü, dürüst hatalar, maskeleme, argüman geçişi, `touchAgentUse`).
- Canlı motor probe'u `bun scripts/probe-browser-agent-tools.ts` → **16/16**:
  gerçek Chromium + Wikipedia — başlık/metin (20 407 karakter), scroll
  805→1525, top/bottom uçları, link tıklaması (Application_software),
  type+submit → /wiki/Linux, gerçek PNG screenshot, loopback reddi,
  blank sekme `no_page`.
- Canlı AJAN E2E `node scripts/probe-agent-browser-scroll.cjs` → **7/7**:
  deployed sunucuda gerçek model (`commandcode/deepseek/deepseek-v4.1-flash`),
  kullanıcının şikâyet senaryosu aynen — "aşağı scroll et":
  `open_browser, browser_scroll, browser_scroll`; yanıt: **"İkinci kaydırma
  sonrası scrollY = 1525 … (scrollHeight 7614, viewportHeight 800)"**.
- `bun x tsc --noEmit` core+server 0; core+server dist rebuild yeşil; canlı
  sunucu yeni dist ile restart edildi (health 200).

## Notlar / sınırlar

- **Görünüm ayrımı bilinçli**: motor sunucuda render eder, pane kullanıcının
  iframe'idir — aynı sekmeyi ve URL'i paylaşırlar, aynı pikselleri değil.
  "Ajan motoru" rozeti bunu görünür kılar. Motorun canlı ekranını (screencast)
  pane'e basmak sonraki iş; bu kapanış araçları + dürüst rozeti kapsar.
- Deploy: sunucu tarafı (araçlar + motor) yeni dist ile canlı; pane rozeti web
  bundle'ında yayınlandı (REQ-149 web-wiring'i tamamlanınca tam tip-kapılı
  build tazeler).
