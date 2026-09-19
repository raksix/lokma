# REQ-160 — Sayfa yenilenince gönderilen ekran görüntüleri kayboluyordu

**Status:** done
**Tarih:** 2026-09-19
**Kapsam:** `packages/lokma-web/server/src/session-feed.ts` (+ testi), problar:
`scripts/probe-attachment-ws.cjs`, `scripts/probe-attachment-ui.cjs`

## Belirti
Ajanın sohbete attığı görsel (ör. `browser_screenshot`) mesaj canlıyken ekranda
görünüyor, **sayfa yenilenince kayboluyordu**. Tool kartı "chat'e otomatik
eklendi (`attachedToChat: true`)" demesine rağmen sohbette ne görsel ne dosya
kartı kalıyordu.

## Kök neden
Zincirin her halkası sağlamdı **tek bir eşleyici hariç**:

| Halka | Ölçüm |
|---|---|
| Diskteki transkript satırı | `attachments` **var** (yol göreli: `.lokma/browser-shots/…png`) |
| REST `GET /api/sessions/:id` | `attachments` **var** |
| `GET /api/files/raw?cwd=…&path=…` | **200**, 816.806 bayt, geçerli PNG (1280×5198) |
| **WS `transcript_get` / `transcript_append`** | `attachments` **YOK** ← hata burada |

`session-feed.ts` içindeki `toTranscriptRow()` yalnızca
`role/content/timestamp/toolCallId/toolName` kopyalıyor, alanın geri kalanını
atıyordu. Yenileme sonrası sohbet satırları öncelikli olarak **soketten**
geldiği için (REQ-149) ekler düşüyor, istemci `message.attachments?.length`
koşulu yüzünden hiçbir şey çizmiyordu (dosya kartı bile çıkmıyordu).

## Düzeltme
`toTranscriptRow()` artık `message.attachments?.length` ise alanı satıra
kopyalıyor (şema zaten `attachments` opsiyonelini taşıyor). Tek satırlık,
dar kapsamlı bir değişiklik — istemci render yolu (`AttachmentView`) ve bayt
uçları zaten doğruydu.

## Kanıt
**Öncesi/sonrası (canlı WS, aynı oturum `sess_mu7la9j9_fvo6`):**
```
BEFORE (fix geri alındı) : rows: 10 | rows with attachments: 0
AFTER  (fix geri yüklendi): rows: 10 | rows with attachments: 1
   assistant [{"path":".lokma/browser-shots/tab_mu7lahax_tpld2b-…png","mime":"image/png",…}]
```

**Arayüz (gerçek tarayıcı, yenileme sonrası):**
```
PASS  an inline attachment image is painted after reload — images=1
PASS  the image actually decoded (naturalWidth > 0) — widths=[1280]
PASS  no attachment is stuck on the loading placeholder — loading=0
probe-attachment-ui: 3/3 checks passed.
```

**Test:** `packages/lokma-web/server/src/session-feed.test.ts` → 9 grup, hepsi
geçti (yeni grup: eklerin tele taşınması).

## Notlar / dersler
- Soket yolu artık sohbetin birincil kaynağı olduğu için **tel eşleyicileri**
  yeni satır alanları için tek gerçek risk noktası: yeni bir alan eklerken
  `toTranscriptRow`'u da güncelle, yoksa alan yalnızca canlıyken görünür.
- İstemci render'ı `cwd`ye bağlı: oturumun klasörü bilinmiyorsa görsel yerine
  dosya kartı çizilir (tamamen kaybolmaz). Bu yüzden "hiçbir şey görünmüyor"
  tablosu, sorunun satır verisinde olduğunun işaretiydi.
- Prob, oturumu sidebar'dan tıklamak yerine `localStorage['lokma:sessionId']`
  tohumlamasıyla açıyor — headless koşularda güvenilir yol bu.
