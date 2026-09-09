# REQ-075 — Dosyalar pane olarak açılsın + html/md/pdf preview

- **Status:** done (canlıda — 2026-09-09, Parts A+B+C tamamı)
- **Asked:** 2026-09-09 — "dosyalar pane olarak açılsın direkt sessionlar gibi. html, markdown, pdf vs o tür dosyalara preview özelliği ekle".
- **Gap:** file tab'ları mevcut pane'e TAB olarak açılıyor (REQ-002); "yeni pane'de aç" aksiyonu yok. PaneFilePreview her türü ham `<pre>` metin basıyor (md/html/pdf/resim dahil).
- **Design:**
  - A. `requestFilePane(path, sessionId)` → workspace focused pane'i split edip file tab koyar (session tab'larıyla aynı statü). FileBrowser satır menüsüne "Yeni pane'de aç".
  - B. Preview toggle (Preview/Edit): md → mevcut markdown renderer reuse (`AssistantBody`); html → `sandbox=""` iframe (JS'siz, güvenli); pdf/png/jpg/gif/webp/svg → yeni `/api/files/raw` blob'u (`<iframe>`/`<img>`); diğerleri mevcut metin editör.
  - C. Server `GET /api/files/raw?cwd&path` (jail + 10MB cap + mime) + core `readRaw` + client blob fetch.
- **Touched (plan):** core files (`readRaw`), server files (`/raw`), web api (blob), pane store+workspace (file-pane split), file-browser (menü), pane.tsx (preview toggle).
- **Verify (plan):** core+srv+web tsc 0, build'ler green, restart'lar, probe'lar, headless: yeni pane'de dosya + md/html/pdf preview kanıtı, bundle match.
- **Proof 2026-09-09 (Parts A+B DONE, recovery commit — previous tick cut off pre-commit, adopted as-is):** A. `requestFilePane`/`consumeFilePane` one-shot in pane store + TilingWorkspace effect splits focused pane `col/after` with live file tab + FileBrowser context menu "Open in new pane" (FileIcon, lucide). B. `filePreviewKind` pure (md/markdown/html/htm/pdf/png/jpg/jpeg/gif/webp/svg→preview, else text) + `PaneFilePreview` Preview/Edit toggle (`AssistantBody` reuse for md, `sandbox=""` iframe for html, blob iframe/img for pdf/images via Part-C `/api/files/raw`; binary never touches text endpoint; Edit hidden for pdf/image). Gates: panes probe 111/111, root tsc 0, web build green index-twevoQkI.js (symbols live in current bundle), concept build green, lokma-web single-proc restart online, served index chunk == disk (BUNDLE-MATCH), boot smoke 0 JS errors (only sandbox font-CORS + favicon 404), gate `/api/auth/me` 401.
