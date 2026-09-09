# REQ-093 — Kullanıcı ekleme + projeye atama + proje-açma yetkisi

- **Status:** pending
- **Asked:** 2026-09-09 — "ordan kullanıcı ekleyip, kullanıcıya istediğim kadar proje ekleyebileyim ya da proje açma yetkisi de ekleyebileyim".
- **Interpretation:** REQ-092 ekranından uçtan uca: (1) kullanıcı ekleme — mevcut invite akışı (`POST /api/users/invite` + `/invite` kayıt) modal/sayfa olarak buraya taşınır; (2) projeye atama — bir kullanıcıya istenen kadar proje (`POST /api/projects/:id/members`, çoklu seçim + listeden kaldırma); (3) proje-açma yetkisi — rol yükseltme (calisan→admin) veya proje-bazlı `project:create` grant'i (hangisi: 'yap'ta politika kararıyla, varsayılan rol yükseltme). API'lerin tamamı hazır, iş UI + akış. 'yap' denmeden kod YOK.
- **Touched:** (yok — write-only)
- **Verify:** canlıda admin kullanıcı açar → 2 projeye atar → kullanıcı yalnız o projeleri görür → proje-açma yetkisi verilince kullanıcı proje oluşturur; yetki geri alınınca oluşturamaz.
