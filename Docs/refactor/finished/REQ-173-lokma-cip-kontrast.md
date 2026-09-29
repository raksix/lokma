# REQ-173 — Seçili "lokma" mod çipinin yazısı görünmüyor (açık zemin + açık/miras yazı rengi)

**Status:** done (2026-09-29 — kod `85431ff`, prob `bd94e2b`)
**Tarih:** 2026-09-29
**Kaynak:** Kullanıcı mesajı + ekran görüntüsü (29 Eyl 2026):
> "lokma seçiliyken lokma yazısı gözükmüyor"
**Ek:** `assets/REQ-173-ss1-lokma-secili.png`

## Belirti

Üst çubuktaki mod geçişinde **`lokma` sekmesi seçiliyken** çip açık krem zemine (`bg-[#F2F0EB]`) sahip; ama etiketinin **kendi renk sınıfı yok** → koyu temada açık renk miras alıyor ve **açık zeminde kayboluyor** (okunmuyor). "L" rozeti kendi kontrastına sahip olduğu için görünür; yazı görünmez. Kullanıcı bunu "lokma seçiliyken lokma yazısı gözükmüyor" diye bildirdi.

## Kök neden (kod izleri)

`packages/lokma-web/web/src/components/header.tsx:132-147`:

- Aktif chat çipi: `(mode ?? 'chat') === 'chat' ? 'bg-[#F2F0EB]' : 'hover:bg-[#F2F0EB]'` — **açık dolgu**.
- Etiket: `<span className="hidden font-serif text-[15px] sm:block">lokma</span>` — **renk sınıfı YOK** (miras alıyor).
- Karşılaştırma: `Bots` (satır 156-160) ve `Design` (173-177) aktifken `bg-[#262624] text-white` kullanıyor; pasifken `text-zinc-600`. Header yorumu (satır 128-129) *"The active chip carries the ink fill"* diyor — chat çipi bu niyetten sapmış.
- Hover durumu da aynı tuzağa açık: `hover:bg-[#F2F0EB]` + miras renk → koyu temada hover'da da yazı kaybolur.

## Kapsam

1. **Metin rengi asla miras bırakılmasın:** üç mod çipinin (lokma/Bots/Design) tüm durumları (pasif / hover / aktif) **açık ve koyu temada** okunur olmalı; her durumda **explicit** renk sınıfı (aktif için `bg-[#262624] text-white` gibi — header yorumundaki "ink fill" niyetiyle tutarlı; ya da açık dolgu kullanılıyorsa `text-[#262624]`).
2. **Tutarlılık:** üç çip aynı aktif/pasif deseni kullanır (biri açık kremde beyaz, diğeri koyu dolguda beyaz olamaz).
3. **Erişilebilirlik korunur:** `role="tab"`, `aria-selected`, `data-mode-switch` alanları aynen; odak halkası kaybolmaz.

## Kabul (kabul kriterleri)

- Koyu **ve** açık temada before/after ekran görüntüsü: `lokma` seçiliyken yazı net okunur; Bots/Design için de aynı.
- **Hesaplı kontrast** (probe ile `getComputedStyle`; aktif + pasif + hover): metin/arka plan oranı **≥ 4.5:1** (WCAG AA).
- Yeni canlı prob `scripts/probe-mode-switch-contrast.cjs`: `data-mode-switch="chat"` seçiliyken etiket görünür ve kontrast ≥ 4.5:1; `bots`/`design` için de aynı ölçüm; her iki temada koşar.
- Kapılar: `bun x tsc --noEmit` 0; shell/header testleri güncel; sterilize build; pm2 tek-proc restart; canlı bundle == disk hash.

## Dokunulacak yerler (öngörü)

- `packages/lokma-web/web/src/components/header.tsx` (mod çipleri stilleri)
- gerekirse ortak çip stili yardımcısı (üç çip tek kaynaktan)

## Bitirme (done)

1. Kontroller canlıda PASS + kanıt (prob çıktısı + before/after ekran görüntüsü + bundle hash).
2. Atomik İngilizce commit(ler) + `git push origin main`.
3. Bu dosya: `Status: done` + hash'ler; `git mv` → `Docs/refactor/finished/`; README index güncellenir; `Docs/00-LOKMA-KONTEKST.md`'ye kronoloji satırı.

## Notlar

- Write-only: kod yazılmadı; worker uygular.
- `concept/` prototipi kapsam dışı.

## Kanıt (2026-09-29, canlı — prob + piksel)

- Prob `scripts/probe-mode-switch-contrast.cjs` (üç çip × idle/hover/seçili/seçili-hover × koyu+açık):
  **önce 20 PASS / 5 FAIL** → koyu chat seçili **1.06:1**, koyu hover'lar **2.08:1**, koyu chat hover **1.06:1**;
  **sonra 21/21 PASS** → koyu seçili **15.82** · koyu hover **13.74** · açık pasif **7.34** · açık hover **13.31** · açık seçili **15.16**.
- Piksel kanıtı (başlık kırpması, aynı kutu x64–143): önce etiket **#EDE9E2** / zemin **#F2F0EB** (≈1.05:1 — görünmez) → sonra **#0F0F11** / **#EDE9E2** (≈15.8:1).
- Ekran görüntüleri: `assets/REQ-173-ss2-before-dark.png` (önce) · `assets/REQ-173-ss3-after-dark.png` · `assets/REQ-173-ss4-after-light.png`.
- Kapılar: kök `bun x tsc --noEmit` 0 · steril web build yeşil · `pm2 restart lokma-web` sonrası servis edilen bundle == disk (`index-CYKSJnlL.js` / `index-BNbmKiO2.css`; CSS'te `.mode-chip` kuralları servis ediliyor) · tokenless `/api/auth/me` 401 (gate ON).
- Not: `src/components/shell/a11y.test.ts` içindeki 3 hata (dialog/focus-trap) bu değişiklikten ÖNCE de vardı (stash'li karşılaştırma: iki durumda da 48/3) — kapsam dışı, ayrı iş.
