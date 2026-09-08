# REQ-056 — Her yere sağ-tık context menü (session, pane, tüm hub'lar)

- **Status:** pending (kod yazılmadı — kullanıcı "yap" deyince başlanacak)
- **Asked:** 2026-09-08 — "sessiona falan, panede de sağ tık tıklayınca context menü ekle, detaylıca tüm her hub'a context menü eklersin" (SS'e bakılamadı — görüntü servisi 500).
- **Interpretation:** Session satırları + pane şeridi/gövdesi + tüm hub yüzeyleri (agents, bots, files, terminal...) sağ tıkta DETAYLI context menü açar: o yüzeye özgü tüm aksiyonlar (aç/kapat/yeniden adlandır/çoğalt/sil/yeni sekme/split...). Mevcut `FileBrowser` menüsü desen alınır, tek `ContextMenu` primitifiyle birleştirilir. REQ-055 kebab menüyle içerik paylaşır.
- **Touched (plan):** yeni `components/ui/context-menu.tsx` primitifi + her yüzeye `onContextMenu` kablosu.
- **Verify (plan):** root+web `tsc` 0, web build green, single-proc restart, headless ile her yüzeyde sağ-tık menüsü + aksiyon çalışması kanıtlanır, bundle match.
