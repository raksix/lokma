# REQ-083 — "cwd does not exist" hatası: yoksa oluştur (düzelt)

- **Status:** in-progress (kullanıcı "düzelt" dedi — implemente ediliyor)
- **Asked:** 2026-09-09 — New Project modalında yol yazınca "cwd does not exist" hatası (ekran görüntüsü; vision servisi 500 döndüğü için görüntü okunamadı, teşhis koddan).
- **Teşhis:** `ProjectModal` cwd string'ini `POST /api/projects` ile gönderir → `createProject` → `assertCwd` (`packages/lokma-core/src/auth/store.ts:499`) sunucuda `stat(cwd)` yapar, yol yoksa 400 `cwd does not exist`. Kullanıcı sunucuda olmayan yolu (yanlış yazım / henüz açılmamış klasör) yazınca form patlıyor; placeholder "(must exist)" bunu dayatıyordu.
- **Fix:** `assertCwd` → `resolveCwd`: boş/undefined → `''`; `~`/`~/` → server HOME'a genişlet; yolu `mkdir -p` (recursive) ile oluştur, sonra directory olduğunu doğrula; hata mesajlarına çözümlenmiş yol ekle. `createProject` + `patchProject` normalize edilmiş yolu saklar. Modal placeholder "(created if missing)" olur. Kod değişikliği YOKken davranış: yazılan yol sunucuda otomatik açılır, proje oluşur.
- **Touched:** `packages/lokma-core/src/auth/store.ts`, `packages/lokma-core/src/auth/roles.test.ts`, `packages/lokma-web/web/src/components/sessions/project-modal.tsx`.
- **Verify:** temp-HOME roles probu (olmayan nested cwd ile create → 200 + klasör diskte var) + core/server/web build green + canlı probe (token minter ile proje aç/sil).
