# REQ-042 — Windowed modda pencereler resize edilebilir olsun

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "windowed modunda pencereler resize edilebilir olsun".
- **Interpretation:** Windowed (floating) pencerelerin kenar/köşelerinden sürükleyerek boyutlandırma: min boyut limitli, konum+boyut persist edilir (reload'da korunur, mevcut `winPos` yapısı genişletilir). Sadece windowed mod etkilenir, tiling split oranları aynen kalır.
- **Touched (plan):** `components/panes/windowed-canvas.tsx` (resize handle'ları + drag mantığı + persist).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile köşeden resize + reload sonrası korunma kanıtlanır, bundle match.
