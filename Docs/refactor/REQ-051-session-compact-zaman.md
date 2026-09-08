# REQ-051 — Session satırları compact + göreli zaman + aktiflik sıralaması

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-08 — "burası daha compact olsun. yazı hemen eksilmesin, genişliğe göre otomatik ayarlansın. ayrıca yanında ne kadar süre önce aktif olduğu m, h, d cinsinden (dakika/saat/gün) yazsın. en son prompt gelen en üste gelsin" (SS'e bakılamadı — görüntü servisi 500).
- **Interpretation:**
  1. Session satırları daha compact (dar padding, tek satır ağırlıklı).
  2. Başlık hemen kesilmesin — genişliğe göre otomatik uyarlanır (esnek truncate: yer varsa tamamı, darsa ellipsis).
  3. Her satırda göreli aktiflik süresi: `5m`, `3h`, `2d` (dakika/saat/gün).
  4. Sıralama: en son prompt/aktivite gelen en üstte.
- **Not:** REQ-044 (sadece başlık) ile kısmi çakışma — bu istek başlık + `m/h/d` rozetini birlikte ister; REQ-044'ün "sıfır meta" hali yerine "tek mini rozet" hali kazanır (kullanıcı onayı varsayıldı, dosyada dursun).
- **Touched (plan):** `components/sessions/sessions-sidebar.tsx` (satır düzeni + `relativeTime` m/h/d formatı) + `grouping.ts` (sıralama zaten updatedAt ise korunur, yoksa eklenir).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile satır kompaktlığı + `m/h/d` + sıralama kanıtlanır, bundle match.
