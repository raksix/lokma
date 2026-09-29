# REQ-173 — Seçili "lokma" mod çipinin yazısı görünmüyor (açık zemin + açık/miras yazı rengi)

**Status:** pending
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
