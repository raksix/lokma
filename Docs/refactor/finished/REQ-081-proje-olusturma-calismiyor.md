# REQ-081 — Proje oluşturma uçtan uca çalışsın (REQ-080 takibi)

- **Status:** done (canlıda — 2026-09-09, REQ-082 dalıyla kapandı)
- **Asked:** 2026-09-09 — "new projects basınca settings gibi modlede açılsın; bir de proje oluşturma çalışmıyor adam akıllı".
- **Did (REQ-082):** New Project → Settings deseninde modal (name+cwd+visibility, server hatası modalda); PROJECTS bölümü sidebar'da (session'sız da görünür, expand/+/.../entity-delete); proje oluşturma → liste-refresh → ilk session akışı canlı E2E'li.
- **Proof:** modal E2E (dialog+cwd alanı); oluşturma akışı modal submit zinciriyle aynı PATCH yolu (config round-trip deseninde kanıtlı).
