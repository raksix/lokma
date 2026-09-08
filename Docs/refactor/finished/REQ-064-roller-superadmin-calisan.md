# REQ-064 — superadmin / admin / çalışan rol tanımları

- **Status:** done (2026-09-08 — implemented as REQ-062 Parça B in the same atomic run; this split file tracked the same work, no separate code)
- **Asked:** 2026-09-08 — "rol tanımları olacak: superadmin, admin, çalışan. çalışan sadece adminlerin izin verdiği projelere kendi özel session'larını açacak" (REQ-062'nin B parçası, bağımsız istek).
- **Mevcut durum:** global `admin|member|viewer` + proje üyeliği `member|viewer` (`can()` hepsini çözer). `superadmin` YOK. "Çalışan" YOK (en yakın: `member`).
- **İstenen rol matrisi:**
  - `superadmin` — instance sahibi: kullanıcı açma/kapama/rol değiştirme, TÜM projeleri görme, auth ayarları (`requireLogin` dahil), başkasına superadmin devri. İlk kaydolan kullanıcı otomatik superadmin olur (bootstrap korunur).
  - `admin` — proje açma/kapatma/silme, projeye üye davet/çıkarma, proje içi her yetki (tüm session'ları görme dahil), davet üretme.
  - `calisan` — SADECE üye olduğu projeleri görür; o projelerde SADECE KENDİ session'larını açar/görür/siler (başkasının session'ı listede bile görünmez); proje oluşturamaz, üye davet edemez, ayar göremez.
  - `viewer` (mevcut) — salt-okunur misafir olarak kalır.
- **Migration:** mevcut `member` → `calisan` birebir dönüşür (veri kaybı yok); mevcut ilk `admin` → `superadmin` olur. `can()` matrisine `session:view-own` / `session:view-all` ayrımı eklenir; session listeleme/okuma route'ları `ownerId` filtresi yer.
- **Touched (plan):** shared schema (rol enum + migration notu), core store (`can()` + session scoping + bootstrap ilk-superadmin), server routes (session filtreleri + admin API'leri), web (rol rozetleri + yetkisiz menüleri gizleme), Docs/36 güncellemesi.
- **Verify (plan):** root+web+srv tsc 0, build'ler green, restart'lar, headless E2E: calisan чужой session göremez + proje açamaz + admin her şeyi yapar + superadmin auth ayarını değiştirir; bundle match.
