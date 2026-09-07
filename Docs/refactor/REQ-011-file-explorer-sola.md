# REQ-011 — File explorer sola taşınacak

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "ayrıca file exploreri de oraya taşı piç".
- **Interpretation:** `FileBrowser` (dosya ağacı + arama + önizleme/editör) sağdaki Explorer panelinden alınıp SOL tarafa taşınır (REQ-010'daki ikon şeridinin yanındaki geniş panele ya da mevcut sol panele — net yerleşim uygulamaya bırakıldı ama sonuç: dosya işlemleri solda). Sağdaki Explorer panelinde sessions + server kartı kalır. `openFile` → sekme akışı (REQ-002) ve cwd/session kapsamı aynen korunur, sadece bulunduğu panel değişir.
- **Touched (plan):** `components/app-shell.tsx` (`explorerContent` içinden `FileBrowser` çıkarılıp sol panele taşınır), REQ-007 swap'i ile çelişmeyecek şekilde (swap sadece Explorer↔Inspector gövdesini değiştirir, FileBrowser yeni sol yuvasında sabit kalır — karar kullanıcıda).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile solda dosya ağacının açılıp dosya tıklayınca sekme açtığı kanıtlanır, bundle match.
