# REQ-061 — Harness cevapları çift yazıyor + kod yazamıyor (canlı arıza)

- **Status:** done (canlıda — kullanıcı "olum çalışmıyor amk, kod mod yazamıyor, harness şuan berbat durumda" dedi, implemente edildi)
- **Asked:** 2026-09-08 — SS'lere bakılamadı (görüntü servisi 500), canlı transcript (`sess_mtt0wea8_b27z`: "bana bir emlakcı landing sayfası yap") üzerinden teşhis kondu.
- **Bug 1 — çift metin:** her assistant cevabı transcript'e 2× yazılıyordu ("Selam!...Selam!..."). Kök neden `packages/lokma-ai/src/provider/openai.ts`: Responses API'de `output_text.delta`'lar tek tek yield EDİLİYORDU + `response.completed`'teki FULL metin üstüne ekleniyordu. (Mevcut test "concatenate" bekliyordu — gerçek upstream remainder değil FULL gönderiyor.)
- **Fix 1:** `unseenSuffix()` — completed tail sadece görülmemiş suffix kadar yield edilir (thinking için ayrı accumulator). Regresyon testi `adapters.test.ts` §2d (39/39 pass).
- **Bug 2 — oyalama:** model "hazırlıyorum, bakıyorum" deyip `list_files`'ı 2× çağırıp hiç yazmıyordu. Kök neden: tool system prompt'unda davranış kuralı yoktu (model sha-dance'i bilmiyordu).
- **Fix 2:** `buildToolSystemPrompt` sertleşti — anlatma-yap (narrate yasak), aynı tool'u üst üste çağırma, read→sha→write akışı, run_command tek-binary kuralı (`parse.ts`).
- **Bug 3 — turn limiti:** `LOOP_DEFAULT_MAX_TURNS = 5` gerçek işte yetmiyordu + mesaj "Send failed" gibi görünüyordu.
- **Fix 3:** limit 5→15 + mesaj "Paused after N tool turns ... say continue" (`agent-loop.ts`).
- **Proof (canlı, spark):** "write_file ile `.e2e-req061-proof.txt` yaz" → 4× write_file ok:true + 1× read_file ok:true, dosya içeriği `REQ061-OK` (doğrulandı, silindi); chat tail'de çift satır YOK (dedupe canlıda çalışıyor).
- **Touched:** `lokma-ai/.../openai.ts` (+unseenSuffix), `lokma-ai/.../adapters.test.ts` (§2d), `lokma-core/.../parse.ts` (prompt kuralları), `lokma-web/server/.../agent-loop.ts` (15 tur + mesaj).
- **Verify:** ai adapters 39 pass, core parse 37 pass, ai/core/srv/web/root tsc 0, 3 build green, single-proc restart, `/api/health` OK, canlı spark E2E dosya+transcript kanıtı.
