# REQ-022 — Ayarlar ekranda modal olarak açılsın

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-07 — "abi ayarlar modal olarak açılsın ekranda, ekran görüntüsündeki gibi" (+ ekran görüntüsü: OpenCode tarzı büyük ayarlar modalı).
- **Interpretation:** Ayarlar (REQ-009'daki detaylı sistem) pane/sekme yerine ekran ortasında büyük MODAL olarak açılır: arkası karartılmış backdrop, solda kategori navigasyonu + sağda içerik, sağ üstte X, Escape ile kapanır, focus trap'li. Referans bölümler (OpenCode): Model, Chat, Appearance, Workspace, Safety, Browser, Memory & Context, Voice, Advanced, Notifications, Billing, Providers, Gateways, Keyboard Shortcuts, Tools & Keys, Plugins, Archived Chats, About — lokma karşılıklarıyla (Providers, Models, Appearance, Sessions, Permissions, MCP, Memory/Vault, Cron, Shortcuts, Plugins, About...). Dişli ikonları (REQ-012 üst bar + REQ-008 activity bar) bu modalı açar.
- **Touched (plan):** yeni `components/settings/settings-modal.tsx` (dialog kabı + sol nav + sağ içerik, mevcut pane içerikleri gömülür), açma kabloları (header dişlisi, activity bar dişlisi, `?` kısayolu).
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile modalın açılıp kategoriler arası geçiş + Escape/X ile kapanma + ayar kaydetme kanıtlanır, bundle match.
