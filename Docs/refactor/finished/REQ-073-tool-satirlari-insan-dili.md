# REQ-073 — Tool satırları insan diliyle görünsün (ham JSON yok)

- **Status:** done (2026-09-09 — impl `31c3253`, close-out `97e83d8`, filed to `finished/` by refactor-scan; canlıda — kullanıcı "bu tool calları düzgün şekilde yapsın bu ne amk, 2. SS'deki gibi gözüksün" dedi, implemente edildi; SS'lere bakılamadı — görüntü servisi 500 — canlı DOM'dan teşhis kondu)
- **Asked:** 2026-09-09.
- **Gap:** ThoughtTrace satırları `tool_adı` (mono) + ham JSON input (`list_files{"path":"."}`) basıyordu; sonuçlar obje geldiğinde hiç görünmüyordu (render sadece string result gösteriyordu).
- **Fix (`lokma-message.tsx`):**
  - `describeToolCall`: her tool'a bir cümle — Read/Listed/Wrote (+boyut)/Searched “…”/Ran …/Claimed/Completed/Asked; bilinmeyen tool'da `ad · kısa-girdi` fallback'i.
  - `summarizeResult`: hatada mesaj (dump yok), başarıda sayılabilir özet (N entries, X read, path, exit code), yoksa sessizlik.
  - Satır başına tool'a özel lucide ikon (read→BookOpenText, write→Pencil, list→FolderOpen, search→Search, run→SquareTerminal, todo→ListTodo, ask→HelpCircle).
  - `formatBytes` yardımcısı.
- **Touched:** `components/chat/lokma-message.tsx` (+describe/summarize/ikonlar/render), `lokma-message.test.ts` (§8, 13 case).
- **Proof:** probe 45/45, web tsc 0, build green, single-proc restart, headless mimo E2E: DOM'da `Listed Docs` + `Listed .` insan cümleleri, taze sayfada ham JSON text node'u yok; gate test boyunca ON (kısa OFF pencerelerinde E2E, sonrası `/api/auth/me` 401).
