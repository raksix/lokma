# REQ-184 — Sohbette satır-içi markdown `_x_` (intraword alt çizgi) yutuluyor

**Status:** done (1 Ekim 2026 — tur 1: `356bd0c` `74dcbaf`; birim 100/100 + canlı prob 9/9; kapanış: bu kapanış docs commit'i)
**Tarih:** 2026-10-01
**Kaynak:** REQ-182 canlı doğrulaması sırasında bulundu (ölçümlü tespit — kullanıcı mesajı değil; REQ-183'ün "ölçüldü" kaydı gibi bir iç bulgu).

**İlişkiler:** [REQ-182](REQ-182-proje-ac-ui-aksiyonu.md) — bulunduğu doğrulama turu. Düzeltme bağımsız; sıra zorunluluğu yok.

## Bugünkü durum (kanıt)

1. **Tek satır kök neden:** `packages/lokma-web/web/src/components/chat/lokma-message.tsx:429` — `renderInline` regex'i:
   ```
   /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*\n]+)\*|_([^_\n]+)_|`([^`\n]+)`|~~([^~\n]+)~~/g
   ```
   `_([^_\n]+)_` alternatifi **her** `_..._` çiftini italik sayıyor. CommonMark'ta kelime-içi (intraword) alt çizgi — `foo_bar_baz` — LİTERAL kalmalıdır (left/right-flanking kuralı); bu regex onu `<em>` yapıp alt çizgileri tüketiyor.
2. **Ölçüm (canlı, REQ-182 tur 4):** bir hedef oturuma yazılan satırın kaynağı diskte birebir `Session sess_req182repro_mupwbnfd created`; okuma tam metin dönüyor (`GET /api/sessions/sess_req182repro_mupwbnfd` → 200, `messages[0].content` tam metin; WS `transcript` frame'i de tam metin taşıdı — `/tmp/repro182-ui2.cjs` çıktısı); ama UI DOM'unda kutu metni **`Session sessreq182repromupwbnfd created`** (alt çizgiler yok, orta parça `<em>` içinde). Yani kayıp VERİDE/okuma/taşımada değil, yalnız `renderInline` render'ında.
3. **Etki sınıfı:** çift alt çizgili HER dizge bozuk görünür (`a_b_c`, `sess_x_y`, `foo_bar_baz`). Tek alt çizgili token'lar (`read_file`, `open_project`) etkilenmez (regex çift ister). Kod harness'te çift-alt-çizgili oturum kimlikleri ve karışık snake_case sık geçer.
4. **Bulunduğu bağlam önemsiz değil:** REQ-182 "landing: chat shows the fresh session" kontrolü bu yüzden iki tur kırmızı kaldı (prob tam-form arıyordu; DOM düz-form üretiyordu) — prob tarafı geçici olarak iki formu kabul edecek şekilde adapte edildi, kalıcı çözüm bu REQ.

## Kapsam

1. `renderInline`'daki `_..._` alternatifini CommonMark sınırlarına çek: açılış `_`'inden önce kelime karakteri OLMAMALI, kapanış `_`'inden sonra kelime karakteri OLMAMALI (`(?<![\w])_([^_\n]+)_(?![\w])` ya da yakalama tabanlı eşdeğeri — **grup indeksleri `m[1..7]` korunmalı**, mevcut dallar bozulmamalı).
2. Regresyon testleri (`lokma-message.test.ts`, `renderToStaticMarkup` ile): `foo_bar_baz` literal; `_lorem_` italik; `a _b_ c` italik; `**bold**` / `*star*` / `` `code` `` / `[l](u)` / `~~s~~` aynen; kod span içi `` `a_b_c` `` dokunulmaz; `__init__` davranışı test edilir ve yorumda belgelenir.
3. `scripts/probe-open-project-ui.cjs`'teki geçici düz-form toleransı (`flatId`) kaldırılıp `chatMarker` tam-formla koşar.

## Kontrol (kabul kriterleri)

- `bun src/components/chat/lokma-message.test.ts` PASS (yeni + eski bloklar); kök `bun x tsc --noEmit` 0.
- Canlı: oturum satırında `sess_a_b` kaynağı UI'da **birebir** görünür (render edilen metin = disk metni).
- Steril web build + `pm2 restart lokma-web` + servis edilen bundle == disk hash; tokenless `/api/auth/me` 401 (gate ON).

## Dokunulacak yerler (öngörü)

- `packages/lokma-web/web/src/components/chat/lokma-message.tsx` — `renderInline` regex + yorum
- `packages/lokma-web/web/src/components/chat/lokma-message.test.ts` — regresyon blokları
- `scripts/probe-open-project-ui.cjs` — `chatMarker` tam-forma döner (düz-form toleransı kaldırıldı)
- `scripts/probe-intraword-underscore.cjs` — YENİ canlı prob (sıfır model çağrısı; sunucu-yazımı marker ile deployed bundle'da birebir render doğrulaması)

## Kanıt (tur 1, tamamlandı)

- Birim `bun src/components/chat/lokma-message.test.ts`: **100 PASS / 0 FAIL** — yeni REQ-184 bloğu 10 kontrol (intraword literal; `_lorem_` ve `a _b_ c` italik kalır; `__init__` literal; bold/star/code/link/strike aynen; kod span içi dokunulmaz). Proven-to-fail: eski regex `sess_a_b` içinde `_a_` yakalayıp `sessab` üretiyordu; yeni regex eşleşme döndürmüyor.
- Canlı prob `scripts/probe-intraword-underscore.cjs` **9/9 PASS** (deployed bundle, minted Bearer, gate ON, SIFIR model çağrısı): taze oturumun sunucu-yazımı marker'ı (`sess_muq6o0ef_m9rp` sınıfı — 2 alt çizgi) sohbette **birebir** render edildi, düz form YOK, 0 sayfa hatası; temizlik stays-gone (API 404 + diskte dosya yok) + geçici dizin silindi.
- Kapılar: kök `bun x tsc --noEmit` 0; steril web build yeşil (`index-BXYs68rF.js`); `pm2 restart lokma-web` sonrası servis edilen bundle == disk hash; chunk içinde yeni lookbehind'lı regex byte düzeyinde doğrulandı; tokenless `/api/auth/me` 401.

## Bitirme (done)

Atomik İngilizce commit + push; dosya `Status: done` + hash; `git mv` → `finished/`; README index + `Docs/00` kronoloji.

## Notlar

- Öncelik: düşük-orta (kozmetik ama geniş sınıf; düzeltme küçük, asıl maliyet regresyon testi).
- Lookbehind hedefi modern tarayıcı (Vite/React 19) — destek sorunu yok; alternatif olarak `(^|[^\w])` yakalama + yeniden numaralama seçilebilir.
- `_lorem_` gibi boşlukla çevrili çiftler ÇALIŞMAYA DEVAM ETMELİ (tek yönlü sıkılaştırma: yalnız intraword bastırılır).
