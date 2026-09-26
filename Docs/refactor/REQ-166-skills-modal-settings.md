# REQ-166 — Skills de Settings modalına taşınsın (modal bölümü)

**Status:** pending
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
