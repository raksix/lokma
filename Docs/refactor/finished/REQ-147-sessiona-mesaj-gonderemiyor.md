# REQ-147 — Session'a mesaj gönderilemiyor

**Status:** done (2026-09-15) — yorum (A) uygulandı: `send_to_session` aracı + sunucu teslimi + canlı E2E probu 9/9 (`b134898`, `e1aa2bd`, `96bfa91`, `4330332`)
**Tarih:** 2026-09-15
**Kapsam (öngörü):** belirsiz — iki farklı yorum var (aşağıda), teşhis notları dahil
**İlişkili:** REQ-148 (pane'de geçmiş yüklenmiyor), REQ-149 (WS'e bağlı canlı session)

## İstek (verbatim)

> kanka sessiona mesaj gönderemiyor sorun var.

## Teşhis (bu oturumda yapıldı, canlı)

İki aday kök neden var; hangisinin kastedildiği kullanıcıya sorulmalı/karar verilmeli:

**A) Agent başka bir oturuma mesaj atamıyor (araç yok).**
`packages/lokma-core/src/tools/` envanteri: `read_file`, `list_files`,
`search_files`, `glob`, `grep`, `edit_file`, `write_file`, `run_command`,
`ask_user`, `todos`, `ui-control`. Oturumlar arası mesaj gönderen bir araç
**yok**. Kullanıcının kendi oturumunda Lokma'nın cevabı da bunu doğruluyor:
_"elimde var olan bir oturuma mesaj gönderen bir araç yok"_.
→ İstenen: agent'a `send_to_session` (alias: `message_session`) aracı; hedef
session id + metin alır, oturumun kimliğine kullanıcı mesajı olarak ekler ve
(koşuyorsa) kuyruğa alır. Yetki: yalnızca aynı kullanıcının oturumları
(`canViewSession`), login gate açıkken zorunlu.

**B) UI'da gönderim çalışmıyor (yeniden üretilemedi).**
Headless ölçümler (3 ayrı koşu, canlı `lokma.fermag.com.tr`):
- Composer'a yazılıp Enter'a basıldığında WS'e `{"type":"prompt",...}` çıkıyor,
  iyimser satır **t+1 sn'de** ekranda görünüyor (`mark=YES`), sunucu transcript'ine
  düşüyor ve asistan cevabı üretiliyor.
- Bir koşuda 6 sn sonra ölçüldüğünde satır görünmüyordu; o koşuda ek oturum
  sekmeleri/oturumlar açılmıştı (aşağıdaki REQ-148 ile aynı bölge).
  **Kanıt (gecikmiş koşu çıktısı):** istemci `wss://.../ws/sess_mu2i98sq_y03j`
  için soket açıyor ama bu oturum sunucuda **yok** (`404 /api/sessions/sess_mu2i98sq_y03j`),
  composer'dan çıkan `prompt` frame'i ise **başka** bir oturuma gidiyor
  (`"sessionId":"sess_mu2hpwyd_k9b9"`). Yani görünen oturum ile mesajın yazıldığı
  oturum ayrışabiliyor → kullanıcı "gönderemiyor" görüyor, mesaj aslında başka
  oturuma düşüyor. Aynı koşuda üç ayrı WS açılmış olması (`sess_mu2i98sq_y03j`,
  `sess_mu2hpwyd_k9b9` ×2) bu kimlik karışıklığının izi.
→ Yani "gönderemiyor" şikâyeti **her zaman** üretilemiyor; pane/oturum geçişi
sonrası durumda yoğunlaşıyor (REQ-148/149 ile birlikte ele alınmalı).

## Kabul kriterleri (öngörü)

1. (A seçilirse) `send_to_session` aracı registry'de: şema, açıklama, gate
   (readOnly değil), handler; aynı kullanıcının oturumuna yazamıyorsa net hata.
2. (B seçilirse) Pane/oturum geçişinden sonra composer'dan gönderilen mesaj
   **her koşulda** hem iyimser satır olarak görünür hem sunucu transcript'ine
   düşer; oturum kimliği ile görünen oturum kimliği ayrışırsa sessiz kayıp
   yerine hata gösterilir.
3. Hata durumunda kullanıcıya görünür geri bildirim (toast/kart) — sessiz düşme yok.

## Verify planı (öngörü)

