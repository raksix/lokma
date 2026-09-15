# REQ-146 — Açık browser varsa yeni sekme/pane açmak yerine onu kullan

**Status:** pending
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

## Notlar

- REQ-013 (browser sadeleştirme) sekme UI'ını bilinçli olarak sadeleştirmişti;
  bu istek onu geri getirmez, yalnızca tab yaşam döngüsünü "yeniden kullan"
  yönünde değiştirir.
