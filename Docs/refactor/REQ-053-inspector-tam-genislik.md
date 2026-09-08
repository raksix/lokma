# REQ-053 — Öğeler Inspector sayfasının genişliği kadar olsun

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-08 — "bunlar da inspector sayfasının genişliği kadar olsun" (3 SS eklendi; görüntü servisi 500 verdiği için bakılamadı).
- **Interpretation:** Inspector içindeki öğeler (kartlar/satırlar/paneller) bulundukları sayfanın tam genişliğine yayılır — dar/sıkışık duran, kenarlarda boşluk bırakan öğe kalmaz (`w-full`, gereksiz max-width kısıtları kalkar).
- **Touched (plan):** Inspector pane içerik kapsayıcıları (uygulamada SS'lerle netleşir).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ölçümle tam genişlik kanıtı, bundle match.
