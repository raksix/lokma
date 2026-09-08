# REQ-046 — Pane'de ayrı pencere butonu (sürükle + resize)

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-08 — "ayrı pencere modu içinde panede bir tuş ekle, ona basınca ayrı pencere olarak alsın, istediğim yere sürükleyebileyim, resize edebileyim".
- **Interpretation:** Her pane şeridine "ayrı pencere" butonu eklenir — basınca o pane windowed modda bağımsız yüzen pencere olur; istenen yere sürüklenir + resize edilir (REQ-042 resize + REQ-014 opaklık ile aynı yüzey). Windowed canvas yoksa açılır.
- **Touched (plan):** `components/panes/pane.tsx` (şerit butonu), `workspace.tsx` (windowed'a taşıma), `windowed-canvas.tsx` (sürükle/resize — REQ-042 ile birleşebilir).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile butona basınca yüzen pencere + sürükle + resize kanıtlanır, bundle match.
