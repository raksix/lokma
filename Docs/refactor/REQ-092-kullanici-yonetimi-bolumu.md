# REQ-092 — Settings → Account'a admin kullanıcı yönetimi bölümü

- **Status:** pending
- **Asked:** 2026-09-09 — "ayarlar kısmında account'ta sadece benim account yönetimim; settings'e admins, kullanıcı yönetimi kısmı falan ekle" (ekran görüntüsü; vision servisi 500 — tariften).
- **Interpretation:** Settings → Account bugün yalnız kendi hesabını yönetiyor (REQ-072). Admin/superadmin'e ek "Kullanıcı yönetimi" bölümü: kullanıcı listesi (isim, e-posta, rol rozeti, durum, son aktiflik), rol/değişiklik aksiyonları. Sadece `auth:manage` yetkisi olan görür; yetkisizde bölüm hiç render olmaz (section-level gate, 403 beklemez). Liste API'si hazır: `GET /api/users`. 'yap' denmeden kod YOK.
- **Touched:** (yok — write-only)
- **Verify:** canlıda admin Account'ta kullanıcı listesini görür + rol/durum değiştirir; calisan/viewer'da bölüm görünmez (DOM'da yok); API yetkisizde 403.
