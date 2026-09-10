# REQ-109 — Browser her seferinde pane olarak açılsın, sidebar'dan asla

- **Status:** pending
- **Asked:** 2026-09-10 — "browser hiçbir şekilde sidebarlardan açılmamalı, direkt session gibi pane olarak açılmalı her seferinde!"
- **Teşhis (koddan):** browser bugün iki yoldan açılıyor: (1) pane sekmesi (`open_browser` ui_action + tiling browser tabı — doğru yol), (2) sidebar Inspector sekmesi (activity-bar `browser` key'i + rail `browser` girdisi → Inspector browser tabı — kalkacak yol). 'yap'ta: tüm browser açılışları pane sekmesine yönlendirilir (session açılışı gibi: yeni sekme + focus), activity/rail browser girdileri pane açar, sidebar Inspector'da browser render'ı kalkar.
- **Touched:** (yok — write-only; 'yap' denmeden kod YOK)
- **Verify:** canlıda browser'a nereden basılırsa basılsın pane sekmesi açılır; sidebar'da browser yüzeyi kalmaz; per-agent sekmeler korunur.
