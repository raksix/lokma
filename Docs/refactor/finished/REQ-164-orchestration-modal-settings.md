# REQ-164 — Orchestration da modal olsun: Settings modalına bölüm olarak taşınsın

**Status:** done (2026-09-26)
**Tarih:** 2026-09-26
**Kaynak:** Kullanıcı mesajı (26 Eyl 2026):
> "okestrasyon da modal olarak olsun settingser falan taşıtyaabilisn"

**İlişki:** REQ-163 (Agent Hub → Settings modalı) ile **birebir aynı desen**; ikisi aynı dalgada tutarlı uygulanmalı.

## Bugünkü durum

- Orchestration bir **pane**: `components/orchestration/orchestration-pane.tsx` (`OrchestrationPane` — canlı ajan ağacı: state-gruplu tree + lineage, `ORCH_FILTERS`, fan-out formu, cancel-all, kilit paneli), Inspector rail'inden açılıyor:
  - `components/shell/inspector-rail.tsx: { tab: 'orchestration', label: 'Orchestration', Icon: Cpu }`
  - `components/panes/inspector-host.tsx: if (tab === 'orchestration') return <LazyOrchestrationPane />`
  - `components/panes/panes.ts` 'orchestration' sekme tanımı.
- İçerik canlı: `GET /api/agents` + WS `agent_state` frame'leri; fan-out üyeleri gerçek `POST /api/agents`; Cancel-all gerçekten kill eder; `AgentLocksRes` kilit paneli.
- Settings modalı deseni REQ-163'te tarif edildi (bölüm ekleme: `settings.ts` → `SETTINGS_SECTIONS` + `SECTION_ICONS`; rail ikonu modalı `initialSection` ile açar — REQ-072 deseni).

## Kapsam

1. **Orchestration pane olmaktan çıkar → Settings modalı içinde bölüm olur:** `SETTINGS_SECTIONS`'a `{ id: 'orchestration', label: 'Orchestration' }` + `SECTION_ICONS`'a `Cpu`; içerik mevcut `OrchestrationPane`'in kendisi (lazy pane, kopya yok — diğer bölümlerin deseni).
2. **Pane yolu kalkar:** `panes.ts` 'orchestration' tanımı + `inspector-host` dalı kaldırılır; Orchestration hiçbir koşulda pane/sekme olarak açılmaz.
3. **Girişler modalı açar:** Inspector rail'indeki 'Orchestration' ikonu KALIR ama pane yerine Settings modalını orchestration bölümüyle açar (REQ-072 deseni).
4. **İçerik korunur (kayıp yok):** state gruplu ağaç + lineage çipleri, filtreler, fan-out formu (gerçek oluşturma), Cancel-all (gerçek kill), kilit paneli, alt notlar — ölü buton yok.
5. **Modal uyumu:** pane'in `h-full` yerleşimi modal gövdesine uyarlanır (kaydırılabilir); dar ekranda taşmaz.

## Kontrol (kabul kriterleri)

