# REQ-032 — Models Refresh tüm provider'ların /v1/models'ine istek atsın

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "modellerde refresh edince otomatik tüm modellerin v1/models'ine istek atsın işte".
- **Interpretation:** Models panelindeki Refresh butonu SADECE önbelleği okumak yerine, aktif (key set) TÜM provider'ların canlı `/v1/models` endpoint'ine istek atar, dönen listeyi birleşik kataloğa yazar (`GET /api/models` + store tazelenir), başarısız provider'lar satırında hata rozetiyle işaretlenir ama diğerlerini bloklamaz. REQ-030/031 ile aynı akışın parçası.
- **Touched (plan):** Refresh aksiyonu (`models-pane.tsx` + store refresh) + server tarafı toplu fetch (`/api/models/refresh` ya da mevcut refresh genişletmesi — uygulamada netleşir).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile Refresh sonrası opencode-go dahil tüm provider modellerinin listede belirmesi kanıtlanır, bundle match.
