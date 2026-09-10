# REQ-102 — Gönderim anında gönderilmiş görünsün, sending takılmasın

- **Status:** pending
- **Asked:** 2026-09-10 — "direkt mesaj atınca sending... kalmasın, direkt gönderilmiş/işleniyor gibi olsun zaten."
- **Teşhis (koddan):** `single-chat-view.tsx:303-315` — gönderilen mesaj optimistic `pending` satırında "You · sending…" + kesik-çizgili balonla bekler; REQ-038 sessiz ölümü bitirdi ama yavaş upstream'de satır uzun süre "sending…"de kalır. İstek: satır anında normal gönderilmiş gibi görünsün (kesik çizgi/sending yok) ve akış REQ-103'teki çalışma göstergesine bağlansın; gerçek hata yine inline error card'a düşer (toast'a değil).
- **Touched:** (yok — write-only; 'yap' denmeden kod YOK)
- **Verify:** canlıda Enter'a basınca mesaj anında normal görünür + altında çalışma göstergesi; hata olursa inline kart; yapay gecikmeli upstream'de takılma yok.
