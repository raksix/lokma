# REQ-187 — Eklediğim dosyanın içeriği sohbette **gerçekten** görünsün (dosya içeriği bağlamı)

**Status:** pending
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

## Notlar

- **Write-only:** kod yazılmadı.
- REQ-186 + 187 tek cümle isteğin iki yarısıdır: "görseli gerçekten gör" + "dosya içeriğini mesajda gör". İkisi de **sessiz çalışma** değil, dürüst davranış ölçütüyle kapanır.
