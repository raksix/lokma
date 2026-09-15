# REQ-145 — Browser açılırken ekran split edilsin, sayfa yan panele yaslansın

**Status:** done (2026-09-15) — commits `ceebb18` (feat) + `fb38bdc` (test) + `0e852ed` (probe)
**Tarih:** 2026-09-15
**Kapsam (öngörü):** `packages/lokma-web/web/src/components/browser/browser-pane.tsx`,
`components/panes/workspace.tsx` / `split-tree.tsx`, `stores/pane.ts`, `stores/layout.ts`

## İstek (verbatim)

> browserdan bişi açarken ekranı split edip yan panelden asın.

## Yorum

Agent (ya da kullanıcı) bir URL açtığında tarayıcı görüntüsü ayrı bir pencerede
aranmadan görünsün: çalışma alanı otomatik olarak ikiye bölünüp Browser paneli
**yan (sağ) pane** olarak yerleşsin — VS Code'un "Open to the Side" davranışı.
Şu anki durum: Browser paneli Inspector sekmesi olarak ya da pane'e elle
sürüklenerek açılıyor; otomatik yan-pane yerleşimi yok.

## Kabul kriterleri (öngörü)

1. `open_browser` / URL açma akışı tetiklendiğinde çalışma alanı tek pane'liyse
   otomatik olarak yatay (yan) split yapılır; yeni Browser pane'i sağ tarafta,
   chat solda kalacak şekilde yerleşir.
2. Zaten tiling açıksa mevcut pane **yeniden bölünmez** — REQ-146 ile birlikte
   "açık browser varsa onu kullan" kuralına uyar.
3. Mobil single-view'de split yok (REQ-024 kuralı): mobilde tam ekran bir görünüm.
4. Kullanıcı split'i elle kapatabiliyor (mevcut pane kapatma akışı bozulmaz).

## Verify planı (öngörü)

- Headless prob: `open_browser` çağrısından sonra DOM'da `div[data-pane]` sayısı
  1 → 2 olmalı, sağdaki pane'de Browser URL'i görünmeli.
- Mobil viewport'ta (390×844) pane sayısı 1 kalmalı.

## Notlar

- REQ-037 (browser full-height) ve REQ-013 (URL-only sade browser) ile çakışma
  olmamalı: split edilen pane aynı `BrowserPane` bileşenini kullanır.
- Kardeş oturumun çalıştığı chat/prompt-rail dosyalarına dokunulmaz.

## Ne değişti (uygulandı)

1. **Yerleşim kararı saf bir yardımcıda:** `panes.ts` → `paneWithInspector` +
   `planSideDock`. Karar üçe ayrılır: (a) browser zaten bir pane'de açıksa o
   pane FOCUS edilir (ikinci kopya açılmaz), (b) tek pane'li çalışma alanı bir
   kez yatay (`row`, `after`) bölünür ve browser SAĞ pane'e düşer — chat solda
   kalır, (c) çok pane'li çalışma alanı yeniden BÖLÜNMEZ; browser en sağdaki
   pane'e (yan panel) yerleşir.
2. **Store sözleşmesi:** `PendingInspectorTab` artık opsiyonel `side` alanı
   taşır, `requestInspectorTab(id, side?)`. `app-shell` içindeki
   `openBrowserPane` (activity rail butonu ve ajanın `open_browser` ui-action'ı
   aynı fonksiyonu kullanır) isteği `side = true` ile gönderir; terminal akışı
   tab davranışında kalır.
3. **Workspace efekti** (`TilingWorkspace`) side isteğinde planı uygular:
   `focus` / `split` / `dock`. Mobilde davranış değişmez: `openBrowserPane`
   zaten erken dönüyor ve mobil tek görünümde pane sistemi yok (REQ-024).

## Kanıt

- `panes.test.ts` REQ-145 bloğu (planın dört vakası + `paneWithInspector`) ve
  `stores.test.ts` side sözleşmesi: hepsi PASS. `bun x tsc --noEmit` 0 hata;
  web build yeşil → `dist/assets/index-Cz-5HXd6.js`.
- Canlı prob `scripts/probe-browser-side-dock.cjs` — hem `http://127.0.0.1:3457`
  hem `https://lokma.fermag.com.tr` üzerinde **14/14 PASS**:
  A) tek pane 1 → 2 pane, browser SAĞDA, yan yana geometri
  (left x=324 w=456 | right x=784 w=456), solda chat sekmesi duruyor;
  B) tek-sohbet (tiling kapalı) akışı: browser yan pane olarak açılıyor;
  C) üç pane'li düzen bölünmüyor (3 pane kalıyor) + browser en sağdaki pane'de;
  D) tekrar açma yeni pane açmıyor (browserPane = 1);
  E) mobil 390×844: pane sayısı 0 (tek görünüm korunuyor).
- Deploy: `pm2 restart lokma-web` → servis edilen bundle hash'i disktekiyle
  aynı (`assets/index-Cz-5HXd6.js`), `/` → 200.
- Prob dersi: `/api/sessions/sess_*` 404'leri tasarım gereği
  (`session_not_found` → boş transcript önbelleği) — kardeş prob gibi
  filtreleniyor.
- Bu REQ'den bağımsız, main'de zaten var olan test kırıkları: `a11y.test.ts`
  3, `narrow-layout.test.ts` 5, `ws.test.ts` 1 kontrol (değişiklikler stash'lenip
  doğrulandı — REQ-145 ile ilgisi yok).
