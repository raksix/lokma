# REQ-063 — Config'de auth açıksa loginsiz web'e erişim yok

- **Status:** done (2026-09-08 — implemented as REQ-062 Parça A in the same atomic run; this split file tracked the same work, no separate code)
- **Asked:** 2026-09-08 — "config'den auth açıksa hesapla login olmadan web harness'e ulaşılamasın" (REQ-062'nin A parçası, bağımsız istek).
- **Mevcut durum:** `AuthSettings`'te `enabled` anahtarı YOK; kural "ilk admin kaydolana kadar instance açık" (bootstrap). Web `App.tsx`'te login guard YOK — Auth sadece bir pane. API token istiyor ama arayüz istemiyor. (Canlıdaki nginx basic-auth uygulama-dışı, sayılmaz.)
- **İstenen:**
  1. `AuthSettings`'e `requireLogin: boolean` (default `false` — mevcut kurulumlar bozulmaz).
  2. `true` iken web boot'ta `/api/auth/me` 401 dönerse TAM EKRAN login ekranı (App düzeyinde guard; pane değil, atlatılamaz).
  3. WS handshake token'sız gelirse reddedilir (`/ws` + `/api/*` zaten token istiyor — delik taraması dahil).
  4. Anahtar hem `settings.json`'dan (config) hem AuthPane'den değiştirilebilir; ilk açılışta `false` kalır, süperadmin bilinçli açar.
- **Touched (plan):** `lokma-shared/schemas/auth.ts` (schema), `lokma-core/auth/store.ts` (default), `server/routes/*` (me kontrolü), web `App.tsx` (guard) + login ekranı.
- **Verify (plan):** root+web+srv tsc 0, build'ler green, restart'lar, headless E2E: `requireLogin=true` iken loginsiz açılışta login ekranı + korumalı route 401; `false` iken eski davranış; bundle match.
- **Live incident (2026-09-08):** kullanıcı "loginsiz giriliyor" diye şikayet etti. Kök neden: `/root/.lokma/auth/settings.json` 22:55'te `requireLogin:false`'a çekilmişti (wizard'daki "auth'suz devam" yolu ya da test yazımı). API `requireLogin:false` dönünce App gate `open` fazına geçiyordu. Fix: dosya `requireLogin:true` + `onboardingDone:true` yapıldı; canlı kanıt: `/api/auth/settings` true + `/api/auth/me` 401 + headless loginsiz açılışta `loginScreen:true, shellVisible:false`. Ders: gate anahtarı değişince `/api/auth/settings`'ten doğrula, dosyaya güvenme.
