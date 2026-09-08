# REQ-053 — Öğeler Inspector sayfasının genişliği kadar olsun

- **Status:** done (canlıda — commit adbde06, 2026-09-08 refactor-scan loop turunda implemente edildi)
- **Asked:** 2026-09-08 — "bunlar da inspector sayfasının genişliği kadar olsun" (3 SS eklendi; görüntü servisi 500 verdiği için bakılamadı).
- **Interpretation:** Inspector içindeki öğeler (kartlar/satırlar/paneller) bulundukları sayfanın tam genişliğine yayılır — dar/sıkışık duran, kenarlarda boşluk bırakan öğe kalmaz (`w-full`, gereksiz max-width kısıtları kalkar).
- **Gap (bizde):** `packages/lokma-web/web/src` genelinde `max-w-*`/`mx-auto` taraması yapıldı — Inspector akışındaki TEK dar öğe Auth giriş kartıydı (`w-full max-w-[360px]`, ortalanmış 360px kart). Diğer `max-w-*` vuruşları dialog/modal/popover/drawer/truncate — hepsi doğru kısıtlı overlay, dokunulmadı.
- **Fix (bu tur):** Auth login kartından `max-w-[360px]` kalktı → `w-full min-w-0` (grid `place-items-center` içinde `min-width:auto` taşmayı engellemek için `min-w-0` şart — ilk denemede kart 202.6px'e taştı, `min-w-0` ile tam 193px'e oturdu).
- **Touched:** `packages/lokma-web/web/src/components/auth/auth-pane.tsx` (login kartı className + REQ-053 yorum satırı).
- **Proof:** web `tsc` 0, web build green, single-proc restart, bundle match `index-beDixr7w.js`, headless computed-style: cardW=193 == availW=193, maxWidth=none.
