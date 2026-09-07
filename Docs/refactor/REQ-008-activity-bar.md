# REQ-008 — En sağa VS Code tarzı ince activity bar ekle

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "en sağda bir tane panel ekle vscodedaki gibi orda işte burda olması gerekenleri oraya ekle... en üstte sessions onun altında git... en sağa küçük bir sidebar sabit kalacak" (+ ekran görüntüsü: VS Code activity bar referansı).
- **Interpretation:** App'in en sağına VS Code activity bar benzeri ince (~48px), sabit bir ikon şeridi eklenir. Yukarıdan aşağı: sessions (en üstte), altında git, altında diğer pane kısayolları (kullanıcı "kafana göre yap" dedi — tiling bar'daki 20 aksiyondan uygun görünenler: terminal, browser, vault, testing...), en altta ayarlar (dişli) + hesap/kullanıcı. İkona tıklayınca ilgili pane açılır (mevcut Inspector/Explorer içeriğini tetikler, yeni veri katmanı yok).
- **Touched (plan):** yeni `components/activity-bar.tsx` (sabit sağ şerit, lucide ikonlar), `app-shell.tsx` layout'a eklenir (mevcut sağ sidebar'ın SAĞINA, her zaman görünür), tıklama → ilgili Inspector sekmesini açar / pane'e taşır.
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile ikonların doğru panelleri açtığı + dark/light uyumu kanıtlanır, bundle match.
