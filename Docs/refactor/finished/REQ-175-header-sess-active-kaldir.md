# REQ-175 — Header'dan `sess_...` oturum kimliği ve "Active" durum rozeti kaldırılsın

**Status:** done (2026-09-29 — kod `f3bcd1a`, test `184e91e`, prob `7339ff7`)
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

## Kanıt (2026-09-29, canlı — prob + OCR + bundle)

- Uygulama: sağ blok (ayraç + `font-mono` `sess_...` + `Checking/Active/Down` rozeti) tamamen kaldırıldı; `sessionId`/`serverUp` Header prop'ları imzadan ve DÖRT çağrı yerinden (Bots modu, Design sayfası, mobil, masaüstü) temizlendi. `serverUp` state'i AppShell'de KALDI — FooterBar gateway durumunu zaten gösteriyor; oturum kimliği oturum listesinde.
- Prob `scripts/probe-header-clean.cjs` (canlı :3457, token mint edilerek — gate AÇIK kalır):
  **önce 4/7** — `sess_=true mono=["sess_mun3dqe"]`, `words=["Active"]` (header metni: `L lokma Bots Design sess_mun3dqe Active 0 · $0.00`) →
  **sonra 7/7 PASS** — `sess_=false mono=[]`, `words=[]` (header metni: `L lokma Bots Design 0 · $0.00`); 3 mod çipi görünür, maliyet rozeti (`0 · $0.00`, `title="WS open"`), tema/arama/ayarlar butonları yerinde, 0 yakalanmamış sayfa hatası.
- OCR kanıtı (başlık kırpması): önce `Bots / Design / s_munsdi / Active / $0.00` → sonra `Bots / Design / 0 · $0.00` — kimlik ve rozet metni kırpmada YOK.
- Ekran görüntüleri: `assets/REQ-175-ss1-before-header.png` · `ss2-after-header.png` · `ss3-before-full.png` · `ss4-after-full.png`.
- Birim kapıları: `shell.test.ts` 12/12 (REQ-175 iki yeni kaynak guard'ı: header kaynağı `sessionId`/`serverUp` adlarını taşıyamaz + hiçbir `<Header` çağrısı bu prop'ları geçemez) · `mobile-single-view.test.ts` 31/31.
- Kapılar: kök `bun x tsc --noEmit` 0 · steril web build yeşil · `pm2 restart lokma-web` sonrası servis edilen bundle == disk (`index-03fSVNKl.js` / `index-DPHugSuK.css`) · tokenless `/api/auth/me` 401 (gate ON).
- Not: prob INFO satırındaki 2× `/api/sessions/<id>` 404 konsol gürültüsü değişiklikten ÖNCE de vardı (bootstrap isteği) — kapsam dışı, bilgi amaçlı.
- Commitler: `f3bcd1a` (web) + `184e91e` (test) + `7339ff7` (prob) + bu kapanış docs commit'i.
