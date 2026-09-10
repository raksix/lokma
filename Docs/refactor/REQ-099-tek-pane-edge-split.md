# REQ-099 — Tek pane'de kenara sekme bırakınca split olmuyor

- **Status:** pending
- **Asked:** 2026-09-09 — "tiling'de tek pane ise, sağa/sola yapıştırınca 2 ayrı pane olmuyor, otomatik 2 pane'e dönmesi lazım, çalışmıyor".
- **Teşhis (koddan):** `pane.tsx:733` — `if (move.fromPane === id) return;`: sekme kendi pane'ine bırakılınca sessizce yutuluyor. Tek pane'de TÜM bırakışlar aynı-pane olduğu için edge-split hiç tetiklenemiyor (`splitLayout` tek kökte sorunsuz çalışır — sorun ağaçta değil, guard'da). İkincil: `workspace moveTab` edge dalı sekmeyi kaynaktan çıkarmıyor (cross-pane'de kopya bırakır).
- **Fix ('yap'ta):** aynı-pane + edge zone → `onMoveTab` ile split'e devam; aynı-pane + center → no-op. Edge dalında sekme kaynaktan çıkarılır (tek sekmeliyse kaynak boşalıp picker gösterir, pane kapanmaz).
- **Touched:** (yok — write-only; 'yap' denmeden kod YOK)
- **Verify:** canlıda tek pane'de sekmeyi sağ/sol kenara bırakınca 2 pane açılır, sekme yeni pane'e taşınır, eski pane picker gösterir; 2+ pane'de davranış değişmez.
