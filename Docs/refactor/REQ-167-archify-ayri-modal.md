# REQ-167 — Archify apayrı bir modal olsun (Settings'e bölüm değil, kendi başına modal)

**Status:** pending
**Tarih:** 2026-09-26
**Kaynak:** Kullanıcı mesajı (26 Eyl 2026):
> "arcfiy kısmı apayarı bir model olarak olmalı"

**İlişki:** REQ-163/164/165/166 "pane → Settings modalı bölümü" dalgasının kardeşi; **fark:** Archify, Settings modalına bölüm olarak DEĞİL, **apayrı/kendi başına bir modal** olarak açılmalı ("apayrı bir modal").

## Bugünkü durum

- Archify bir **pane**: `components/archify/archify-pane.tsx` (`ArchifyPane` — typed JSON IR → doğrulanmış HTML/SVG diyagramlar; liste + viewer (gerçek build'i iframe'ler) + IR/receipt/export tab'ları; generate, delta, delete (iki tık), export indirmeleri), girişleri:
  - `components/shell/inspector-rail.tsx: { tab: 'archify', label: 'Archify', Icon: Workflow }`
  - `components/panes/inspector-host.tsx: if (tab === 'archify') return <LazyArchifyPane />`
  - `components/panes/panes.ts` 'archify' sekme tanımı (`onOpenArchify`).
- İçerik canlı: `GET /api/archify/list`, `POST /api/archify/generate`, `GET /api/archify/:id/view`, IR edit + save, delta, `DELETE /api/archify/:id`, export dosyaları (SVG/HTML/IR/card/PNG/WebM).
- Modal kabuğu deseni hazır: `components/settings/settings-modal.tsx` (backdrop, sol nav/sağ içerik, `useFocusTrap`, Esc + backdrop kapat, X) — Archify kendi modalında bu kabuğu örnek almalı.

## Kapsam

1. **Archify kendi modalı olur** (Settings modalının bir bölümü DEĞİL): yeni `components/archify/archify-modal.tsx` — büyük, ortalanmış modal (diyagram görüntüleyici + liste + sekmeler geniş alan ister; örn. genişlik ~ekranın %80-90'ı, yükseklik ~85vh), Settings modalıyla aynı kabuk davranışları: dimmed backdrop, focus trap (`useFocusTrap`), Esc + backdrop-click kapat, X butonu; lazy chunk.
2. **Pane yolu kalkar:** `panes.ts` 'archify' tanımı + `inspector-host` dalı kaldırılır; Archify pane/sekme olarak açılamaz.
3. **Giriş modalı açar:** Inspector rail'indeki 'Archify' ikonu KALIR ama pane yerine **Archify modalını** açar; modal state `app-shell`'de tutulur (settings modalı deseni).
4. **İçerik korunur (kayıp yok):** liste + arama/filtre, viewer (gerçek `view` iframe'i), IR editörü (validate + save), receipt, export indirmeleri, generate, delta, delete — hepsi gerçek uçlarla (ölü buton yok).
5. **Modal içi yerleşim:** mevcut pane yerleşimi (liste + viewer + sekmeler) modal gövdesine uyarlanır; iframe yüksekliği modal içinde esnek; dar ekranda taşma yok.

## Kontrol (kabul kriterleri)

- Rail'deki Archify ikonu **Archify modalını** açar; Settings modalı AÇILMAZ; pane açılmaz; pane/sekme tanımı yok.
- Modal içinde: liste yüklenir, bir diyagram seçilince viewer iframe'i gerçek build'i gösterir, IR edit + save çalışır, export indirilir, delta/delete çalışır.
- Esc ve backdrop modalı kapatır; focus modal içinde tuzaklı; kapanınca odak tetikleyiciye döner.
- Kapılar: `bun x tsc --noEmit` 0; sterilize build; pm2 tek-proc restart; canlı bundle = disk hash; yeni canlı prob `scripts/probe-archify-modal.cjs` (rail → modal görünür + liste yüklenir; viewer iframe URL'i `/api/archify/:id/view`; Esc kapatır; hiç pane açılmadı) yeşil; ilgili testler güncel (`archify.test.ts`).

## Dokunulacak yerler (öngörü)

- `packages/lokma-web/web/src/components/archify/` — yeni `archify-modal.tsx` (+ `inspector-host`/lazy-panes kaydı)
- `packages/lokma-web/web/src/components/shell/inspector-rail.tsx`, `components/app-shell.tsx` — rail → modal açılışı
- `packages/lokma-web/web/src/components/panes/panes.ts`, `components/panes/inspector-host.tsx` — archify pane yolunun kaldırılması

## Bitirme (done)

1. Kontroller canlıda PASS + kanıt (prob çıktısı + ekran görüntüsü + bundle hash).
2. Atomik İngilizce commit(ler) + `git push origin main`.
3. Bu dosya: `Status: done` + hash'ler; `git mv` → `Docs/refactor/finished/`; README index güncellenir; `Docs/00-LOKMA-KONTEKST.md`'ye kronoloji satırı.

## Notlar

- Kullanıcı bilinçli olarak "apayrı" dedi: Archify, Settings modalına bölüm olarak EKLENMEZ — kendi başına bir modal olur (Settings modalı nasıl kendi başına bir modalsa).
- `concept/` prototipi kapsam dışı — yalnız `packages/lokma-web`.