- Rail'deki Orchestration ikonu (ve nav'daki Orchestration bölümü) **modalı** açar; pane açılmaz; pane/sekme tanımı yok.
- Modal içinde: ağaç canlı (WS `agent_state` ile güncellenir), filtreler, fan-out (gerçek ajan doğurur), Cancel-all (gerçek kill), kilitler görünür.
- REQ-163 ile tutarlılık: aynı modal içinde iki bölüm de (Agents + Orchestration) çalışır; geçişler bozulmaz.
- Kapılar: `bun x tsc --noEmit` 0; sterilize build; pm2 tek-proc restart; canlı bundle = disk hash; canlı prob (REQ-163'ünkü desenle — tek prob iki bölümü kapsayabilir) yeşil; ilgili testler güncel ve geçiyor (`orchestration.test.ts`).

## Dokunulacak yerler (öngörü)

- `packages/lokma-web/web/src/components/settings/settings.ts` (+ `settings-modal.tsx`) — yeni bölüm
- `packages/lokma-web/web/src/components/shell/inspector-rail.tsx`, `components/app-shell.tsx` — rail → modal + `initialSection`
- `packages/lokma-web/web/src/components/panes/panes.ts`, `components/panes/inspector-host.tsx` — orchestration pane yolunun kaldırılması
- `packages/lokma-web/web/src/components/orchestration/orchestration-pane.tsx` — modal içinde yeniden kullanım

## Bitirme (done)

1. Kontroller canlıda PASS + kanıt (prob çıktısı + ekran görüntüsü + bundle hash).
2. Atomik İngilizce commit(ler) + `git push origin main`.
3. Bu dosya: `Status: done` + hash'ler; `git mv` → `Docs/refactor/finished/`; README index güncellenir; `Docs/00-LOKMA-KONTEKST.md`'ye kronoloji satırı.

## Notlar

- Kullanıcı yer için esneklik verdi ("settings'ler falan") — tercih: REQ-163 ile aynı modal (bölüm olarak).
- `concept/` prototipi kapsam dışı — yalnız `packages/lokma-web`.

## Kapanış (2026-09-26)

**Status: done.** Commitler: `ced0ebd` (rail → modal + registry temizliği) · `d53afa8` (canlı prob) · bu kapanış docs commit'i. Prob kanıt görseli: `assets/REQ-164-ss-modal-after.png`.

**Yapılanlar**
- `settings.ts` → `SETTINGS_SECTIONS`'a `{ id: 'orchestration', label: 'Orchestration' }` (Agent Hub'ın hemen yanına) + `settings-modal.tsx`'te `Cpu` ikonu; bölüm gövdesi mevcut `LazyOrchestrationPane`'in kendisi (kopya yok — REQ-163 deseni). Pane, pane-tab host'uyla aynı `@container` sarmalayıcısında render ediliyor: pane'in `@min-[320px]`/`@min-[420px]` kuralları gerçek bir query container'a ihtiyaç duyuyor (yoksa Fan-out butonu `hidden` kalırdı) ve `h-full` ağaç alanına modal gövdesinin yüksekliğini veriyor (kaydırma pane içinde).
- Rail: 'Orchestration' ikonu KALDI ama artık `RAIL_MODAL_SECTIONS` (agents + orchestration) üzerinden Settings modalını orchestration bölümüyle açıyor (REQ-072/163 deseni); modal girdileri pane'e sürüklenmiyor (`draggable={false}`) ve mobil 'tools' şeridindeki aynı girdi de modalı açıyor (`onOpenSettingsSection`) — mekanizma tek haritadan genişletildi.
- Pane yolu tamamen kalktı: `panes.ts` registry 22→21 + `TILING_BAR_TABS` 18→17, `inspector-host` + `inspector-panel` dalları ve `TAB_ICONS` temizlendi; kalıcı localStorage'daki eski 'orchestration' sekmeleri registry-miss ile düşüyor (drag payload'ı da reddediliyor).
- İçerik korundu (kayıp yok): state-gruplu canlı ağaç + lineage, filtreler (All/Running/Queued), Fan-out formu (gerçek `POST /api/agents`), Cancel all (gerçek kill), kilit paneli, caps/slots çipleri.
- Extras: ölü 'orchestration' tab hedefi `ExtrasTabId` union'ından çıkarıldı (hiçbir shipped satır kullanmıyordu); #19 artık `Settings → Orchestration` diyor.

**Kanıt**
- `scripts/probe-orchestration-modal.cjs` canlı **30/30 PASS** (https://lokma.fermag.com.tr, minted Bearer — gate ON): rail Orchestration tıkı modalı bölümde açıyor (`nav aria-pressed=true`, 15 bölüm), pane sayısı 0→0 ve `lokma:tiling-tabs:v1` / `lokma:layout:v1` snapshot'ları değişmedi, rail ikonu hiçbir zaman aktif sekme olmuyor (`aria-pressed=false`), canlı içerik (başlık + `0 running · 0 total` rozeti, `caps 20/5/20` çipi, 3 filtre, **Fan-out görünür** `display=flex` 81×20 — @container kanıtı, Cancel all, Refresh registry, ağaç durumu), aynı modalda Agent Hub'a geçip dönünce iki bölüm de çalışıyor (`maxSpawnDepth 3` + Fan-out tekrar görünür), Escape + backdrop tıkı kapatıyor, gövde 558×556 ve `overflowX=0`, 0 JS hatası.
- `bun x tsc --noEmit` (root) 0 · steril web build yeşil · `pm2 restart lokma-web` sonrası servis edilen bundle == disk `assets/index-DdW4lLfw.js`.
- İlgili testler: settings-modal 25/25, panes 112+118+151, inspector-rail 13/13, extras 51, orchestration 43/43.
- Prob temizliği: hiçbir agent/session yaratılmadı (`~/.lokma/agents` boş; Cancel-all başlığı 'No live agents to cancel'); tokenless `GET /api/auth/me` 401 (gate ON). Konsoldaki 2 adet 404 `/favicon.ico` (uygulama inline `data:` favicon kullanıyor) — bu değişiklikle ilgisiz, önceden de vardı.
