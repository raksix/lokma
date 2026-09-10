# REQ-102 — Gönderim anında gönderilmiş görünsün, sending takılmasın

- **Status:** done (canlıda — 2026-09-10, commit 3154eff)
- **Asked:** 2026-09-10 — "direkt mesaj atınca sending... kalmasın, direkt gönderilmiş/işleniyor gibi olsun zaten."
- **Teşhis (koddan):** `single-chat-view.tsx:303-315` — gönderilen mesaj optimistic `pending` satırında "You · sending…" + kesik-çizgili balonla bekler; REQ-038 sessiz ölümü bitirdi ama yavaş upstream'de satır uzun süre "sending…"de kalır. İstek: satır anında normal gönderilmiş gibi görünsün (kesik çizgi/sending yok) ve akış REQ-103'teki çalışma göstergesine bağlansın; gerçek hata yine inline error card'a düşer (toast'a değil).
- **Touched:** `packages/lokma-web/web/src/components/chat/single-chat-view.tsx` (pending optimistic row only).
- **Verify:** canlıda Enter'a basınca mesaj anında normal görünür + altında çalışma göstergesi; hata olursa inline kart; yapay gecikmeli upstream'de takılma yok.
- **Proof:** web tsc 0 + web build green index-DFaV8-Ox.js; served == disk (BUNDLE-MATCH); fresh bundle'da `sending` 0 hit, pending satırda `border-dashed` yok (kalan dashed'ler drop-zone/placeholder bileşenlerinde); `RunErrorCard` aynen duruyor.
