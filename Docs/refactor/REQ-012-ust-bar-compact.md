# REQ-012 — Üstteki model seçimini kaldır, üst kısmı compact yap + ayarlar ikonu

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "ekranın en üst solundan model seçimi şeyini kaldır, orasını da en üst kısmını daha compact hale getir. ayrıca oraya ayarlar iconu da ekle ya".
- **Interpretation:** (1) Üst header'daki model seçici (`lokma-model-select`) kaldırılır — model seçimi composer'daki butonda + Models panesinde kalır, üstte yer kaplamaz. (2) Header daha compact hale getirilir (yükseklik `h-11` → daha ince, boşluklar sıkılaşır, session id rozeti sadeleşir). (3) Üst bara ayarlar ikonu (`Settings` lucide, dişli) eklenir — tıklayınca Settings panelini açar (REQ-009'daki detaylı ayar ekranı yapılana kadar mevcut Settings sekmesi).
- **Touched (plan):** `components/header.tsx` (model select silinir, yükseklik/padding sıkılaşır, sağ gruba settings butonu eklenir + `onOpenSettings` kablosu).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile üstte model select olmadığı + dişlinin Settings'i açtığı + Ctrl+M kısayolunun yeni hedefe gittiği (ya da kaldırıldığı) kanıtlanır, bundle match.
