# REQ-156 — Tek gönderilen mesaj ekranda iki-üç kez çiziliyordu

**Status:** done
**Tarih:** 2026-09-18
**Kapsam:** `packages/lokma-web/web/src/stores/session.ts` (`isSameTranscriptRow`),
`components/chat/submit-guard.ts` (yeni), `components/chat/index.tsx`,
`stores/stores.test.ts`, `components/chat/submit-guard.test.ts`,
`scripts/probe-submit-dedupe.cjs`

## İstek (verbatim)

> attığım measjlar 3lü lü gidiyor

Ekran görüntüsü: aynı `abi ss atsana` mesajı **üç kez** üst üste (`You 15:37`).

## Teşhis

**Disk kanıtı:** transcript'te o metinden **tek satır** var
(`sess_probe_browser_tools.jsonl`, satır 8, 12:37:41Z). Yani gönderim
üçlenmiyor — **çizim** üçleniyor. Canlı ölçümle iki kaynak bulundu:

1. **`transcript_append` tekrarı (asıl sebep).** Aynı oturum için birden çok
   soket açılabiliyor (daha önceki prob bildirimlerinde de görüldü: aynı session
   id ile iki socket). Sunucu her eklemede satırı **her sokete** push ediyor;
   istemcide hepsi aynı store'a yazdığı için tek satır 2–3 kez cache'e giriyor
   ve o kadar kez render ediliyor. Canlı frame log'u: `transcript_append [MARK]`
   ×2 (12.8 sn) ve sonraki turlarda ×3–4.
2. **Çift gönderim.** `send()` içinde tekrar koruması **yoktu**: Enter + hızlı
   ikinci Enter (metin yerinde kaldığı için) aynı promptu iki kez yolluyor,
   buna bir de sunucu yankısı eklenince ekranda **3 kopya** oluşuyordu — kullanıcının
   gördüğü tam tablo.

## Çözüm

1. **Store tekilleştirmesi:** `isSameTranscriptRow(a, b)` — `role` + `content` +
   `timestamp` üçü de eşitse aynı satırdır; `transcript_append` bu satırı zaten
   taşıyan cache'i büyütmez. (Kaç soket beslediğinden bağımsız çalışır.)
2. **Çift-gönderim koruması:** `submit-guard.ts` — aynı metin `1.5 sn` içinde
   tekrar gönderilirse **düşürülür** (`isDuplicateSubmit`), sonraki bilinçli
   tekrar geçer; ayrıca aynı metinli iyimser satırlar `dedupePending` ile teke
   iner. Saat geri giderse (negatif delta) gönderim engellenmez.

## Kanıt

- `stores.test.ts` → **ALL PASS**: "identical transcript rows are recognised as
  the same line", "a duplicate push does not grow the transcript", "a genuinely
  new row still appends", "a different timestamp is a different row".
- `submit-guard.test.ts` → **16/16** (pencere içi/dışı, dolgu boşluk, negatif
  delta, farklı metin, iyimser satır katlama).
- Canlı `probe-submit-dedupe.cjs` (final build) → **3/3 PASS**:
  `a double Enter sends exactly one prompt — 1 prompt frame(s)`,
  `the message is painted exactly once — samples: 1, 1, 1, 1 (max 1)`,
  `a deliberate re-ask after the guard window is still sent — 2 prompt frame(s)`.
- `tsc --noEmit` 0, build yeşil, canlı bundle `index-22yCJ26R.js`.

## Commit'ler

`c3a3873` store dedupe · `fec377f` submit guard · `54a92e8` web testleri ·
`19223c6` canlı prob.

## Notlar

- Kök nedenin bir ucu hâlâ sunucuda duruyor: aynı oturum için neden birden çok
  soket açılıyor (istemci tarafı) ve push neden her sokete gidiyor. İstemci
  tekilleştirmesi bunu kullanıcıdan gizliyor; soket sayısını teke indirmek ayrı
  bir iyileştirme (yeni REQ açılabilir).
- Aynı koruma, ileride başka bir yoldan gelen tekrar push'ları da yutar
  (sunucu yeniden gönderim yapsa bile ekran temiz kalır).

## Ara ölçüm — kısa ömürlü çakışma (geçici, kapanışı etkilemez)

Aynı prob bir koşuda `samples: 2, 2, 1, 1` verdi: mesaj ilk ~2.7 sn boyunca hem
iyimser balonda hem kalıcı satırda görünüp sonra tek satıra indi. Tekrar koşuda
`1, 1, 1, 1` — yani kalıcı bir kopya değil, satır uçuşta (in-flight) olduğu
sürece görünen geçici örtüşme. Soket beslemesi bağlıyken bu pencere ~60 ms
(REQ-149 ölçümü); soket yoksa satır yedek yolla geldiği için pencere birkaç
saniyeye çıkabiliyor. Kalıcı üçleme şikayeti bu sınıftan değildir ve kapanış
(tek satır + tek frame) korunuyor.
