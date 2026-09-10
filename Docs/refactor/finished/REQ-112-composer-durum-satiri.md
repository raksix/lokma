# REQ-112 — Composer altında canlı durum satırı

Status: done (2026-09-10, recovery commit — prior tick cut off before close-out)
Asked: Agent çalışırken composer input'unun altında o an ne yapıldığı görünsün
  (retry / onay bekleme / çalışan tool / düşünüyor / yazıyor).
Interpretation: Chat `streaming` iken Composer'ın altına küçük `role="status"`
  satırı eklendi — `LoaderCircle` spin ikonu + nabız animasyonlu metin.
  Öncelik: retry sayacı > onay bekliyor > çalışan tool adı > düşünüyor >
  yazıyor > genel "Çalışıyor…". Idle iken satır render edilmez (null).
Touched:
  - packages/lokma-web/web/src/components/chat/index.tsx (`runStatus` memo + `status` prop)
  - packages/lokma-web/web/src/components/chat/composer.tsx (`status?` prop + status row)
Verify: `bun x tsc --noEmit` 0 errors; status row only when streaming; Turkish strings.
