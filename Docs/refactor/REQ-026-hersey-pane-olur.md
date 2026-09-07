# REQ-026 — Uygulamadaki her şey pane olarak kullanılabilir olacak

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "en sol en sağdaki menüdeki şeyler de pane'e sürüklenirse pane olarak da kullanılabilir. uygulamadaki her şey pane olarak kullanılabilir yani öyle olacak".
- **Interpretation:** Sol/sağ şeritlerdeki TÜM ikonlar (Inspector menüleri, sessions, git, explorer öğeleri...) tiling workspace'e sürüklenebilir olur; bırakınca ilgili yüzey pane tab'ı olarak açılır (mevcut session/file drop akışıyla aynı desen: open / split / focus). Hedef: uygulamadaki her yüzey pane'e taşınabilir — istisnasız.
- **Touched (plan):** rail ikonlarına drag payload (`PANE_TAB_MIME` / inspector id / session id / file path), `WorkspacePane.handleDrop` genellemesi, `SessionDropChooser` benzeri onay akışı gerekiyorsa.
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile her ikon tipinin drop ile pane tab'ı açtığı kanıtlanır, bundle match.
