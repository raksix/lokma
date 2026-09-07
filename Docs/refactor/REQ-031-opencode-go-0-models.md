# REQ-031 — opencode-go testi 35 model buluyor ama satırda 0 models görünüyor

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "opencode go'da test ok — 35 models · 155ms diyor ama OpenCode Go satırında 0 models, key set, custom, base https://opencode.ai/zen/go/v1. 0 models diyor, güncellemiyor".
- **Diagnosis (kod okumadan, dokunmadan):** Test butonu canlı `/v1/models` endpoint'ine ping atıp sayıyor (`providers-pane.tsx:60,193` — "test ok, N models") ama sonucu provider'ın kayıtlı model listesine YAZMIYOR. Satırdaki sayaç ise birleşik `models` store'undan geliyor (`countModelsByProvider(models, p.id)`, kaynak `GET /api/models`) — orada opencode-go için 0 kayıt var. Yani katalog birleştirme opencode-go'nun canlı modellerini içermiyor ya da test sonrası refresh hiç koşmuyor. Fix yönü: test başarılı olunca bulunan modelleri provider kaydına persist et + `/api/models` birleştirmesine dahil et (REQ-030 ile ilişkili).
- **Touched (plan):** `providers-pane.tsx` (test sonrası persist), `/api/models` birleştirme + `models` store.
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile test sonrası satırda 35 models + Models panelinde görünme kanıtlanır, bundle match.
