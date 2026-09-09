# REQ-094 — Session'lar kullanıcıya özel olsun (admin dahil)

- **Status:** pending
- **Asked:** 2026-09-09 — "sessionlar her kullanıcı için ayrı session olsun, adminin bile sessionları ayrı olsun, diğer kullanıcıların sessionunu görmesin".
- **Teşhis (koddan):** bugün `GET /api/sessions` `canViewSession` ile filtreleniyor (`sessions.ts:128`), `ownerId` create/fork'ta damgalanıyor. Ama: (1) admin/superadmin HERKESİ görür, (2) sahipsiz (unattributed) eski session'lar calisan'a görünür. İstek sıkı izolasyon: kimse başkasının session'ını görmez, admin dahil. AÇIK SORU ('yap'ta netleşir): admin gözetimi tamamen kalkar mı, yoksa admin "denetim modu" ile görebilir mi? Varsayılan: tam izolasyon + sahipsiz session'lar yalnız superadmin'e görünür (temizlik için). 'yap' denmeden kod YOK.
- **Touched:** (yok — write-only)
- **Verify:** canlıda iki kullanıcı + admin ile: herkes yalnız kendi session listesini görür; başkasının id'sine direkt istek 403/404; sahipsiz eski session kurala uyar.
