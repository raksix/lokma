# REQ-041 — Tüm tıklanabilir şeylerde cursor:pointer olsun

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "cursor: pointer; tüm tıklanabilir şeylerde falan böyle olmalı aq".
- **Interpretation:** Butonlar, sekmeler, satırlar, ikonlar — tıklanabilen HER şeyde hover'da `cursor: pointer`.
- **Çakışma notu:** REQ-036 (crosshair imleç, finished/) ile çelişiyor — ikisi aynı yüzeyde olamaz. Karar: REQ-041 uygulanırsa REQ-036 geri alınır ya da kapsamlar ayrılır (örn. pane yönetim butonları crosshair, geri kalan pointer). Kullanıcı netleştirmeden ikisi birden yapılmaz.
- **Touched (plan):** global tıklanabilir kuralı (scoped, metin alanları hariç).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless computed cursor kanıtı, bundle match.
