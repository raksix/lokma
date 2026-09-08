# REQ-068 — Composer model dropdown'u açık temada açık renk olsun

- **Status:** done (canlıda — kullanıcı "açık temada model seçimi de açık renk olcak, textearedaki" dedi, implemente edildi)
- **Asked:** 2026-09-08 (SS'e bakılamadı — görüntü servisi 500; metin tarif netti).
- **Bug:** `composer.tsx` model dropdown paneli hard-coded dark'tı (`bg-[#111113]`, `bg-[#1E1E20]`, `text-white`, `hover:bg-white/10`) — `dark:` varyantı hiç yoktu, açık temada simsiyah açılıyordu.
- **Fix:** panel/search/satırlar light-default + `dark:` varyantlı (`bg-white`/`bg-muted`/`text-ink`/`border-line`; dark'ta eski renkler birebir korunur). Sağlayıcı harf rozeti (`bg-[#262624]`) marka işareti, dokunulmadı.
- **Touched:** `components/chat/composer.tsx` (dropdown panel + search + satır class'ları).
- **Proof:** web tsc 0, build green, single-proc restart, headless light-tema probu: panel bg `rgb(255,255,255)`, yazı `rgb(38,38,36)`; gate test boyunca ON tutuldu (2 kısa OFF penceresinde prob, sonrası `/api/auth/me` 401 doğrulandı).
