# REQ-018 — Status bar gerekli bilgileri versin

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "status bar bunun gibi değil de daha gerekli bilgiler falan versin: işte gateway durumu, seçili proje, cpu kullanımı, ram kullanımı, token/s, lokma sürümü".
- **Interpretation:** Alttaki `FooterBar` ("All systems normal · [ / ] panels · Ctrl+K search · ? shortcuts / Lokma harness · Vite + Fastify + WS") yerine canlı bilgiler: gateway durumu (up/down + gecikme), seçili proje (aktif session'ın cwd/proje adı), CPU kullanımı %, RAM kullanımı (kullanılan/toplam), token/s (akış hızı, WS cost feed'den), lokma sürümü (package.json). Değerler periyodik tazelenir (mevcut 30sn health poll ritmi kullanılır, token/s WS'ten canlı). Kısayol ipuçları `?` penceresine taşınır.
- **Touched (plan):** `components/shell/footer-bar.tsx` (yeni alanlar + poll), server'da eksik metrik varsa endpoint (`/api/doctor` genişletilir ya da yeni `/api/metrics` — karar uygulamada).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile her alanın gerçek değer gösterdiği (sahte "0%" yok) kanıtlanır, bundle match.
