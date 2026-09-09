# REQ-095 — Pane windowed butonu toggle olsun (basınca tiling'e dön)

- **Status:** done (canlıda — 2026-09-09)
- **Asked:** 2026-09-09 — "windows moda girince, bunu açtığımız mod var ya pane'de; ona tekrar basınca windows moddan çıkıp normal tiling moduna geçsin" (ekran görüntüsü; vision servisi 500 — kontrolden teşhis).
- **Teşhis (koddan):** pane şeridindeki windowed/popout butonu `popoutPane` (`workspace.tsx:297`, REQ-046): windowed değilse `setWindowed(true)` + pencereyi yüzdürür; ZATEN windowed ise sadece `focusPane` yapar (yorum: "Already windowed → just focus"). İstek: ikinci basış `setWindowed(false)` ile normal tiling (split) düzene dönsün + toast'la bildirsin ("Back to tiling layout"). Pencere geometrisi saklı kalır (tekrar yüzdürünce aynı yer). 'yap' denmeden kod YOK.
- **Fix (recovery):** tick kirli ağaçla açıldı — önceki tick implemente edip commit'siz kesilmiş (REQ-069/071/072/075/084/085/087/088 örneği). Olduğu gibi benimsendi: `popoutPane` artık windowed iken `setWindowed(false)` + `emitToast('Back to tiling layout')` yapar; `setWinPos` geometriyi saklar (asla sıfırlanmaz), tekrar yüzdürme aynı noktaya döner.
- **Touched:** `packages/lokma-web/web/src/components/panes/workspace.tsx` (yalnız `popoutPane`).
- **Verify:** pane butonu → windowed + toast; AYNI buton tekrar → tiling'e dönüş + "Back to tiling layout" toast; geometri korunur (`winPos` silinmez); root tsc 0, web build green index-Bd7-Z8Kv.js (yeni string yalnız güncel bundle'da), lokma-web restart online, served == disk (BUNDLE-MATCH), gate 401 ON.
