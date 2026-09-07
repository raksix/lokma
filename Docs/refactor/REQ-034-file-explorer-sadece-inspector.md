# REQ-034 — File explorer SADECE Inspector sidebar'ında görünecek

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "bu amına kodumun explorer, file explorer ki her seferinde sadece şeyde gözükecek, Inspector sidebarında" (+ ekran görüntüsü: sol file explorer).
- **Interpretation:** `FileBrowser` TEK yerde render edilir: Inspector sidebar'ının parçası olarak (swap'te Inspector nereye giderse onunla gider). Mevcut durum: REQ-011 ile solda SABİT (`leftStack`, swap'ten bağımsız) + mobil single-view'da ayrı instance — yani Inspector sağa geçince file explorer yanlış gövdede kalıyor. Fix: FileBrowser `inspectorContent`'in içine taşınır (swap mantığına dahil olur), mobildeki instance Inspector sekmesi mantığına bağlanır.
- **Touched (plan):** `components/app-shell.tsx` (`leftStack` sabitliği kaldırılır, FileBrowser inspectorContent'e taşınır), `components/shell/mobile-single-view.tsx` (mobil files sekmesi Inspector kapsamına alınır).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile DOM'da tek FileBrowser olduğu + swap'te Inspector'la birlikte hareket ettiği kanıtlanır, bundle match.
