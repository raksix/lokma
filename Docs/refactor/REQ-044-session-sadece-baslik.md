# REQ-044 — Session listesinde sadece başlık görünsün

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-08 — "burdaki sessionlar da sadece session başlığı gözüksün, 2. ss'de attığım gibi" (2 SS eklendi; görüntü servisi 500 verdiği için bakılamadı ama istek net).
- **Interpretation:** Session satırlarında model rozeti, mesaj sayısı, zaman (`· 12 msgs · 2h` vb.) ve ek meta satırları kalkar — satırda SADECE başlık (hover aksiyon butonları kalır). Kompakt tek-satır liste.
- **Touched (plan):** `components/sessions/sessions-sidebar.tsx` (satır meta bloğu).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile satırlarda başlık-dışı metin olmadığı kanıtlanır, bundle match.
