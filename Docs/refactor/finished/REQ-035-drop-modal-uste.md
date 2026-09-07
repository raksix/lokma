# REQ-035 — Dropped session modali alta sıkışıyor, üste çıkar

- **Status:** done (live 2026-09-07 — implemente edildi, bundle-match kanıtlı)
- **Asked:** 2026-09-07 — "dropped session modali sıkışıp alta kalıyor, üste çıkar onu" (+ ekran görüntüsü: Dropped session dialog — Open here / Split / Fork here / Merge / Cancel).
- **Note:** SS'te modal ortada düzgün görünüyor — sorun dar/kısa pane'lerde: dialog pane altına sıkışıyor ya da içerik altında kalıyor. Fix yönü: `SessionDropChooser` overlay'i pane içinde ortalı + üstte tutulur (yüksek z-index, `max-h` + iç scroll, küçük pane'de kompakt padding), hangi pane'e bırakıldıysa onun üstünde açılır.
- **Touched (plan):** `components/panes/pane.tsx` (`SessionDropChooser` konum/z-index/boyut).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile dar pane'e drop'ta modalın tam görünür olduğu SS ile kanıtlanır, bundle match.
- **Fix:** `pane.tsx` — overlay `items-center z-20 p-3` yerine `items-start z-50 overflow-y-auto p-2 pt-4` (üstte açılır, kısa pane'de overlay scroll eder); kart `max-h-[calc(100%-0.5rem)] overflow-y-auto p-2.5` (kendi içinde scroll, kompakt padding); `role="dialog" aria-modal` + Escape ile kapatma (busy iken kilitli). Buton grid'i (`grid grid-cols-2 gap-1`) aynen korundu.
- **Proof:** root+web `tsc --noEmit` 0 hata, `vite build` green (`index-Ew24LIKN.js`), `pm2 start ecosystem.config.cjs --only lokma-web` online, served==disk BUNDLE-MATCH + served bundle'da `items-start` doğrulandı.
