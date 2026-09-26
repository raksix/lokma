# REQ-163 — Agent Hub modal olsun: Settings modalına bölüm olarak taşınsın

**Status:** pending
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
