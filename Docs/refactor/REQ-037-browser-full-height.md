# REQ-037 — Browser içeriği kesik kalıyor, full height olsun

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "browser kesik kalıyor, full height olsun ya" (+ ekran görüntüsü: browser pane'de içerik üstte kalıyor, altta büyük boşluk).
- **Interpretation:** Browser pane içeriği (iframe/preview) pane yüksekliğinin tamamını doldurur — alttaki boşluk kalkar. Şüpheliler: içerik kapsayıcısında sabit yükseklik / `flex-1` eksikliği / iframe'e height verilmemiş olması. REQ-013 (browser sadeleştirme) ile birlikte ele alınabilir.
- **Touched (plan):** browser pane içerik kapsayıcısı (flex column + `flex-1 min-h-0`, iframe `h-full`).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile içerik kutusunun pane yüksekliğine eşit olduğu ölçümle kanıtlanır, bundle match.
