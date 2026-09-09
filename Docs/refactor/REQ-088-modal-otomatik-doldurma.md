# REQ-088 — Modalda alanlar birbirini otomatik doldursun

- **Status:** pending
- **Asked:** 2026-09-09 — "proje açarken browse de otomatik olarak, Working directory'de bişi girilse ona göre güncellesin".
- **Interpretation:** New Project modalında Working directory'ye yazıldıkça (ileride REQ-084 seçiciden klasör seçilince de) Project name BOŞSA klasörün son segmentinden otomatik dolar; tersi de: name yazılınca cwd BOŞSA `/mnt/apopic/<slug>` önerisi gelir. Dolu alan ASLA ezilmez (kullanıcı ne yazdıysa o kalır). 'yap' denmeden kod YOK.
- **Touched:** (yok — write-only)
- **Verify:** canlıda cwd yazınca name önerilir, name yazınca cwd önerilir, elle doldurulmuş alan değişmez; önerilen cwd ile proje oluşturma REQ-083 (yoksa oluştur) ile çalışır.
