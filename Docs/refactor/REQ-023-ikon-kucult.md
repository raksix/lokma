# REQ-023 — Sol/sağ menü ikonları küçültülecek

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "sol ve sağ menüdeki iconlar biraz daha küçültülebilir".
- **Interpretation:** İki ince şeritteki (sol Inspector rail + sağ activity bar) ikonlar bir boy küçültülür (örn. `h-5 w-5` → `h-4 w-4`, buton kutusu da orantılı daralır), şerit genişliği korunur ya da hafif incelir. Tooltip ve tıklama alanı (min 28px) bozulmaz.
- **Touched (plan):** rail bileşenlerindeki ikon size class'ları.
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless SS ile boyut farkı kanıtlanır, bundle match.
