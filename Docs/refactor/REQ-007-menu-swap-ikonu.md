# REQ-007 — Sol/sağ menü yer değiştirebilir olacak, en sol üste swap iconu

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "sol sağ menü yer değişbireşblir olcakonun için en sol üste bir icon ekle yer değişrimek için".
- **Interpretation:** Explorer ↔ Inspector swap: header'ın en soluna bir swap ikonu (örn. `ArrowLeftRight`) eklenecek; tıklayınca sol/sağ paneller yer değiştirir. Tercih kalıcı olmalı (persist — layout store ya da localStorage), reload'da korunur. Kısayol/başlık metinleri (`[`/`]` açıklamaları) swap'i takip etmeli.
- **Touched (plan):** `components/header.tsx` (sol başa swap butonu), `components/app-shell.tsx` (hangi içerik hangi tarafta — `explorerOnLeft: boolean` state'i), persist katmanı (`stores/pane.ts` ya da localStorage anahtarı).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, canlıda butona basıp panellerin yer değiştirdiği + reload sonrası korunduğu headless ile kanıtlanır, bundle match.
