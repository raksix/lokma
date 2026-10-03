# REQ-187 — Eklediğim dosyanın içeriği sohbette **gerçekten** görünsün (dosya içeriği bağlamı)

**Status:** in-progress (tur 2: `ffec99f`+`ae051b5`+`a48c3e3` kanal+kart + `d7e79b2` bütçe-düşen işareti; kalan: resmi prob + kapanış)
**Tarih:** 2026-10-01
**Kaynak:** Kullanıcı mesajı (1 Ekim 2026):
> "attığım remsi de mesaj içeriğinde görebielyim aq sik işler resim dosya falan attığımda alıp görebilsin"

**İlişkiler:** REQ-186 ile **aynı isteğin dosya yarısı** (görsel = `image_url`, dosya = içerik/ek). İkisi birlikte "ek, bağlamdır" ilkesini kapatır.

## Bugünkü durum (ölçülmüş)

1. **Bu oturumda ek, mesajın metnine dönüşmüyor.** Kullanıcı görsel eklediğinde mesajda yalnız `@image:/root/.hermes/images/<dosya>.png` pointer'ı ve "Examine it with the vision_analyze tool" talimatı var; dosyanın **içeriği** yok. Bu yüzden "alıp görebilsin" isteği karşılanmıyor.
2. **Dosya yolu tek başına yeterli değil:** model istemcide `read_file`/`grep` ile okuyabilir ama (a) bu ek bağlamı için **isteğe bağlı ve şansa** bağlı, (b) kullanıcı "dosyayı al" dediğinde ajan önce "dosyada ne var" diye bakmak zorunda kalıyor → yavaş ve yanıltıcı.
3. **Lokma tarafında bu **zaten** çalışıyor** ve doğru desen referans: REQ-155 `send_file` aracı + `attachments` alanı (görsel satır içi, diğerleri indirme kartı) + transcript'te `attachments` damgası (socket row mapper'ı alanı taşımak zorunda). Kopyalanacak davranış budur.
4. **PDF/ikili dosyada `readAsText` tuzağı:** sıkıştırılmış akış bağlama çöpü olur — server-side `pdftotext` ile çıkarılır, yoksa dürüst red + "metne çevir" yönergesi.

## Kapsam

1. **Kullanıcı eki mesajın içeriğine girsin:**
   - **Metin dosyaları** (`.txt/.md/.json/.csv/.ts/.js/.py/.yaml` vb.): içerik okunur ve mesaja **etiketli** eklenir (`<file name="x" path="…">…</file>` veya yapılandırılmış), boyut tavanıyla (örn. 200 KB) kırpılır ve `[truncated]` işaretiyle belirtilir.
   - **Görseller:** REQ-186 yolu (`image_url`); metin olarak gömülmez.
   - **PDF:** sunucu tarafında `pdftotext -layout` (yoksa dürüst red + yönlendirme), sayfa/ekleme sınırı.
   - **İkili/bilinen-görsel-dışı:** metne zorlanmaz; "bu dosya metin değil" + ne yapılabileceği söylenir.
2. **Görünürlük (UX):** ek, sohbette bir **kart** olarak da görünür (ad, tür, boyut, ilk satır/önizleme) — kullanıcı "girdi" olduğunu görür; model yine de içeriği okumuş olur.
3. **Bağlam bütçesi:** toplam ek bütçesi (örn. 1 MB karakter) aşılırsa en yeniler önce korunur, eskiler `dropped` işaretlenir; kullanıcıya neyin alınmadığı söylenir.
4. **Gizlilik/temizlik:** ek okuması oturum dosyasına **yazılmaz** (sadece çalışma anında), geçici dosyalar silinir.
5. **Yerel dosya yolu da olsun:** sürükle-bırak / yapıştır yolu da aynı kanalı tetikler (tek yazma yolu).

## Kontrol (kabul kriterleri)

- `.txt/.md/.json` eklenince model, içeriğe dayalı doğru bir cevap verir (dosyadaki benzersiz bir **jetonu** adıyla geçirmesi yeterli kanıttır).
- 300 KB dosya: içerik kırpılmış + `[truncated]` görünür, sohbet kilitlenmez.
- PDF: metin çıkarılmış (ilk cümle okunabilir) veya dürüst red.
- PNG eklenince içerik **görsel** olarak işlenir (metin kartı değil).
- 3 dosya + 1 görsel: hepsi bağlamda, hepsi kart olarak görünür.
- Prob: `scripts/probe-file-attachment-context.cjs` — pozitif (jeton geçiyor), kırpma, çoklu-ek, temizlik (geçici dosya silindi).

## Dokunulacak yerler

- Hermes: kullanıcı eki işleyen mesaj kurucusu, `attachments`/`<file>` taşıma, boyut tavanı
- Lokma eşdeğeri: `packages/lokma-core/src/tools/attachments.ts`, `packages/lokma-shared` transcript şeması, `web/src/components/chat/attachment.tsx`

