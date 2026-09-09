# REQ-095 — Pane windowed butonu toggle olsun (basınca tiling'e dön)

- **Status:** pending
- **Asked:** 2026-09-09 — "windows moda girince, bunu açtığımız mod var ya pane'de; ona tekrar basınca windows moddan çıkıp normal tiling moduna geçsin" (ekran görüntüsü; vision servisi 500 — kontrolden teşhis).
- **Teşhis (koddan):** pane şeridindeki windowed/popout butonu `popoutPane` (`workspace.tsx:297`, REQ-046): windowed değilse `setWindowed(true)` + pencereyi yüzdürür; ZATEN windowed ise sadece `focusPane` yapar (yorum: "Already windowed → just focus"). İstek: ikinci basış `setWindowed(false)` ile normal tiling (split) düzene dönsün + toast'la bildirsin ("Back to tiling layout"). Pencere geometrisi saklı kalır (tekrar yüzdürünce aynı yer). 'yap' denmeden kod YOK.
- **Touched:** (yok — write-only)
- **Verify:** canlıda pane butonu → windowed; AYNI buton tekrar → tiling'e dönüş + toast; geometri korunur; `WindowedCanvas` boş kalmaz.
