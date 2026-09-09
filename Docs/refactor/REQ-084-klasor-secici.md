# REQ-084 — Yol alanına arayüzden klasör seçici (file picker)

- **Status:** pending
- **Asked:** 2026-09-09 — "istersek yol girelim istersek de windows'ta ya da mac'te dosya yolu seçiyoruz ya o şekilde arayüzden de seçme olsun".
- **Interpretation:** New Project modalındaki Working directory alanı iki yollu olacak: elle yazma (REQ-083 ile yoksa oluşturulur) + "Gözat/Seç" butonu ile sunucudaki klasörleri arayüzden seçme (Windows/Mac dosya seçici deneyimi). Sunucu tarafında güvenli bir dizin listeleme endpoint'i gerekir (`GET /api/fs/list?path=` — HOME bazlı, jail'li, gizli/auth dosyaları filtreli) + modalda ağaç/dropdown seçici. 'yap' denmeden kod YOK.
- **Touched:** (yok — write-only)
- **Verify:** canlıda Gözat ile sunucu klasörü seçme + elle yazma ikisi de proje oluşturur; jail dışına çıkılamaz.
