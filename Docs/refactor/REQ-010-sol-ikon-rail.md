# REQ-010 — En sola Inspector menüleri için ince ikon sidebarı

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "en sola da küçük bir sidebar, soldaki sidebarın menü itemları için... inspector nerdeyse oraya olacak... bu ss'deki şeyler sadece icon olarak güzel dursun diye olacak" (+ ekran görüntüsü: 23 Inspector menüsü).
- **Interpretation:** En sola (~48px) sabit ince ikon şeridi: 23 Inspector menüsü (Info, Providers, Models, Usage, Settings, Terminal, Git, Browser, Agents, Orchestration, Vault, Skills, Archify, Design, Testing, Bots, Auth, Setup, Plugins, Observability, Cron, Extras, Memory) SADECE ikon olarak dizilir (mevcut `TAB_ICONS` kullanılır, tooltip'te ad yazar). Tıklayınca ilgili Inspector içeriği yanındaki geniş panelde açılır. REQ-007 swap'i takip eder: Inspector sola geçerse bu şerit en solda, sağa geçerse en sağda olur (REQ-008 activity bar ile çakışırsa ikisi birleşir — karar kullanıcıda).
- **Touched (plan):** yeni `components/inspector-rail.tsx` (ince şerit, ikon-only butonlar + tooltip + aktif vurgusu), `app-shell.tsx` layout (şerit + geniş Inspector paneli yan yana), REQ-007 swap state'i ile konum takibi.
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile 23 ikonun doğru içeriği açtığı + swap takibi + dark/light kanıtlanır, bundle match.
