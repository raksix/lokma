# REQ-097 — Chat input'a yapıştırma (Ctrl+V) + sürükle-bırak dosya eki

- **Status:** pending
- **Asked:** 2026-09-09 — "chat input'a ctrl+v ile resim/dosya yapıştırma ekle" + "drag drop da ekle".
- **Teşhis (koddan):** `composer.tsx`'te ek altyapısı VAR: `attachFiles` (text-only, 100KB cap) + `<attachment>` inline + explorer'dan drop `@path` olarak ekleniyor (`dropSignal`). EKSİK: (1) `onPaste` — panodaki dosya/resmi aynı hatta sokma; (2) OS'tan composera dosya sürükle-bırak (`onDrop` + `dataTransfer`); (3) resim hikayesi — bugün binary reddediliyor, resimler için vision-destekli ek (küçük önizleme + model vision) 'yap'ta kapsam kararı. 'yap' denmeden kod YOK.
- **Touched:** (yok — write-only)
- **Verify:** canlıda Ctrl+V ile dosya/resim + sürükle-bırak ile dosya eklenir, ek çipleri görünür, gönderide `<attachment>` gider; limit aşımı toast verir.
