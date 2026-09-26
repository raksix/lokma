# REQ-166 — Skills de Settings modalına taşınsın (modal bölümü)

**Status:** done (2026-09-26)
**Tarih:** 2026-09-26
**Kaynak:** Kullanıcı mesajı (26 Eyl 2026):
> "skills de settingse taşı"

**İlişki:** REQ-163 (Agent Hub), REQ-164 (Orchestration), REQ-165 (Vault + Memory) ile **birebir aynı desen** — "Settings modalına taşıma" dalgasının dördüncüsü; hepsi tutarlı uygulanmalı.

## Bugünkü durum

- Skills bir **pane**: `components/skills/skills-pane.tsx` (`SkillsPane` — canlı skill registry: aranabilir liste + `skill_view` detayı, SKILL.md gövdesi önizlemesi, linked file'lar, Patch editörü (tek-occurrence guard), kullanım telemetrisi `used N · viewed M · patched K`), girişleri:
  - `components/shell/inspector-rail.tsx: { tab: 'skills', label: 'Skills', Icon: Puzzle }`
  - `components/panes/inspector-host.tsx: if (tab === 'skills') return <LazySkillsPane />`
  - `components/panes/panes.ts` 'skills' sekme tanımı (`onOpenSkills`).
- İçerik canlı: `GET /api/skills`, `GET /api/skills/:id`, `GET /api/skills/:id/file?path=`, `PATCH /api/skills/:id`, `.usage.json` telemetrisi.
- Settings modalı deseni REQ-163/164/165'te tarif edildi (bölüm ekleme: `settings.ts` → `SETTINGS_SECTIONS` + `SECTION_ICONS`; rail ikonu modalı `initialSection` ile açar — REQ-072 deseni).

## Kapsam

1. **Skills pane olmaktan çıkar → Settings modalı içinde bölüm olur:** `SETTINGS_SECTIONS`'a `{ id: 'skills', label: 'Skills' }` + `SECTION_ICONS`'a `Puzzle`; içerik mevcut `SkillsPane`'in kendisi (lazy pane, kopya yok).
2. **Pane yolu kalkar:** `panes.ts` 'skills' tanımı + `inspector-host` dalı kaldırılır; Skills pane/sekme olarak açılamaz.
3. **Girişler modalı açar:** Inspector rail'indeki 'Skills' ikonu KALIR ama pane yerine Settings modalını skills bölümüyle açar (REQ-072 deseni).
4. **İçerik korunur (kayıp yok):** arama + liste, skill detayı (SKILL.md önizleme + linked files), Patch editörü (gerçek yazım), kullanım telemetrisi, refresh — ölü buton yok.
5. **Modal uyumu:** pane `h-full` yerleşimi modal gövdesine uyarlanır (liste + detay iki kolon dar ekranda istiflenir); taşma yok.

## Kontrol (kabul kriterleri)

- Rail'deki Skills ikonu (ve nav'daki Skills bölümü) **modalı** açar; pane açılmaz; pane/sekme tanımı yok.
- Modal içinde: arama çalışır, bir skill seçilip SKILL.md önizlemesi + linked file açılır, Patch kaydedilir (gerçek), telemetri görünür.
- REQ-163/164/165 ile tutarlılık: aynı modalda Agents + Orchestration + Vault + Memory + Skills bölümleri birlikte çalışır.
- Kapılar: `bun x tsc --noEmit` 0; sterilize build; pm2 tek-proc restart; canlı bundle = disk hash; canlı prob (163-165 deseni; tek prob tüm bölümleri kapsayabilir) yeşil; ilgili testler güncel (`skills.test.ts`).

## Dokunulacak yerler (öngörü)

- `packages/lokma-web/web/src/components/settings/settings.ts` (+ `settings-modal.tsx`) — yeni bölüm
- `packages/lokma-web/web/src/components/shell/inspector-rail.tsx`, `components/app-shell.tsx`
- `packages/lokma-web/web/src/components/panes/panes.ts`, `components/panes/inspector-host.tsx`
- `packages/lokma-web/web/src/components/skills/skills-pane.tsx`

## Bitirme (done)

1. Kontroller canlıda PASS + kanıt (prob çıktısı + ekran görüntüsü + bundle hash).
2. Atomik İngilizce commit(ler) + `git push origin main`.
3. Bu dosya: `Status: done` + hash'ler; `git mv` → `Docs/refactor/finished/`; README index güncellenir; `Docs/00-LOKMA-KONTEKST.md`'ye kronoloji satırı.

## Notlar

- Aynı dalgadaki dört taşıma (REQ-163/164/165 + bu) tek elden, tutarlı desenle yapılmalı.
- `concept/` prototipi kapsam dışı — yalnız `packages/lokma-web`.

## Sonuç (done 2026-09-26)

- **Uygulama:** `settings.ts`'e `{ id: 'skills', label: 'Skills' }` bölümü eklendi (Plugins'in yanında) + `SECTION_ICONS`'a `Puzzle`; modal gövdesinde Skills pane'i pane-tab host'unun `@container h-full min-h-0` sarmalayıcısıyla render ediliyor (`@min-[320px]`/`@max-[380px]` kuralları çözülüyor, kaydırma pane içinde). Rail'deki Skills ikonu KALDI ama modalı Skills bölümüyle açıyor (`RAIL_MODAL_SECTIONS` artık agents + orchestration + vault + memory + skills; modal girişi sürüklenmiyor). Pane yolu TAMAMEN kalktı: registry 19→18, `TILING_BAR_TABS` 15→14, `inspector-host`/`inspector-panel` dalları + `TAB_ICONS` girişi + ölü extras tab hedefi (`ExtrasTabId`'den 'skills'; #12 `Settings → Skills`'a işaret ediyor) temizlendi; eski localStorage sekmeleri/drag payload'ları registry-miss ile düşüyor.
- **Kanıt:** yeni canlı prob `scripts/probe-skills-modal.cjs` **35/35 PASS** — rail Skills ikonu modalı Skills bölümüyle açıyor (nav 17 bölüm, `aria-pressed=true`), giriş `draggable=false` + drag ipucu yok; pane 0→0, iki tiling snapshot'ı değişmedi, rail hiç aktif sekme olmuyor; canlı registry yüzeyi (arama kutusu, canlı `7 skills` çipi, Registry/Marketplace + Refresh, 7 satır) ve başlık altyazısı GÖRÜNÜR (@container çözülüyor); gerçek bir satır `GET /api/skills/:id` ile SKILL.md önizlemesini (924 karakter, custodian) + skill_view/Patch/Record use kontrollerini + telemetri & `<available_skills>` kartlarını yüklüyor; Patch editörü gerçek old/new textarea'larını açıyor (apply yok — canlı skill dosyalarına dokunulmadı); Skills↔Plugins geçişi, Escape + backdrop kapatma, overflowX=0, 0 JS hatası. Ekran görüntüsü: `/tmp/req166-skills-modal.png`.
- **Kapılar:** root `bun x tsc --noEmit` 0 + web `tsc --noEmit` 0; steril web build yeşil (`index-96L1MOyQ.js`); `pm2 restart lokma-web` sonrası servis edilen bundle == disk hash (canlı site de aynı hash'i servis ediyor); tokenless `/api/auth/me` 401 (gate ON, local + live). Testler: panes 102/116/122/155, settings-modal 34/34, inspector-rail 16/16, extras 53, skills 35.
- **Commitler:** `c26293f` (refactor web) + `b6e187e` (probe) + bu kapanış docs commit'i.
