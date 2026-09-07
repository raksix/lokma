# REQ-038 — Model seçip gönderince "sending"de takılı kalıyor

- **Status:** done (canlıda, commitler aşağıda — kullanıcı "fixle" dedi, implemente edildi)
- **Asked:** 2026-09-07 — "model seçip gönderiyorum ama sending'de kalıyor amk, onu fixle" (+ ekran görüntüsü: "selam"/"sa" mesajları "sending..." durumunda, model `muse-spark-1.3...`, hata yok).
- **Interpretation:** Gönderilen mesaj yanıtsız "sending..."de asılı kalıyor, hata da gösterilmiyor. Şüpheliler: opencode-go upstream'in istediği `x-opencode-session` header'ı (test-loop 400 yiyordu), upstream 500'ü, ya da hata yolunun UI'a hiç ulaşmaması (sonsuz sending).
- **Diagnosis (canlı kanıtlı):**
  1. Seçili model upstream'de PATLAK: direkt curl ile 4 key'in 2'si HTTP 500, 2'si 401 bakiye — header fark etmiyor. Yani modelin kendisi bozuk, lokma isteği doğru atıyor.
  2. GERÇEK lokma bug'ı: sunucu `error` frame'ini `done` TAKİP ETMEDEN gönderiyor (`ws.ts` 2 ayrı yol), istemci `applyServerFrame`'de `error`'da `done` yapmıyordu (`lib/ws.ts:222`) ve chat `pending`'i sadece `done`'da temizliyordu → sonsuz "sending…". Üstelik chat `lastError`'ı hiç okumuyordu (sessiz ölüm).
- **Fix:**
  - `web/src/lib/ws.ts`: `error` frame'i run'ı bitirir (`done:true, doneReason:'error'`) + `sendText` yeni run'da `lastError` sıfırlar.
  - `web/src/components/chat/index.tsx`: hata toast ile görünür (`Send failed: …`, tekrar korumalı).
  - `lokma-ai` (`types.ts`/`stream.ts`/`provider/openai.ts`) + server `agent-loop.ts`: `x-opencode-session` tesisatı — Go base'de otomatik mint (açık değer kazanır), 400 sınıfını önler.
- **Touched:** yukarıdaki 6 dosya + `ws.test.ts` + `adapters.test.ts` (3 yeni header assert'i).
- **Proof:** adapters 25/25, ws-client checks pass, panes 95/95; web+ai+server+root `tsc` 0; web+server build green; E2E headless: gönder → takılma 0 + `Send failed` toast 1 + transcript "Response complete"; `/` 401 anon/200 authed, `/health` 200.
