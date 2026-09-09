# REQ-075 — Dosyalar pane olarak açılsın + html/md/pdf preview

- **Status:** in-progress (kullanıcı "yap" dedi — implemente ediliyor)
- **Asked:** 2026-09-09 — "dosyalar pane olarak açılsın direkt sessionlar gibi. html, markdown, pdf vs o tür dosyalara preview özelliği ekle".
- **Gap:** file tab'ları mevcut pane'e TAB olarak açılıyor (REQ-002); "yeni pane'de aç" aksiyonu yok. PaneFilePreview her türü ham `<pre>` metin basıyor (md/html/pdf/resim dahil).
- **Design:**
  - A. `requestFilePane(path, sessionId)` → workspace focused pane'i split edip file tab koyar (session tab'larıyla aynı statü). FileBrowser satır menüsüne "Yeni pane'de aç".
  - B. Preview toggle (Preview/Edit): md → mevcut markdown renderer reuse (`AssistantBody`); html → `sandbox=""` iframe (JS'siz, güvenli); pdf/png/jpg/gif/webp/svg → yeni `/api/files/raw` blob'u (`<iframe>`/`<img>`); diğerleri mevcut metin editör.
  - C. Server `GET /api/files/raw?cwd&path` (jail + 10MB cap + mime) + core `readRaw` + client blob fetch.
- **Touched (plan):** core files (`readRaw`), server files (`/raw`), web api (blob), pane store+workspace (file-pane split), file-browser (menü), pane.tsx (preview toggle).
- **Verify (plan):** core+srv+web tsc 0, build'ler green, restart'lar, probe'lar, headless: yeni pane'de dosya + md/html/pdf preview kanıtı, bundle match.
- **Progress 2026-09-09 (Part C DONE, commit pending):** cut-off tick'in `readRaw` + `/api/files/raw` + `readWorkspaceFileRaw` diff'i adopt edildi — root tsc 0, core+srv+web build green, lokma-server/lokma-web single-proc restart, live probe 5/5 (png 200 image/png 13KB, svg 200, .ts 415 `no_preview`, missing 404, `../..` 400 `outside_root`), served bundle == disk `index-C4xWIOQV.js` (BUNDLE-MATCH, symbol current bundle'da).
- **Remaining (A+B):** `requestFilePane` split + FileBrowser "Yeni pane'de aç" menüsü + pane preview toggle (md reuse `AssistantBody`, html sandbox iframe, pdf/img blob).
