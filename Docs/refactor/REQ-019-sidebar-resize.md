# REQ-019 — Sol/sağ menüler resize edilebilir olacak

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "sol sağ menü de resize edilebilir olcak".
- **Interpretation:** Sol ve sağ sidebar'ların iç kenarında sürüklenebilir resize tutamacı olur (VS Code tarzı): basılı tutup çekince genişlik değişir, min/max limitli (örn. 160–640px), seçim persist edilir (reload'da korunur). Mobil drawer'lar etkilenmez (sabit 85vw/320px kalır).
- **Touched (plan):** `components/sidebar.tsx` (resize handle + pointer drag) + genişlik state'i (mevcut `leftW`/`rightW` persist'i varsa o kullanılır, yoksa eklenir).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless drag ile genişliğin değişip reload sonrası korunduğu kanıtlanır, bundle match.
