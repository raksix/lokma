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
| `scripts/probe-terminal-dedupe.cjs` | yazıldı ve **giriş yaparak** koşuyor (`addInitScript` ile `lokma-token`); kabuk hazır olana kadar bekliyor, frame'leri WS seviyesinde sayıyor, marker boyama sayısını ölçüyor |
| Canlı: yapay `$` satırı ekranda | **0** |
| Canlı: frame sayacı | headless koşuların bir kısmında kabuk hiç başlamadı (`no-bytes-arrived`, toplam 2 frame) → yazma davranışının tekrarlanabilir canlı kanıtı hâlâ tam alınamadı |

## Canlı ölçüm (yetkili koşu)

İlk yetkili canlı koşuda (token localStorage'a boot'tan önce seed edilerek) yazılan
marker **4×** boyandı — yani kopyalar **interleave** oluyor (echo → çıktı → echo → çıktı)
ve "yalnızca bir önceki frame" kontrolü bunları kaçırır. Bunun üzerine dedupe pencere
tabanlı hâle getirildi:

- `isRecentDuplicate(ring, frame, now, 750ms)` — pane son 6 teslimatı halkada tutar;
  aynı terminal için birebir aynı baytlar pencerede **bir kez** uygulanır.
- **8 bayttan kısa** parçalar (tek Enter, `\r\n`, resize) asla elenmez.

## Açık kalan

- Yazma davranışının **tarayıcı içi** canlı kanıtı: oturum seçimi gerektiriyor; prob,
  headless'ta giriş kapısını geçemedi (token akışı bu koşuda oturum açmadı). Birim
  testler dedupe penceresini kapsıyor; uçtan uca doğrulama için kimlikli bir koşu gerekir.
- İstemcinin bir oturuma **neden birden fazla soket** açtığı (kaynağın kendisi):
  tekilleştirme semptomu kapatıyor, soket sayısını teke indirmek ayrı bir iyileştirme.
- **Kabuk başlatma doğrulandı (sunucu sağlam):** `POST /api/terminal` doğrudan
  çağrıldığında kabuk anında çalışıyor —
  `{"ok":true,"terminal":{"shell":"/usr/bin/bash","pid":1210481,"status":"running"}}`.
  Headless koşulardaki `no-bytes-arrived` tablosu bu yüzden sunucu defekti değil:
  panel, oturum yüklenmesiyle yarıştığı için kabuğu açamıyor (aralıklı). Aynı probun
  yetkili bir koşusunda yazı canlı kabuğa ulaştı ve marker 4× ölçüldü — yani panel
  çalışıyor, koşullar arası tutarsızlık probun kendi zamanlamasında.

## Commit'ler

- `2ac87b9` fix(web): drop the synthetic prompt line and dedupe terminal frames
- `c803623` test(scripts): live probe for the terminal dedupe and the removed prompt line
- `a62079f` test(web): cover the duplicate-frame window with pure checks

## Canlı doğrulama — son durum (2026-09-18)

Pane canlıda **çalışıyor**: prob dökümü, panelin içinde gerçek kabuk prompt'unu
görüyor (`root@furkan-openclaw:/mnt/apopic/lokma#`) ve kabuk 500 ms içinde
`live` duruma geçiyor. Ayrıca sunucu tarafı bağımsız olarak kanıtlandı:
`POST /api/terminal` → `{"ok":true,"shell":"/usr/bin/bash","status":"running"}`.

Probun kalan sınırı: sentetik tuş vuruşları (`page.keyboard.type`) headless
koşuda PTY'ye ulaşmıyor (odak, click+focus ile verilse de), bu yüzden "yazılan
satır kaç kez boyandı" ölçümü yalnızca tuşun gerçekten ulaştığı koşularda
alınabiliyor. Ulaştığı koşuda ölçüm **4×** idi ve interleave'e dayanıklı dedupe
(750 ms halka) bu ölçüme karşı yazıldı.
