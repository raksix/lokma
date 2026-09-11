# REQ-126 — Tool satırları açılır olsun

- **Status:** done (canlıda — 2026-09-11)
- **Asked:** "Tool calling'ler açılmıyor."
- **Kök neden:** `ToolCallRow` düz `div` idi — tıklanacak mekanizma
  yoktu, sadece tek satır cümle + sonuç özeti gösteriyordu.
- **Did:** satır native `details/summary` oldu (ThinkingTrace ile aynı
  desen): kapalı hali eski tek satır + chevron; açık hali Input ve Result
  JSON'ları (pretty-print, 6KB cap, scrollable). Input çağrı sürerken de
  görünür, Result bitince iner. Canlı + transcript satırları aynı
  bileşenden geçtiği için tek fix ikisini de açar.
- **Proof:** WEB tsc 0, test green, build green, chunk canlı; E2E tıklama:
  `Listed Docs` satırı açıldı, DOM'da Input `{"path": "Docs"}` + Result
  entries JSON dolu. Probe session silindi.
- **Files:** web `chat/lokma-message.tsx` (ToolCallRow + ChevronDown import).
