# REQ-067 — Sidebar title bars removed (Explorer/Inspector labels)

## Status

- Status: in-progress (recovered from cut-off run's dirty tree, 2026-09-08)
- Commit: TBD

## Asked

Kullanıcı: sol/sağ menülerdeki başlık çubukları ("Explorer" / panel başlıkları) kalksın — paneller başlıksız, sade görünsün.

## Interpretation

- `Sidebar` bileşenindeki `h-10` başlık çubuğu (`title` metni) opsiyonel hale gelir: yeni `hideHeader` prop'u `true` ise başlık çubuğu hiç render edilmez.
- `AppShell` içindeki 4 `Sidebar` kullanımının (sol/sağ × mobil/desktop) tamamı `hideHeader` ile başlıksız yapılır.
- `FileBrowser` içindeki "Explorer" yazı etiketi kaldırılır (sadece klasör ikonu kalır).

## Touched (plan)

- `packages/lokma-web/web/src/components/sidebar.tsx` — `hideHeader?: boolean` prop + koşullu header render.
- `packages/lokma-web/web/src/components/app-shell.tsx` — 4 `Sidebar` kullanımına `hideHeader` eklendi.
- `packages/lokma-web/web/src/components/files/file-browser.tsx` — "Explorer" metni kaldırıldı.

## Verify

- [ ] root `bun x tsc --noEmit` 0 errors
- [ ] `packages/lokma-web/web` sterilized build green
- [ ] pm2 single-proc `lokma-web` restart + served bundle hash == disk `web/dist`
- [ ] Canlıda sol/sağ panellerde başlık çubuğu yok, Explorer yazısı yok
