# REQ-165 — Vault ve Memory panelleri de Settings modalına taşınsın (modal bölümleri)

**Status:** done (2026-09-26)
**Tarih:** 2026-09-26
**Kaynak:** Kullanıcı mesajı (26 Eyl 2026):
> "vault ksımı da memory falan da settingse taşı modal de güksün."

**İlişki:** REQ-163 (Agent Hub) ve REQ-164 (Orchestration) ile **birebir aynı desen** — üçü aynı dalgada tutarlı uygulanmalı.

## Bugünkü durum

- **Vault** bir pane: `components/vault/vault-pane.tsx` (`VaultPane` — canlı `~/.lokma/vault/`: not listesi + SVG/3D graph, arama, note okuma, yeni not (ingest), silme), girişleri:
  - `components/shell/inspector-rail.tsx: { tab: 'vault', label: 'Vault', Icon: Folder }`
  - `components/shell/activity-bar.tsx: { key: 'vault', label: 'Vault', Icon: Database }`
  - `components/panes/inspector-host.tsx` dalı + `components/panes/panes.ts` sekme tanımı.
- **Memory** bir pane: `components/memory/memory-pane.tsx` (`MemoryPane` — global §-ayraçlı MEMORY.md/USER.md store: entry ekle/replace/remove + canlı chars/limit; wave 3b transcript araçları: `session_search` + per-session iki katmanlı compaction), girişleri:
  - `components/shell/inspector-rail.tsx: { tab: 'memory', label: 'Memory', Icon: Brain }`
  - `inspector-host` dalı + `panes.ts` tanımı.
- İçerik canlı: `GET/POST/PATCH/DELETE /api/memory`, `GET /api/sessions/search`, `GET|POST /api/sessions/:id/compaction`; vault tarafı `GET /api/vault/graph|search|tree|note`, `POST /api/vault/ingest`, `DELETE /api/vault/note`.

## Kapsam

1. **İki pane de Settings modalına bölüm olur:** `SETTINGS_SECTIONS`'a `{ id: 'vault', label: 'Vault' }` + `{ id: 'memory', label: 'Memory' }`; `SECTION_ICONS`'a `Folder` (veya `Database`) + `Brain`; içerik mevcut panellerin kendisi (lazy, kopya yok — REQ-163/164 deseni).
2. **Pane yolları kalkar:** `panes.ts` vault/memory tanımları + `inspector-host` dalları + activity-bar'daki vault girişi temizlenir; iki pane de pane/sekme olarak açılamaz.
3. **Girişler modalı açar:** rail ikonları (Vault: inspector-rail + activity-bar; Memory: inspector-rail) KALIR ama pane yerine Settings modalını ilgili bölümle açar (`initialSection` deseni — REQ-072).
4. **İçerik korunur (kayıp yok):** Vault: liste + graph (2D/3D toggle) + arama + not okuma + yeni not + silme + wikilink gezme; Memory: hedef seçimi (MEMORY/USER), entry CRUD + canlı limit göstergesi, transcript arama + compaction — hepsi gerçek uçlarla (ölü buton yok).
5. **Modal uyumu:** pane `h-full` yerleşimleri modal gövdesine uyarlanır (kaydırılabilir); graph/tree dar ekranda taşmaz.

## Kontrol (kabul kriterleri)

