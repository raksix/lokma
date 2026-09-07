# REQ-013 — Browser panesini sadeleştir: sekme yok, sadece URL, içerik tam ekran

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "browser kısmında new tab falan eklemeye gerek yok. panenin üstünde panein içindeki tablar var ya ordan olacak. browser sayfasında sadece url girme alanı olsa yeter. bir de browser içeriği tüm ekranı kaplasın" (+ ekran görüntüsü: mevcut browser pane).
- **Interpretation:** (1) Browser pane'in kendi iç sekme satırı ("New tab" butonu, iç tablar) kaldırılır — sekmeler SADECE pane'in üst şeridindeki tab strip'te olur (her URL bir pane tab'ı). (2) Toolbar'da tek URL giriş alanı kalır (+ Go/Enter); back/forward minimumda tutulur, "AI visible" rozeti gibi kalabalıklar atılır. (3) Sayfa içeriği (iframe/preview) pane gövdesinin tamamını kaplar — üstte boşluk/header tekrarı yok, tam yükseklik.
- **Touched (plan):** browser pane bileşeni (`components/browser/browser-pane.tsx` — iç tab satırı silinir, toolbar URL-only olur, içerik `flex-1` tam alan).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile URL girilip sayfanın tam alanda render olduğu + iç sekme satırının olmadığı kanıtlanır, bundle match.
