# REQ-081 — Proje oluşturma uçtan uca çalışsın (REQ-080 takibi)

- **Status:** pending
- **Asked:** 2026-09-09 — "new projects basınca settings gibi modlede açılsın; bir de proje oluşturma çalışmıyor adam akıllı".
- **Interpretation:** İstek iki parça: (1) New Project butonu Settings (REQ-022) deseninde modal açsın — bu parça kardeş oturumun `REQ-080-projeler-invite-kayit.md` dosyasında (Design A) in-progress olarak zaten var, burada tekrar spec'lenmedi. (2) Proje oluşturma akışı uçtan uca bozuk — bu dosya onun takibi: 'yap' gelince önce canlı teşhis (form submit → API → DB → liste-refresh zincirinde hangi adım patlıyor), sonra kök-neden fixi.
- **Touched:** (yok — write-only; 'yap' denmeden kod YOK)
- **Verify:** canlıda modal formdan proje oluşturma 200 + sidebar PROJECTS'ta görünme + F5 sonrası kalıcılık; REQ-080 dalıyla çakışmayacak şekilde (o dal bitince rebase-kontrol).
