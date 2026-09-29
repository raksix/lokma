# REQ-175 — Header'dan `sess_...` oturum kimliği ve "Active" durum rozeti kaldırılsın

**Status:** pending
**Tarih:** 2026-09-29
**Kaynak:** Kullanıcı mesajı (29 Eyl 2026):
> "sess_mtt0y10 falan yazmasıana gerek yok yanında active diye de bunu kaldır ya."

## Bugünkü durum

`packages/lokma-web/web/src/components/header.tsx:179-192` — mod çiplerinin sağında (`md:` ve üstü genişlikte görünür) blok:

- dikey ayraç (`mx-1 h-4 w-px bg-[#E8E4DE]`)
- **oturum kimliği:** `font-mono` span, `sessionId.slice(0, 12)` — ekran görüntülerinde `sess_mtt0y10`
- **durum rozeti:** `serverUp` durumuna göre `Checking` / `Active` / `Down` (yeşil/kırmızı pill)

## Kapsam

1. **Blok tamamen kaldırılır:** ayraç + oturum kimliği + durum rozeti. (Kullanıcı ikisini de istemiyor.)
2. **Prop temizliği:** kullanılmaz hale gelen `sessionId` / `serverUp` header prop'ları component imzasından ve `app-shell` çağrı yerinden temizlenir — ancak app-shell'in başka yerlerinde kullanılıyorlarsa yalnız header'a özel olan kaldırılır; `tsc`/lint temiz kalır.
3. **Bilgi kaybı yok:** gateway/oturum durumu alt durum çubuğunda zaten var (`gateway · 281ms`), oturum kimliği oturum listesinde görünür.
4. **Diğer header öğeleri aynen kalır:** mod çipleri (`lokma`/`Bots`/`Design` — REQ-173 kontrast düzeltmesiyle), ortadaki maliyet rozeti (`formatCostBadge(cost)` / wsStatus), sağdaki tema/arama/ayarlar/panel butonları.
5. **Dar ekran davranışı korunur:** blok zaten `md:` üstünde görünüyordu; kaldırma sonrası header dar genişlikte bozulmaz.

## Kabul (kabul kriterleri)

- Header metninde `sess_` ve `Active`/`Down`/`Checking` **YOK** (geniş ekranda da); diğer tüm öğeler yerinde.
- Kapılar: `bun x tsc --noEmit` 0; shell/header testleri güncel (kaldırılan alanlara bakan assert'ler temizlenir, yenisi eklenir); sterilize build; pm2 tek-proc restart; canlı bundle == disk hash.
- Yeni canlı prob `scripts/probe-header-clean.cjs`: header içinde `sess_` yok + `Active` rozeti yok + mod çipleri ve maliyet rozeti VAR.
- Before/after ekran görüntüsü REQ dosyasına/commit'e eklenir.

## Dokunulacak yerler (öngörü)

- `packages/lokma-web/web/src/components/header.tsx`
- gerekirse `packages/lokma-web/web/src/components/app-shell.tsx` (prop temizliği)

## Bitirme (done)

1. Kontroller canlıda PASS + kanıt (prob çıktısı + before/after ekran görüntüsü + bundle hash).
2. Atomik İngilizce commit(ler) + `git push origin main`.
3. Bu dosya: `Status: done` + hash'ler; `git mv` → `Docs/refactor/finished/`; README index güncellenir; `Docs/00-LOKMA-KONTEKST.md`'ye kronoloji satırı.

## Notlar

- Write-only: kod yazılmadı; worker uygular.
- Aynı dosyaya REQ-173 de dokunuyor (çip kontrastı) → sıralı işlenir (173 önce), çakışma beklenmez.
