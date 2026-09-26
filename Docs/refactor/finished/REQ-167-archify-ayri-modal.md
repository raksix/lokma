# REQ-167 — Archify apayrı bir modal olsun (Settings'e bölüm değil, kendi başına modal)

**Status:** done (2026-09-26)
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

## Sonuç (done 2026-09-26)

- **Uygulama:** Yeni `components/archify/archify-modal.tsx` — Archify artık **kendi başına bir modal** (Settings bölümü DEĞİL): ~90vw × 85vh ortalanmış panel, Settings modalı kabuk sözleşmesi (koyu backdrop, `useFocusTrap` + Esc, backdrop-tık + X ile kapatma, body scroll lock, kendi lazy chunk'ı). Gövde = mevcut canlı `ArchifyPane`, bir `@container` host içinde (`@min-[320px]`/`@max-[380px]` kuralları çözülüyor) ve `h-full` pane içi kaydırmayı sağlıyor. Pane'e opsiyonel `onRequestClose` eklendi → X pane'in kendi başlık satırında (üst üste iki başlık yok; prop'suz render eskisi gibi). Rail'deki Archify ikonu KALDI ama artık modalı açıyor: yeni `RAIL_STANDALONE_MODALS` + `isRailStandaloneModalTab` + `isRailNonPaneTab` (drag guard artık 5 Settings bölümü + 1 standalone modal = 6 girişi kapsıyor; giriş sürüklenmiyor, sekme olmuyor); `app-shell`'de `archifyOpen` + `LazyArchifyModal`, mobil 'tools' şeridi de aynı modalı açıyor (`onOpenArchifyModal`). Pane yolu TAMAMEN kalktı: registry 18→17, `TILING_BAR_TABS` 14→13, `inspector-host`/`inspector-panel` dalları + `TAB_ICONS` girişi temizlendi; eski sekmeler/drag payload'ları registry-miss ile düşüyor. İçerik korundu: liste + arama/tip filtreleri, viewer (gerçek `view` iframe'i), IR editörü (validate + save), receipt, export indirmeleri, generate, delta, delete.
- **Kanıt:** yeni canlı prob `scripts/probe-archify-modal.cjs` **41/41 PASS** — rail ikonu kendi modalını açıyor (Settings modalı AÇILMIYOR), giriş `draggable=false` + drag ipucu yok; pane 0→0, iki tiling snapshot'ı değişmedi, rail hiç aktif sekme olmuyor; modal 1280×808 (85vh) ve viewport içinde, overflowX=0; canlı liste satırı + `+ New Diagram` + IR/receipt/export sekmeleri + başlık altyazısı GÖRÜNÜR (@container çözülüyor); satır seçilince viewer iframe gerçek build URL'ine mount oluyor (`/api/archify/<id>/view`) ve **frame'in kendisi gerçek SVG build'i render ediyor** (bodyLen 5840, çerçeve içinde `svg`, başlık IR'den — `page.frames()` + `frame.evaluate` ile okundu); IR sekmesi canlı editör textarea'sını gösteriyor; Escape + X + backdrop üçü de kapatıyor ve odak rail ikonuna geri dönüyor; prob'un yarattığı diyagram silindi + liste üzerinden yeniden doğrulandı. Ekran görüntüsü: `/tmp/req167-archify-modal.png`.
- **Kapılar:** root `bun x tsc --noEmit` 0; 51 test dosyası koştu — panes 104/118/124/157, inspector-rail 18/18, archify 33/33 yeşil; yalnız main'de de kırık olan a11y(3) + narrow-layout(5) FAIL. Steril web build yeşil (`index-BdDKlsCN.js` + yeni `archify-modal-CnRRxqG9.js` chunk'ı); `pm2 restart lokma-web` sonrası servis edilen bundle == disk hash (canlı site `https://lokma.fermag.com.tr` de aynı hash'i servis ediyor); tokenless `/api/auth/me` 401 (gate ON).
- **Not:** viewer iframe oturumun httpOnly `lokma_token` çerezini taşır (gerçek kullanıcı oturumu); Bearer-only prob oturumunda çerçeve 401 alıyordu — çerez ile curl 200 + gerçek HTML doğrulandı, prob artık çerezi de seed ediyor.
- **Commitler:** `55f0cd1` (refactor web) + `716ad85` (probe) + bu kapanış docs commit'i.
