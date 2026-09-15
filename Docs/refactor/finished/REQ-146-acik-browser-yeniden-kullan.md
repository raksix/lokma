# REQ-146 — Açık browser varsa yeni sekme/pane açmak yerine onu kullan

**Status:** done (2026-09-15) — commits `9c8dab0` (pane) + `d4c3158` (probe)
**Tarih:** 2026-09-15
**Kapsam (öngörü):** `packages/lokma-web/web/src/components/browser/browser-pane.tsx`,
`packages/lokma-web/server/src/routes/browser.ts` (tab açma), `components/panes/pane.tsx`

## İstek (verbatim)

> açık browser varsa ondan açsın.

## Yorum

Aynı oturumda zaten açık bir Browser paneli/sekmesi varken yeni URL açıldığında
ikinci bir browser pane'i ya da yeni bir sekme doğmasın; mevcut pane öne gelip
URL orada yüklensin. Şu anki durum: her `open_browser` çağrısı yeni bir tab
kaydı açıyor (`tabmu2hqnf4dupjf1` gibi id'ler birikiyor), pane tarafında da
çoklu tab listesi oluşuyor.

## Kabul kriterleri (öngörü)

1. Oturumda canlı bir browser tab'ı varsa `open_browser` **yeni tab açmaz**;
   mevcut tab'ın URL'ini günceller (aynı `tabId` döner).
2. Açık ama farklı bir pane'de duran browser pane'i öne alınır (focus), ikinci
   bir kopya oluşturulmaz — REQ-145'in split kuralıyla birlikte çalışır.
3. Hiç açık browser yoksa davranış mevcut hâliyle aynı: yeni tab + (REQ-145 ile)
   yan pane.
4. Sekme listesi eskisi gibi görünür kalır; kullanıcı elle yeni sekme açabilir.

## Verify planı (öngörü)

- Prob: aynı oturumda `open_browser` iki kez çağrılır; `GET /api/browser?sessionId=`
  tab sayısı **1** kalmalı ve ikinci URL aynı tab'da görünmeli.
- DOM: browser pane sayısı 1, adres çubuğu ikinci URL'i göstermeli.

## İlerleme (tur 1, 2026-09-15 — commit 74ecaa2)

**Sunucu tarafı tamam ve canlı.** `browserTabs.openOrReuse()` eklendi: oturumda
canlı bir tab varsa en yeni tab **yerinde navigate** edilir (aynı `tabId`, gerçek
history push, sonuç `reused: true`); hiç tab yoksa `open()` ile aynı — yeni tab.
`open_browser` aracı artık bunu kullanıyor (tool sonucu `reused` alanı da döner).
REST `POST /api/browser/open` `{ "reuse": true }` ile aynı yolu açar; bayraksız
çağrı eskisi gibi bilinçli "yeni sekme" (pane blank-tab akışı bozulmaz).

Kanıt:
- `bun src/browser/browser.test.ts` (lokma-core) **24/24 PASS** — yeniden
  kullanım, oturum izolasyonu, blank-open'ın canlı sayfayı silmemesi, 20-tab
  tavanı, tool kablolaması + ui_action frame'i.
- Root `bun x tsc --noEmit` 0 hata; core + server build yeşil.
- Canlı REST probu (mint edilmiş token, 127.0.0.1:3456) **11/11 PASS**: ilk
  açılış create → ikinci `reuse:true` aynı `tabId` + url swap + history 2 →
  bayraksız açılış yeni tab → reuse tab sayısını büyütmüyor → temizlikte 0 tab.
  Deploy: `pm2 restart lokma-server`, `/health` 200.

## İlerleme (tur 2, 2026-09-15 — commit `9c8dab0` pane + `d4c3158` probe)

**Pane tarafı tamam ve canlı.** Ajan `open_browser` çağırınca app-shell, pane
store'a tek-atımlık bir `pendingBrowserOpen` sinyali bırakır (tabId + url +
sessionId); sinyali yalnızca aynı oturuma bağlı BrowserPane tüketir: taze tab
listesi çekilir, seçim ajanın sekmesine geçer, adres çubuğu + iframe ajanın
URL'ine taşınır (frame nonce artırılır — aynı tab kimliği URL değişse de
yeniden yüklenir). Sinyal asla kalıcılaşmaz (layout blob'una yazılmaz) ve
sinyal işlenirken boş-sekme otomatik açılışı kapatılır ki yarışta ikinci bir
sekme doğmasın.

Kanıt — canlı prob `scripts/probe-browser-reuse.cjs` **18/18 PASS** (gerçek
ajan koşusu, gerçek DOM):
- Ajan `open_browser`'ı iki kez çağırdı (example.com → example.org); gelen
  `ui_action` frame'inin tabId'si sunucudaki tek sekme kimliğiyle birebir aynı.
- Pane sayısı 2 → 2 sabit kaldı (chat + browser), tarayıcı pane'i hep 1;
  adres çubuğu A'da `https://example.com/`, B'de `https://example.org/`;
  iframe src ajanın URL'ini taşıyor.
- Sunucu tarafı: oturumda TEK sekme kaldı ve ikinci açılışta kimlik DEĞİŞMEDİ
  (`tab_..._20hvjs` → aynı) — yeniden kullanım, yeni sekme yok.

Probe dersleri (uygulama değil, ölçüm): sunucu çıplak host'ları normalize eder
(`https://example.com` → `https://example.com/`) — URL karşılaştırmaları sonda
slash'sız yapılmalı; taze (henüz transcript'siz) session detay GET'i tasarım
gereği 404 döner ve prob bunu ayıklar.

## Kalan

Yok — kabul kriterlerinin dördü de karşılandı (tur 1: sunucu 24/24 + canlı REST
11/11; tur 2: pane 18/18 canlı DOM).

## Notlar

- REQ-013 (browser sadeleştirme) sekme UI'ını bilinçli olarak sadeleştirmişti;
  bu istek onu geri getirmez, yalnızca tab yaşam döngüsünü "yeniden kullan"
  yönünde değiştirir.
