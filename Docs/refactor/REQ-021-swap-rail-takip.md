# REQ-021 — Swap'te mini menüler panelleriyle birlikte yer değiştirsin

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "Explorer menüsü ile Inspector yer değiştirince, inspector menüsünün yanındaki küçük menü geliyor ama explorer menüsünün sağındaki menü gitmiyor, onu da ekle".
- **Interpretation:** REQ-007 swap'inde her panel kendi mini şeridiyle (rail) birlikte hareket etmeli: şu an Inspector tarafının şeridi geliyor ama Explorer tarafındaki şerit yerinde kalıyor. Fix: swap state'i panel+rail çiftini birlikte taşır — solda hangi gövde varsa onun şeridi yanında olur, sağda hangi gövde varsa onunki yanında; boşta şerit kalmaz.
- **Touched (plan):** `components/app-shell.tsx` (swap render mantığı — rail+panel çift olarak taşınır), rail bileşenleri.
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile swap öncesi/sonrası her iki tarafta doğru şerit+gövde eşleşmesi SS ile kanıtlanır, bundle match.
