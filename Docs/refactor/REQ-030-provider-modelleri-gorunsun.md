# REQ-030 — Eklenen provider'ın modelleri model seçiminde görünsün

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "provider ekleyince ayarlarda model seçiminde model kısmında eklediğim tüm providerların aktif olan modelleri gözükmesi lazım" (+ ekran görüntüsü: Models paneli).
- **Interpretation:** Provider eklenince (ve aktifken) o provider'ın modelleri model seçiminde (header select, composer select, Models paneli) otomatik görünür. Ek bulgu (SS'ten): provider etiketleri yanlış — `DeepSeek Chat` ve `OpenRouter Auto`, `openai` etiketiyle görünüyor; her model gerçek provider'ıyla eşleşmeli.
- **Touched (plan):** provider→model katalog akışı (`models` store + `/api/models` birleştirme + `enabledModels` filtresi), provider etiketi eşleşmesi.
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile provider ekleyip model listesinde belirmesi + etiket doğruluğu kanıtlanır, bundle match.
