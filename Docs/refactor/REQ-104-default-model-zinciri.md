# REQ-104 — Default model seçimi + akıllı geri dönüş zinciri

- **Status:** pending
- **Asked:** 2026-09-10 — "default model seçme olsun ayarlarda modellerden; eğer seçilemediyse en çok kullanılan modeli, yoksa da otomatik ilk gelen modeli default model ata."
- **Teşhis (koddan):** `defaultModel` config'de VAR ama Settings'te yalnız ham metin satırı (`config-pane.tsx:139`, elle yazılıyor); Models sekmesinde seçici yok. Kullanım verisi VAR (`GET /api/usage/summary` per-model split). İstek zincir: (1) Models sekmesinde Default model picker (etkin modellerden); (2) seçili yoksa en çok kullanılan model; (3) o da yoksa (sıfır kullanım) ilk gelen etkin model; (4) hiçbiri yoksa mevcut sabit fallback. Seçim `PATCH /api/config` (`defaultModel`) ile saklanır, composer/session açılışı bu zinciri okur. 'yap' denmeden kod YOK.
- **Touched:** (yok — write-only)
- **Verify:** canlıda picker'dan seçim → yeni session o modelle açılır; seçimi temizleyince en çok kullanılan gelir; kullanımı sıfırlayınca ilk model gelir; models boşken sabit fallback; zincir testi green.
