# REQ-125 — İndirme her dosyada çalışsın

- **Status:** done (canlıda — 2026-09-11)
- **Asked:** "Download failed atıyor her şeye."
- **Kök neden:** dosya gezgini indirmeyi `/api/files/raw`'dan yapıyordu;
  o uç SADECE önizlenebilir tipleri servis eder (pdf/png/jpg/gif/webp/svg/
  html) — `.md`/`.ts`/`.json`/`.txt` dahil geri kalan her şey **415
  `no_preview`** yiyordu. Yani resim/pdf dışı her indirme patlıyordu.
- **Did:**
  - server `routes/files.ts`: yeni `GET /api/files/download?cwd&path` —
    jail + 10MB cap `/raw` ile aynı, uzantı filtresi YOK;
    `application/octet-stream` + `attachment; filename="..."` döner.
  - web `lib/api.ts`: `downloadWorkspaceFile()` (yeni uç).
  - `file-browser.tsx`: indirme `/raw` yerine `/download`'a geçti.
  - Pane tarafına dokunulmadı (orada pdf/resim önizlenebilir tipten
    iniyor, metinler içerikten kuruluyor — sağlam).
- **Proof:** SRV/WEB tsc 0, build green, chunk canlı; curl:
  `00-LOKMA-KONTEKST.md` → 200 octet-stream + attachment (336KB),
  `package.json` → 200 (1544B), missing → 404, `../outside` → 400.
- **Files:** server `routes/files.ts`; web `lib/api.ts`,
  `files/file-browser.tsx`.
