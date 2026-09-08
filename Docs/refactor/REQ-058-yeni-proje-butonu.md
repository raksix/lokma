# REQ-058 — Yeni proje oluşturma butonu yok, eklenecek

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-08 — "yeni proje oluşturmak için buton yok gibi bu arada, onu da ekleyelim" (REQ-057'nin parçası olarak söylendi).
- **Interpretation:** Göze görünür "Yeni Proje" butonu eklenir (Explorer/sessions başlığı yanına): basınca proje adı + cwd seçimi → `~/.lokma/projects/` altında Boilerplate ile proje iskeleti + ilk session açılır. REQ-057'deki agent-yetenekle aynı backend'i kullanır (manuel + agent ikisi de).
- **Touched (plan):** sessions/explorer header butonu + `POST /api/projects` (yoksa) + iskelet şablonu.
- **Verify (plan):** root+web `tsc` 0, build'ler green, restart'lar, headless ile butondan proje açılıp dosya iskeletinin oluştuğu kanıtlanır, bundle match.
