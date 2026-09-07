# REQ-029 — Session sidebar'dan pane'e sürüklenince split yapmıyor

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "session chati sidebardan alıp pane için sürüklüyorum, pane split yapmıyor aq. onları falan da düzeltmemiz lazım".
- **Interpretation:** Session satırı pane üzerine (özellikle kenarlara) bırakılınca split gerçekleşmiyor. Şüpheliler (uygulamada doğrulanacak): `WorkspacePane.handleDrop` + `dropZoneFor`/`splitForZone` kenar hesabı, `onDragOver`'da `hasPanePayload` engeli, drop koordinatının pane body dışına düşmesi, `SessionDropChooser`'ın split aksiyonu (`openSplit`) kablosu. Beklenen: kenara bırakınca split + yeni pane'de session açılır, ortaya bırakınca chooser gelir.
- **Touched (plan):** `components/panes/pane.tsx` (drop/zone/split akışı), gerekiyorsa `panes.ts` zone hesabı.
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless CDP drag ile kenara drop'ta split + yeni pane'de session tab'ı kanıtlanır, bundle match.
