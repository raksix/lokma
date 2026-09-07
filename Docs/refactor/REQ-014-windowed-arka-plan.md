# REQ-014 — Windowed/sürüklenen panellerde arka plan yok (hayalet pane)

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "şu pane modunda windowed değilse ya da öylese... panelleri istediğim gibi sürükle bırak modunda yaptığımda onların arka planı yok, onu düzeltelim" (+ ekran görüntüsü: windowed modda sürüklenen "Empty pane" hayalet gibi şeffaf, arkadaki markdown görünüyor).
- **Interpretation:** Windowed (floating) panellerde solid arka plan yok — sürükleme sırasında ve üst üste binince arkadaki içerik görünüyor. Fix: windowed pencere kabına (`WindowedCanvas` pencere çerçevesi) solid yüzey rengi (`bg-card`) + gölge verilir; tiling split paneller zaten opak, onlara dokunulmaz. Sürükleme anındaki ghost/placeholder da opak olur.
- **Touched (plan):** `components/panes/windowed-canvas.tsx` (pencere kabına `bg-card` + `shadow-xl`, başlık çubuğu opak).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless windowed modda üst üste iki pane açılıp alttakinin görünmediği SS ile kanıtlanır, bundle match.
