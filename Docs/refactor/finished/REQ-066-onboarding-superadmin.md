# REQ-066 — İlk kurulum onboarding: auth sor, superadmin aç

- **Status:** done (2026-09-08 — full-screen `OnboardingWizard` (welcome → auth? → owner account / open confirm) + `settings.onboardingDone` (shared schema default false) + `POST /api/auth/onboarding` (fresh-only, idempotent, bootstrapped → 403) + App `onboarding` gate phase; auth path = register → superadmin PATCH requireLogin+onboardingDone → shell, retry-safe via accountCreated; open path persists choice server-side, later flips stay in Auth pane. Gates: root tsc 0, shared+core+server+web builds green, onboarding probe 15/15 + auth 57/57, scratch-server E2E (open record, idempotent repeat, register = superadmin, login/me, superadmin PATCH, post-bootstrap onboarding/register 403s), lokma-server + lokma-web single-proc restarted online, served index-Dizzikh_.js == disk dist with wizard strings live. Live instance untouched (bootstrapped:false, onboardingDone:false reverted after probe — wizard shows on next load).)
- **Asked:** 2026-09-08 — "kullanıcı ilk lokmayı kurunca web arayüzünde onboarding kurulum gelsin. 'auth istiyor musun?' diye soralım. auth ya da no-auth olarak seçsin. ordan kendine superadmin hesabı açsın. ordan isterse başka hesap da ayarlardan falan ekleyebilsin."
- **Mevcut durum:** `setup-pane.tsx` var (kurulum akışının bir parçası olabilir) + `registerFirstAdmin` (ilk admin kaydı, bootstrap) + davet sistemi (`inviteUser`/`acceptInvite`) MEVCUT. Eksik olan: ilk açılışta yönlendiren adım-adım onboarding ekranı + auth/no-auth seçimi + superadmin oluşturma.
- **İstenen akış:**
  1. İlk açılışta (hiç kullanıcı yoksa) tam-ekran onboarding sihirbazı: hoş geldin → "Auth istiyor musun?" (Auth'lu / Auth'suz).
  2. Auth'suz → mevcut açık instance davranışı (sonradan AuthPane'den açılabilir).
  3. Auth'lu → superadmin hesabı oluştur (email + isim + şifre) → bitir, giriş yap.
  4. Sonradan hesap ekleme ayarlardan (kullanıcı yönetimi + davet linki, mevcut `inviteUser` kullanılır).
- **Touched (plan):** web onboarding wizard (yeni) + `registerFirstAdmin` kablosu + `requireLogin` seçimi (REQ-063'teki anahtar), mevcut setup-pane ile birleşir.
- **Verify (plan):** root+web+srv tsc 0, build'ler green, restart'lar, headless E2E: temiz DB'de wizard → auth'lu seçim → superadmin login → ayarlardan ikinci kullanıcı daveti; bundle match.
