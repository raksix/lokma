# REQ-087 — Yeni projede session açılmıyor / yanlış projede açılıyor

- **Status:** pending
- **Asked:** 2026-09-09 — "yeni proje açtım ama session oluşmuyor, yine lokma projesinde session oluşuyor".
- **Teşhis (koddan, canlı izleme 'yap'ta):** zincirde `projectId` YOK. `handleProjectCreated` (`sessions-sidebar.tsx:641`) sadece `createSession({cwd: project.cwd})` çağırır; server `/api/sessions` (`sessions.ts:142`) body'de `projectId` almaz, meta'ya yazmaz. Sidebar "by project" gruplaması session cwd'sinin son segmentinden yapılır (`grouping.ts:88 projectOf`). İki kırık: (1) `if (project.cwd)` guard'ı — cwd'siz projede HİÇ session açılmaz ("oluşmuyor"); (2) cwd'li projede session beklenen grupta görünmüyor, lokma grubuna düşüyor ("yanlış projede") — olası noktalar: summary'deki cwd'nin düşmesi, REQ-083 öncesi ham (`~`/slash-farklı) kayıtlı cwd ile eşleşmeme, veya liste okumasının server dizinine sabit olması. 'yap'ta canlı iz + kök-neden fixi (aday: session meta'ya `projectId` damgası + gardiyanlı cwd eşleşmesi).
- **Touched:** (yok — write-only; 'yap' denmeden kod YOK)
- **Verify:** canlıda yeni proje → modal → Create: o projenin grubunda 1 session açılır ve seçili gelir; cwd'siz projede de session açılır; lokma grubuna düşme yok.
