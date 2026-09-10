# REQ-098 — Ek dosya/resim limiti 20 olsun

- **Status:** done (canlıda — 2026-09-10)
- **Asked:** 2026-09-09 — "en fazla dosya resim yükleme limiti 20 olsun" (REQ-097 canlıya girdikten sonra tuning).
- **Interpretation:** `composer.tsx:40` `MAX_ATTACH_FILES = 3` → `20`; toast metni (`277-278`) sabiti okuduğu için otomatik güncellenir. Server taraflı ek cap'i yok (ekler metin olarak mesaja gömülüyor) — büyük-resim boyutu 'yap'ta gözden geçirilir. 'yap' denmeden kod YOK.
- **Touched:** `packages/lokma-web/web/src/components/chat/composer.tsx` (tek satır: `MAX_ATTACH_FILES` 3 → 20).
- **Verify:** root tsc 0; web build green index-BJ7_1mMV.js; `pm2 restart lokma-web` online, served == disk (BUNDLE-MATCH) + canlı bundle'da `G0=20` (toast sabiti), gate 401 ON.
