# REQ-113 — Attachment limiti 50MB

- **Status:** done (canlıda — 2026-09-10)
- **Asked:** "only text files under 100KB can be attached ne amk, limit 50MB olsun."
- **Did:** `MAX_ATTACH_BYTES` 100KB → 50MB. 50MB'ın tamamı prompt'a gömülmüyor
  (context'i patlatır + server history'de zaten 8K'ya kısıyor) — ilk 100KB
  inline + `…[file truncated: N chars total]` notu. İkili dosyalar (pdf/doc)
  için ayrı net hata: text'e çevirip at.
- **Proof:** tsc 0, build green, served chunk'ta yeni stringler; E2E canlı:
  200KB txt chip olarak eklendi (eskiden reddediliyordu), fake.pdf yeni
  mesajla reddedildi.
- **Files:** `chat/composer.tsx` (limit + `INLINE_BUDGET_CHARS` + hata mesajları).
