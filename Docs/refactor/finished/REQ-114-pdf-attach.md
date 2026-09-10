# REQ-114 — Ham PDF ekleme (server-side metin çıkarma)

- **Status:** done (canlıda — 2026-09-10)
- **Asked:** "ham pdf atamıoz harness'e" — PDF'ler `binary files` diye reddediliyordu.
- **Did:** `POST /api/attachments/extract` ({ name, dataBase64 }, 70MB body cap)
  PDF'i tmp'ye yazıp `pdftotext -layout` ile metne çevirir (poppler, zero npm
  dep); magic-byte `%PDF` kontrolü, 50MB üstü 413, metinsiz PDF'e 422
  (taranmış → OCR notu). Composer `.pdf`'leri bu endpoint'e yollar, dönen
  metin attachment olarak eklenir; file input `accept` listesine `.pdf` eklendi.
  Global login gate otomatik korur (yeni route, allowlist'e ek yok).
- **Proof:** SRV-TSC 0, WEB-TSC 0, iki build green, pm2 restart ikisi de online;
  endpoint curl: `LOKMA PDF TESTI BASARILI 12345` çıkardı; E2E canlı attach:
  `PDF-CHIP: true`.
- **Files:** `server/routes/attachments.ts` (new), `server/app.ts` (register),
  `web/lib/api.ts` (`extractPdf`), `chat/composer.tsx` (route + accept).