## Bitirme (done)

1. Kontroller PASS + prob kanıtı.
2. İngilizce commit + push.
3. Dosya: `Status: done` + hash'ler.

## İş günlüğü

- Tur 1 (2026-10-02): **Taşıma kanalı + sohbet kartı + prompt dedupe** — üç atomik commit:
  - `ffec99f` fix(server): her prompt tel üzerinde TEK kez gidiyor. WS handler prompt satırını append edip kuyruğa alıyor, loop sözleşmesi ise `history`=ÖNCEKİ turlar + `prompt`=bu tur — satır replay edilince prompt İKİ KEZ gidiyordu (capture stub ile ölçüldü: messages [2] ve [3] aynı metin). Yeni `splitPromptRow()` (saf, birim testli) son satırı ayıklıyor; satırın görselleri `promptImages` ile prompt mesajına biniyor (REQ-186 görsel yolu aynen çalışıyor).
  - `ae051b5` feat(shared,core): `PromptFileSchema` (name/mime/size/content; dosya başına 100k karakter tavanı + işaret payı, prompt başına `PROMPT_MAX_FILES=10`) prompt frame'ine ve transcript satırına eklendi; lokma-core `SessionFile`; kuyruk öğesi + `toTranscriptRow` (REQ-160 tuzağı — soket feed'i alanı taşımazsa kart reload'da ölür).
  - `a48c3e3` feat(web,server): composer metin dosyalarını (PDF'ler extract ucundan) kırpılmış içerikle `files` olarak yolluyor; mesaj metnine artık `<attachment>` dökümü YAZILMIYOR. Pump bu turun dosyalarını prompt'a `<file name…>` blokları olarak katıyor; `buildLoopHistory` eski satırların dosyalarını ayrı (yeni-önce, 200k karakter) bütçeyle replay ediyor — takip turları eki görmeye devam ediyor, sohbet tahliye olmuyor. Sohbette kullanıcı balonunun altında kart (ad/mime/boyut/ilk satır + kırpılma notu); dosya-only gönderim birinci sınıf (send guard, iyimser satır, WS handler).
- **Canlı kanıt (deployed sunucu, gerçek WS + capture stub): 11/11 PASS** — (a) metin prompt'u telde TEK kez; (b) `<file name="notes.md">` bloğu bir kez, içerik jetonu bir kez, eski `<attachment>` dökümü yok, blok user mesajında; (c) REST transcript satırı `files[]` taşıyor, metin temiz. Prob: `/tmp/lokma-wire-probe.cjs` (11/11; oturum+provider+geçici dizin silindi, gate ON tokenless 401).
- Birim kapılar: shared ws 26/26 · agent-loop 48 (37 görsel + 5 dedupe + 6 dosya) · session-feed 11 grup · composer helper'ları 8. Kök `tsc --noEmit` 0; server + web build yeşil; canlı bundle `index-Cb9oE5PW.js` == disk.
- Tur 2 (2026-10-03): **Bütçenin düşürdüğü ekler artık ADIYLA işaretli** — `droppedFilesNote()` (saf, birim testli; `agent-loop.ts`) replay bütçesini (200k) aşan ekleri `[attachments dropped (over the history attachment budget): <adlar>]` satırıyla yazar; bütçeyi tek başına aşan dosya-only tur önceden SESSİZCE düşerken artık işaretle birlikte akar (model "ek hiç yoktu" diyemez). Test: 7a2 (boş→işaretsiz, ad verir), 7c (blok düşer + ad İŞARETTE), 7c2 (cap-üstü dosya-only tur akar) — 47+52 PASS; kök tsc 0; server build yeşil; `pm2 restart lokma-server` + dist'te işaret doğrulandı + `/health` 200. Commit `d7e79b2`.
- Yol / tek-kanal notu: sürükle-bırak (`onDrop` → `attachFiles`, composer.tsx:582-588), Ctrl+V (`onPaste` → `clipboardData.files` → `attachFiles`, composer.tsx:773-776) ve dosya seçici aynı TEK yazma yolunu paylaşır; explorer'dan sürüklenen dosya ise mevcut `@path` mention kanalıdır (proje bağlamı — bilinçli ayrı). Bu kalan iş kod gerektirmedi, doğrulandı.
- Kalan (sonraki tur): resmi prob `scripts/probe-file-attachment-context.cjs` (pozitif jeton / kırpma / çoklu-ek / PDF / temizlik uçları) + kapanış.

## Notlar

- Tur 1'de uygulandı (refactor worker loop — pending REQ kuyruğu). Tur 1 öncesi write-only idi.
- REQ-186 + 187 tek cümle isteğin iki yarısıdır: "görseli gerçekten gör" + "dosya içeriğini mesajda gör". İkisi de **sessiz çalışma** değil, dürüst davranış ölçütüyle kapanır.
