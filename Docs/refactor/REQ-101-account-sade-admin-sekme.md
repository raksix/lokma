# REQ-101 — Account yalnız kendi bilgisi; admin'e ayrı sekme

- **Status:** pending
- **Asked:** 2026-09-10 — "ayarlarda accountta sadece kendi hesap bilgilerim gözüksün. Admin özellikleri için ayarlarda ayrı sekme falan açarsın."
- **Teşhis (koddan):** Settings → Account bugün `LazyAuthPane`'i render ediyor (`settings-modal.tsx:193-194`) — kendi profili + kullanıcı tablosu + rol/proje/member yönetimi hepsi aynı ekranda. İstek: Account = yalnız kendi hesap bilgileri; kullanıcı/rol/proje atama gibi admin işleri `SETTINGS_SECTIONS`'a eklenecek ayrı sekmeye (adı 'yap'ta: Users/Admin) taşınır + sekme navigasyonda yetkiye göre gizlenir (`auth:manage` yoksa DOM'da yok) + içerik route-guard'lı. `SECTION_ICONS`'a ikon + `settings.ts` probuna yeni id eklenir.
- **Touched:** (yok — write-only; 'yap' denmeden kod YOK)
- **Verify:** canlıda Account'ta yalnız kendi bilgileri; adminde ek sekme (kullanıcı listesi/rol/atama çalışır); yetkisizde sekme görünmez, direkt section id ile de açılmaz.
