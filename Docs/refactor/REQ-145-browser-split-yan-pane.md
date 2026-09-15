# REQ-145 — Browser açılırken ekran split edilsin, sayfa yan panele yaslansın

**Status:** pending
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
