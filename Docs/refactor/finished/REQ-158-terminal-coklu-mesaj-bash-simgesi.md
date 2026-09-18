# REQ-158 — Terminal: yazılan satır çoklu geliyordu + yapay `$` (bash) simgesi

**Status:** done
**Tarih:** 2026-09-18
**Kapsam:** `packages/lokma-web/web/src/components/terminal/terminal-pane.tsx`,
`terminal.ts` (`isDuplicateFrame`, `FRAME_DEDUPE_MS`), `terminal.test.ts`,
`scripts/probe-terminal-dedupe.cjs`

## Bildirim

> "terminalde bişiler yazınca çoklu geliyor mesajlar bir de şuradaki bash logundan yazmıyor hatta o bash simgesini kaldır"

## İki kusur

1. **Çoklu çizim.** Terminal çıktısı `terminal/data` frame'leriyle gelir. Bir oturuma
   **birden fazla soket** bağlanabildiği için aynı chunk istemciye iki kez ulaşabiliyor;
   pane her frame'i doğrudan scrollback'e eklediği için yazdığın satır 2-3 kez
   boyanıyordu. (Sohbetteki REQ-156 ile aynı sınıf: **yazma yolu** tekrarı, render değil.)
2. **Yapay prompt satırı.** Çıktının altında yeşil `$` + yanıp sönen imleç çiziliyordu.
   Gerçek kabuk kendi prompt'unu ve echo'sunu bastığı için bu satır sahte bir giriş
   alanı gibi görünüyor, yazılanı da göstermiyordu.

## Çözüm

- `isDuplicateFrame(prev, frame, now, window=80ms)` — aynı terminal için **birebir aynı
  baytlar** pencerede bir kez işlenir (tek teslim). Gerçek tekrar (arka arkaya iki Enter)
  kabuğun kendi echo çıktısıyla ayrıldığı için elenmez.
- Pane efektindeki satır içi kontrol bu saf yardımcıya taşındı; davranış birim testlerle
  doğrulanıyor (tarayıcı gerekmez).
- Yapay `$` + imleç satırı **tamamen kaldırıldı**.

## Kanıt

| Kontrol | Sonuç |
| --- | --- |
| `bun src/components/terminal/terminal.test.ts` | **61 passed, 0 failed** (5 yeni: pencere içi tek teslim, pencere dışı gerçek tekrar, farklı bayt, farklı terminal, ilk frame) |
| `bun x tsc --noEmit` | 0 hata |
| `bun run build` + pm2 restart | yeşil |
| Canlı bundle | `index-DwxgKB3o.js` |
| Kaldırılan `$` işareti canlı bundle'da | **0** eşleşme (`text-emerald-400">$`) |
| `scripts/probe-terminal-dedupe.cjs` | yazıldı; headless koşuda **login kapısına** takıldığı için (ekran: "Sign in to continue") yazma davranışının canlı kanıtı bu turda alınamadı |

## Açık kalan

- Yazma davranışının **tarayıcı içi** canlı kanıtı: oturum seçimi gerektiriyor; prob,
  headless'ta giriş kapısını geçemedi (token akışı bu koşuda oturum açmadı). Birim
  testler dedupe penceresini kapsıyor; uçtan uca doğrulama için kimlikli bir koşu gerekir.
- İstemcinin bir oturuma **neden birden fazla soket** açtığı (kaynağın kendisi):
  tekilleştirme semptomu kapatıyor, soket sayısını teke indirmek ayrı bir iyileştirme.

## Commit'ler

- `2ac87b9` fix(web): drop the synthetic prompt line and dedupe terminal frames
- `c803623` test(scripts): live probe for the terminal dedupe and the removed prompt line
- `a62079f` test(web): cover the duplicate-frame window with pure checks
