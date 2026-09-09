# REQ-088 — Modalda alanlar birbirini otomatik doldursun

- **Status:** done (2026-09-09)
- **Asked:** 2026-09-09 — "proje açarken browse de otomatik olarak, Working directory'de bişi girilse ona göre güncellesin".
- **Interpretation:** New Project modalında Working directory'ye yazıldıkça (ileride REQ-084 seçiciden klasör seçilince de) Project name BOŞSA klasörün son segmentinden otomatik dolar; tersi de: name yazılınca cwd BOŞSA `/mnt/apopic/<slug>` önerisi gelir. Dolu alan ASLA ezilmez (kullanıcı ne yazdıysa o kalır). 'yap' denmeden kod YOK.
- **Touched:** web auth.ts (`suggestProjectName` last-segment + `suggestProjectCwd` slug `/mnt/apopic/<slug>`, pure) + project-modal.tsx (name onChange → cwd önerisi, cwd onChange → name önerisi, picker "Use this folder" → name önerisi; üçünde de dolu alan korunur) + auth.test.ts (7 yeni assert, 68/68 pass)
- **Verify:** auth probe 68/68, root tsc 0, web build green (index-C3SWFcLV.js, sourcemap'te suggest*+REQ-088 mevcut), concept build green, lokma-web restarted, served bundle == disk. Canlı beklenti: cwd yazınca name önerilir, name yazınca cwd önerilir, elle doldurulmuş alan değişmez; önerilen cwd ile proje oluşturma REQ-083 (yoksa oluştur) ile çalışır.
