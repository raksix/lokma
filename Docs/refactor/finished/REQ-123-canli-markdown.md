# REQ-123 — Akış sırasında canlı markdown preview

- **Status:** done (canlıda — 2026-09-11)
- **Asked:** "Mesaj yazılırken ham markdown görünüyor, preview bitince
  geliyor; yazarken de anlık markdown olsun."
- **Did:** canlı metin dilimi artık bitmiş mesajlarla AYNI renderer'dan
  geçiyor (`AssistantBody`): başlık/kalın/liste/kod bloğu akış sırasında
  render olur, imleç sonda. Yarım fence'ler parser'da kod segmenti olur
  (tutarsız görünüm yok); bitmiş görünümle birebir aynı bileşen olduğu
  için akış→bitmiş geçişinde sıçrama yok.
- **Proof:** tsc 0, build green, served chunk canlı; E2E akış ortasında
  DOM'da `h:1, strong:1` (ham `#`/`**` değil).
- **Files:** `chat/single-chat-view.tsx` (canlı metin dalı).
