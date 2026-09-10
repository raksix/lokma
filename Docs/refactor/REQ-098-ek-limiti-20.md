# REQ-098 — Ek dosya/resim limiti 20 olsun

- **Status:** pending
- **Asked:** 2026-09-09 — "en fazla dosya resim yükleme limiti 20 olsun" (REQ-097 canlıya girdikten sonra tuning).
- **Interpretation:** `composer.tsx:40` `MAX_ATTACH_FILES = 3` → `20`; toast metni (`277-278`) sabiti okuduğu için otomatik güncellenir. Server taraflı ek cap'i yok (ekler metin olarak mesaja gömülüyor) — büyük-resim boyutu 'yap'ta gözden geçirilir. 'yap' denmeden kod YOK.
- **Touched:** (yok — write-only)
- **Verify:** canlıda 20 dosya eklenir, 21'incide toast; build green.
