# REQ-066 — İlk kurulum onboarding: auth sor, superadmin aç

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-08 — "kullanıcı ilk lokmayı kurunca web arayüzünde onboarding kurulum gelsin. 'auth istiyor musun?' diye soralım. auth ya da no-auth olarak seçsin. ordan kendine superadmin hesabı açsın. ordan isterse başka hesap da ayarlardan falan ekleyebilsin."
- **Mevcut durum:** `setup-pane.tsx` var (kurulum akışının bir parçası olabilir) + `registerFirstAdmin` (ilk admin kaydı, bootstrap) + davet sistemi (`inviteUser`/`acceptInvite`) MEVCUT. Eksik olan: ilk açılışta yönlendiren adım-adım onboarding ekranı + auth/no-auth seçimi + superadmin oluşturma.
- **İstenen akış:**
  1. İlk açılışta (hiç kullanıcı yoksa) tam-ekran onboarding sihirbazı: hoş geldin → "Auth istiyor musun?" (Auth'lu / Auth'suz).
  2. Auth'suz → mevcut açık instance davranışı (sonradan AuthPane'den açılabilir).
  3. Auth'lu → superadmin hesabı oluştur (email + isim + şifre) → bitir, giriş yap.
  4. Sonradan hesap ekleme ayarlardan (kullanıcı yönetimi + davet linki, mevcut `inviteUser` kullanılır).
- **Touched (plan):** web onboarding wizard (yeni) + `registerFirstAdmin` kablosu + `requireLogin` seçimi (REQ-063'teki anahtar), mevcut setup-pane ile birleşir.
- **Verify (plan):** root+web+srv tsc 0, build'ler green, restart'lar, headless E2E: temiz DB'de wizard → auth'lu seçim → superadmin login → ayarlardan ikinci kullanıcı daveti; bundle match.