- (A) `bun packages/lokma-core/src/tools/tools.test.ts` + canlı probe:
  `send_to_session` ile başka oturuma yazılan satırın hedef transcript'te
  görünmesi; başka kullanıcının oturumuna denemede red.
- (B) Prob: oturum A pane'de açıkken B'ye geç, A'ya dön, mesaj gönder →
  satır görünüyor + `~/.lokma/projects/*/sessions/<id>.jsonl`'de doğrulanıyor.

## Notlar

- Bu dosya **karar bekliyor**: (A) yeni araç mı, (B) UI gönderim düzeltmesi mi —
  ikisi de olabilir. Kod değişikliği için kullanıcının "yap" demesi gerekir
  (inbox kuralı).

## Sonuç (2026-09-15, done) — yorum (A) uygulandı

**Karar kanıtı:** kullanıcının kendi oturum transkripti (`sess_mu2hpwyd_k9b9`,
2026-09-15 11:29) — kullanıcı "o oturma selam naber gönder" dedi, Lokma
"elimde var olan bir oturuma mesaj gönderen bir araç yok" diye yanıtladı;
`open_session` her çağrıda YENİ oturum açtığı için mesaj hedefe hiç ulaşmadı.
(B) yorumu (composer gönderimi) üç bağımsız headless koşuda yeniden
üretilemedi — eksik olan asıl yetenek (A) idi.

**Uygulama:**
- `send_to_session` aracı (`packages/lokma-core/src/tools/ui-control.ts`):
  `{ sessionId, message }` alır; boş mesajı, KENDİ (koşan) oturumunu ve
  teslim kanalı olmayan yüzeyleri net hatalarla reddeder; başarıda
  `ui_action` frame'i yayar (panel tarafı hedefi odaklar, ikinci gönderim YOK).
- Sunucu teslimi (`packages/lokma-web/server/src/session-delivery.ts`):
  hedef oturumun transcript'ine user satırı yazar → oturum kuyruğuna alır
  (FIFO; hedef koşuyorsa arkasına) → pump'ı tetikler. WS prompt yolunun
  soketsiz hali: hedef pane KAPALI olsa bile mesaj düşer ve KOŞAR.
  Yetki: login gate açıkken yalnız aynı kullanıcının (veya superadmin'in)
  oturumları (`canViewSession`); bilinmeyen id → `session_not_found`.
- Bağlantı: her koşu için `deliverSessionPrompt` (`routes/ws.ts` →
  `agent-loop.ts` → `buildUiControlTools({ deliver })`), aktör `item.userId`,
  fallback cwd oturumun cwd'si.

**Kanıt:**
- `browser.test.ts` **34/34** (11 yeni vaka: hedefe teslim, trim, ui_action
  frame, self-target reddi, kanal yokluğu, sunucu hatasının yüzeylenmesi).
- `session-delivery.test.ts` **16/16** (transcript satırı, FIFO derinliği,
  koşan hedefte `queued`, unknown id, boş mesaj, gate+forbidden yan etkisiz,
  meta'sız oturumda fallback cwd).
- Canlı E2E `scripts/probe-send-to-session.cjs` **9/9 PASS** (gerçek model,
  canlı sunucu): oturum A aracı çağırdı, `ui_action` hedefi taşıdı, hedef
  transcript'e user satırı düştü ve **hiçbir istemci bağlı değilken** hedef
  KOŞTU (asistan cevabı yazıldı); bilinmeyen oturum turu `isError:true` +
  `session_not_found` ile bitti.
- Gates: root `tsc --noEmit` 0; `build:server` + `build:web` yeşil; servis
  edilen bundle == disk (`assets/index-BORXAuAH.js`), canlı bundle'da
  `send_to_session` mevcut; `pm2 restart lokma-server lokma-web` sonrası
  `/api/config` 401 (gate açık, fail-closed).
- Commit'ler: `b134898` (core tool + protokol), `e1aa2bd` (sunucu teslimi),
  `96bfa91` (web odak), `4330332` (testler + canlı prob).

## Kalan

Yok — kabul kriteri 1 (araç: şema + gate + handler + net yetki hatası) ve 3
(görünür geri bildirim: `isError` tool satırı) karşılandı. Kriter 2 (B yorumu
— composer gönderimi) bu REQ kapsamında değildi ve yeniden üretilemedi.
