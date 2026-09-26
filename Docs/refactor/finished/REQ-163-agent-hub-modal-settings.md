# REQ-163 — Agent Hub modal olsun: Settings modalına bölüm olarak taşınsın

**Status:** done (2026-09-26)
**Tarih:** 2026-09-26
**Kaynak:** Kullanıcı mesajı (26 Eyl 2026, ekran görüntüsüyle — görsel mevcut pane'in hâli):
> "agent hub kısmı modal olark olmalı setings modeline taşıyabilirsin"

**Görsel:** `Docs/refactor/assets/REQ-163-agent-hub-pane.png` — mevcut Agent Hub pane'i (başlık + `running` rozeti, caps çipleri, `0/20 slots used`, `maxSpawnDepth 3 · AUDIT.md`, `+ Create`, boş durum metinleri). İçerik korunacak; taşınan şey **kap** (pane → modal).

## Bugünkü durum

- Agent Hub bir **pane**: `components/agents/agents-pane.tsx` (`AgentsPane` — registry + caps + kuyruk + `+ Create` + detay), Inspector rail'inden açılıyor:
  - `components/shell/inspector-rail.tsx: { tab: 'agents', label: 'Agents', Icon: Users }`
  - `components/panes/inspector-host.tsx: if (tab === 'agents') return <LazyAgentsPane />`
  - `components/panes/panes.ts` 'agents' sekme tanımı (`onOpenHub`).
- Settings zaten bir modal: `components/settings/settings-modal.tsx` (OpenCode tarzı büyük modal; sol kategori nav + sağ içerik; bölümler `settings.ts` → `SETTINGS_SECTIONS` + `SECTION_ICONS`; içerik canlı panelleri yeniden kullanır — kopya form yok). REQ-072 deseni: hesap ikonu doğrudan Account bölümünü açar.
- İçerik tamamen canlı: `GET/POST/PATCH/DELETE /api/agents`, `agent-dialog.tsx` ile Create, bulk pause/resume/kill, refresh, detay.

## Kapsam

1. **Agent Hub pane olmaktan çıkar → Settings modalı içinde bir bölüm olur.** `settings.ts` `SETTINGS_SECTIONS` listesine `{ id: 'agents', label: 'Agents' }` (tercih: 'Agent Hub') eklenir; `SECTION_ICONS`'a `Users`; bölüm içeriği mevcut `AgentsPane`'in kendisidir (diğer bölümlerin deseniyle — lazy pane; kopya yok).
2. **Pane yolu kalkar:** `panes.ts` 'agents' tanımı ve `inspector-host` 'agents' dalı kaldırılır; Agent Hub hiçbir koşulda pane/sekme olarak açılmaz.
3. **Girişler modalı açar:** Inspector rail'indeki 'Agents' ikonu KALIR ama pane yerine **Settings modalını agents bölümüyle** açar — REQ-072'deki "hesap ikonu Account'ı açar" deseninin aynısı (`initialSection`). (Kullanıcı yer konusunda esnekti: "settings modaline taşıyabilirsin" — tercih edilen yer burası.)
4. **İçerik korunur (kayıp yok):** registry satırları/seçim, caps çipleri (`maxAgents/maxConcurrent/maxQueue`, slots used, `maxSpawnDepth 3 · AUDIT.md`), `+ Create` (agent-dialog), refresh, bulk pause/resume/kill, boş durum metinleri — hepsi gerçek uçlarla (ölü buton yok).
5. **Modal uyumu:** bölüm içeriği modal gövdesinde kaydırılabilir oturur (pane'in `h-full` yerleşim varsayımı modal için uyarlanır); dar ekranda taşmaz.

## Kontrol (kabul kriterleri)

- Rail'deki Agents ikonu (ve nav'daki Agents bölümü) **modalı** açar — pane açılmaz; pane/sekme tanımı yok.
- Modal içinde: agent listesi + detay, `+ Create` (gerçek oluşturma), bulk işlemler, refresh, caps/slots çipleri çalışır.
- Settings'in mevcut girişleri bozulmaz: gear / Ctrl+, general ile açılır; hesap ikonu Account açar (REQ-072).
- Kapılar: `bun x tsc --noEmit` 0; sterilize build; pm2 tek-proc restart; canlı bundle = disk hash; yeni canlı prob `scripts/probe-agent-hub-modal.cjs` (rail → modal açıldı + Agents aktif; Create diyaloğu açılır/kapanır; hiç pane açılmadı; Esc/backdrop kapatır) yeşil; ilgili testler (`agents.test.ts`, `settings-modal.test.ts`) güncel ve geçiyor.

## Dokunulacak yerler (öngörü)

- `packages/lokma-web/web/src/components/settings/settings.ts` (+ `settings-modal.tsx`) — yeni bölüm
- `packages/lokma-web/web/src/components/shell/inspector-rail.tsx`, `components/app-shell.tsx` — rail → modal + `initialSection`
- `packages/lokma-web/web/src/components/panes/panes.ts`, `components/panes/inspector-host.tsx` — agents pane yolunun kaldırılması
- `packages/lokma-web/web/src/components/agents/agents-pane.tsx` (+ `agent-dialog.tsx`) — modal içinde yeniden kullanım

## Bitirme (done)

1. Kontroller canlıda PASS + kanıt (prob çıktısı + ekran görüntüsü + bundle hash).
2. Atomik İngilizce commit(ler) + `git push origin main`.
3. Bu dosya: `Status: done` + hash'ler; `git mv` → `Docs/refactor/finished/`; README index güncellenir; `Docs/00-LOKMA-KONTEKST.md`'ye kronoloji satırı.

## Notlar

- Bu istek bir "taşıma": Agent Hub'ın tüm işlevleri aynen kalır; değişen yalnız kap ve erişim yolu (pane → modal bölümü).
- `concept/` prototipi kapsam dışı — yalnız `packages/lokma-web`.

## Kapanış (2026-09-26)

**Status: done.** Commitler: `cab0128` (ray → modal + registry temizliği) · `551296e` (canlı prob) · bu kapanış docs commit'i. Prob kanıt görseli: `assets/REQ-163-ss-modal-after.png`.

**Yapılanlar**
- `settings.ts` → `SETTINGS_SECTIONS`'a `{ id: 'agents', label: 'Agent Hub' }` (models'in yanına) + `settings-modal.tsx`'te `Users` ikonu; bölüm gövdesi mevcut `LazyAgentsPane` (kopya form yok — pane `h-full` kökü modal gövdesinin yüksekliğini dolduruyor, kaydırma gövdede).
- Rail: 'Agents' ikonu KALDI ama artık `RAIL_MODAL_SECTIONS` haritası üzerinden Settings modalını Agent Hub bölümüyle açıyor (REQ-072 hesap-ikonu deseninin aynısı). Modal girdileri artık pane'e sürüklenmiyor (`isRailModalTab` → `draggable={false}`, sade tooltip) ve mobil 'tools' şeridindeki aynı girdi de modalı açıyor (`onOpenSettingsSection`).
- Pane yolu tamamen kalktı: `panes.ts` registry'sinden (23→22), `TILING_BAR_TABS`'tan (19→18), `inspector-host` + `inspector-panel` dallarından ve `TAB_ICONS`'tan 'agents' silindi; kalıcı localStorage'da kalmış eski 'agents' sekmeleri registry-miss ile düşüyor (drag payload'ı da reddediliyor).
- İçerik korundu: registry satırları/seçim, caps çipleri (`maxAgents/maxConcurrent/maxQueue`), `slots used`, `maxSpawnDepth 3 · AUDIT.md`, `+ Create` (gerçek diyalog), refresh, bulk pause/resume/kill, boş durum metinleri — hepsi canlı uçlarla.
- Extras #2 (`per-agent-budgets`) artık `Settings → Agent Hub → budget editor` diyor (tab bağlantısı kalktı).

**Kanıt**
- `scripts/probe-agent-hub-modal.cjs` canlı **29/29 PASS** (https://lokma.fermag.com.tr, minted Bearer — gate ON): rail tıkı modalı Agent Hub bölümünde açıyor (`nav aria-pressed=true`, 14 bölüm), pane sayısı 0→0 ve `lokma:tiling-tabs:v1` / `lokma:layout:v1` snapshot'ları değişmedi, rail ikonu hiçbir zaman aktif sekme olmuyor (`aria-pressed=false`), modal gövdesinde canlı içerik (başlık/caps/slots/spawnDepth/Create/refresh), `+ Create` gerçek formu açıyor ve Cancel kapatıyor, Escape ve backdrop tıkı modalı kapatıyor, bölüm modal gövdesine sığıyor (overflowX=0, gövde 556px).
- `bun x tsc --noEmit` 0 (web) · steril web build yeşil · `pm2 restart lokma-web` sonrası servis edilen bundle == disk `assets/index-BCv3bgM6.js`.
- İlgili testler: settings-modal 21/21, settings 92/92, panes 112+118+151, inspector-rail 12/12, activity-bar 18/18, extras 50, agents 54/54, stores ALL PASS, bots 49/49, ws PASS.
- Prob temizliği: prob hiçbir agent/session yaratmıyor (diyalog Cancel ile kapanıyor); tokenless `GET /api/auth/me` 401 (gate ON).

**Not:** `a11y.test.ts`'teki 3 hata bu değişiklikten ÖNCE de vardı (main'de kirik: `pane.tsx` / `fullscreen-modal.tsx` useFocusTrap'siz — REQ-145 kaydında da not düşülmüş); REQ-163 ile ilgisiz.
