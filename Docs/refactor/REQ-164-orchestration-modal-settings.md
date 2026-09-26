# REQ-164 — Orchestration da modal olsun: Settings modalına bölüm olarak taşınsın

**Status:** pending
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