- Rail ikonları (ve nav'daki Vault/Memory bölümleri) **modalı** açar; hiçbir koşulda pane açılmaz; pane/sekme tanımları yok.
- Modal içinde: vault yeni not yazma + listeleme + silme çalışır; memory entry ekle/replace/remove çalışır; transcript araması sonuç döner.
- REQ-163/164 ile tutarlılık: aynı modalda Agents + Orchestration + Vault + Memory bölümleri birlikte çalışır.
- Kapılar: `bun x tsc --noEmit` 0; sterilize build; pm2 tek-proc restart; canlı bundle = disk hash; canlı prob (163/164 deseni; tek prob tüm bölümleri kapsayabilir) yeşil; ilgili testler güncel (`vault.test.ts`, `memory.test.ts`).

## Dokunulacak yerler (öngörü)

- `packages/lokma-web/web/src/components/settings/settings.ts` (+ `settings-modal.tsx`) — iki yeni bölüm
- `packages/lokma-web/web/src/components/shell/inspector-rail.tsx`, `components/shell/activity-bar.tsx`, `components/app-shell.tsx`
- `packages/lokma-web/web/src/components/panes/panes.ts`, `components/panes/inspector-host.tsx`
- `packages/lokma-web/web/src/components/vault/vault-pane.tsx`, `components/memory/memory-pane.tsx`

## Bitirme (done)

1. Kontroller canlıda PASS + kanıt (prob çıktısı + ekran görüntüsü + bundle hash).
2. Atomik İngilizce commit(ler) + `git push origin main`.
3. Bu dosya: `Status: done` + hash'ler; `git mv` → `Docs/refactor/finished/`; README index güncellenir; `Docs/00-LOKMA-KONTEKST.md`'ye kronoloji satırı.

## Notlar

- Kullanıcı "falan" ile esneklik verdi; kapsam bu dosyada Vault + Memory ile sınırlı (benzer başka pane taşınacaksa ayrı REQ).
- `concept/` prototipi kapsam dışı — yalnız `packages/lokma-web`.

## Sonuç (done 2026-09-26)

- **Uygulama:** `settings.ts`'e `{ id: 'vault', label: 'Vault' }` bölümü eklendi (Memory bölümü zaten vardı) + `SECTION_ICONS`'a `Folder`; modal gövdesinde Vault pane'i pane-tab host'unun `@container h-full min-h-0` sarmalayıcısıyla render ediliyor (`@min-[320px]` kuralları çözülüyor, kaydırma pane içinde). Rail girişleri (`RAIL_MODAL_SECTIONS` = agents + orchestration + vault + memory) ve activity-bar Vault girişi (`ACTIVITY_MODAL_SECTIONS` + `isActivityModalKey`) modalı ilgili bölümle açıyor; modal girdileri sürüklenmiyor. Pane yolu TAMAMEN kalktı: registry 21→19, `TILING_BAR_TABS` 17→15, `inspector-host`/`inspector-panel` dalları + `TAB_ICONS` + ölü extras tab hedefi (`ExtrasTabId`'den 'vault'; #22 `Settings → Vault`'a işaret ediyor) temizlendi; eski localStorage sekmeleri/drag payload'ları registry-miss ile düşüyor.
- **Kanıt:** yeni canlı prob `scripts/probe-vault-memory-modal.cjs` **40/40 PASS** — rail Vault/Memory ikonları + activity-bar Vault ikonu modalı doğru bölümle açıyor (nav 16 bölüm, `aria-pressed=true`); pane 0→0, tiling snapshot'ları değişmedi, girişler `draggable=false`; canlı Vault yüzeyi (arama, klasör filtresi, depth slider, New/Refresh, 2D/3D, `Vault graph, N notes` aria-label'lı SVG, FTS5 footer) ve notes meta satırı GÖRÜNÜR (@container çözülüyor); canlı Memory yüzeyi (`#memory-usage-bar` progressbar, Store usage + chars satırı, MEMORY.md/USER.md toggle, arama + add formu); Vault↔Memory geçişi, Escape + backdrop kapatma, overflowX=0, 0 JS hatası. Ekran görüntüleri: `/tmp/req165-vault-modal.png`, `/tmp/req165-memory-modal.png`.
- **Kapılar:** root `bun x tsc --noEmit` 0 (duyarlılık testiyle doğrulandı); steril web build yeşil (`index-CmMBcgcB.js`); `pm2 restart lokma-web` sonrası servis edilen bundle == disk hash; tokenless `/api/auth/me` 401 (gate ON). Testler: panes 114/120/153, inspector-rail 15/15, settings-modal 30/30, activity-bar 20/20, extras 52; tam web sweep'te yalnız ÖNCEDEN kırık olan `a11y` (3) + `narrow-layout` (5) fail ediyor (HEAD'de de aynı — REQ-165 ile ilgisiz).
- **Commitler:** `dace472` (refactor web) + `798386a` (probe) + bu kapanış docs commit'i.
