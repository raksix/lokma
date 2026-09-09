# REQ-078 — By-Projects: max 5 session + expand + proje satırı (+ / ...)

- **Status:** done (canlıda — 2026-09-09)
- **Asked:** "by projects modunda max son 5 session gözüksün; proje adına basınca tüm sessionlar; satırın en sağında + (yeni session), solunda ... (proje işleri)".
- **Did:** `ProjectGroup` — collapse'ta ilk 5 (newest-first), başlık tıklayınca expand/collapse (+N more butonu da açar); en sağda `+` (o cwd'de yeni session), solunda `...` (menü: New session here, Copy project path, Delete all sessions… confirm'li toplu silme). Time modu aynen duruyor (ortak `makeRowProps`).
- **NOT:** grup = cwd gruplaması, AuthProject entity'si değil → menüde entity silme yok.
- **Proof:** tsc 0, sessions probe 32/32, build green; E2E: By project + 1 plus + 1 menü + "+N more" + "Delete all sessions" menüde.
- **Files:** sessions-sidebar.tsx.
