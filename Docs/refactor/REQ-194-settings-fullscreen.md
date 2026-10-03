# REQ-194 — Settings bölümleri tam ekran (full-screen) açılabilsin, en azından Models

**Status:** in-progress
**Tarih:** 2026-10-03
**Kaynak:** Kullanıcı mesajı (3 Ekim 2026):
> "settings modeli daha büyük full screen gibi bişi olsun"

**İlişkiler:** REQ-163…167 (Settings bölümleşmesi) · REQ-193 (browser proxy). Kapsam bölüm bazında: **Models öncelikli**, kural tüm bölümlere uygulanır.

## Bugünkü durum (ölçülmüş, `file:line`)

1. **Modal sabit boyutlu:** `packages/lokma-web/web/src/components/settings/settings-modal.tsx:179` → `flex h-[640px] max-h-[85vh] w-full max-w-3xl …`. Yani **768px × 640px**, ekranın ne kadar büyük olursa olsun büyümüyor. Models bölümü 600+ model satırı listelediği için sürekli kaydırılıyor.
2. **Mevcut genişletme yolu yok:** bir `max-w`/`w-[Npx]` override'ı, "expand" düğmesi veya tam ekran modu bulunmuyor (grep sonucu: yalnız `:179` ve `:323`'te `min-w-[92px]`, o da nav etiketi için).
3. **Bölümler hazır:** `SETTINGS_SECTIONS` (`settings.ts:455-478`) 17 bölüm: admin, appearance, providers, models, agents, orchestration, permissions, mcp, vault, memory, cron, shortcuts, plugins, skills, about… — hepsi aynı 768px kabukta.

## Kapsam

1. **Tam ekran modu:** modal kabuğuna bir **büyütme** düğmesi (Lucide `Maximize2`/`Minimize2`, emoji yasak) → `w-screen h-screen max-w-none max-h-none rounded-none`; geri düğmesi ve `Esc` geri alır. İki durum arası **geçiş anında içerik yeniden ölçülür** (taşma/kaydırma düzelmesi için `ResizeObserver`).
2. **Kalıcılık:** tercih `localStorage` (`lokma-settings-fullscreen:v1`), reload'da korunur; "Reset layout" ile geri alınabilir.
3. **Bölüm bazlı açılış:** URL/snapshot ile **doğrudan Models'te tam ekran** açılabilir (`?settings=models&fullscreen=1`), rail/ikon girişleri de bunu destekler.
4. **Models özelinde:** tam ekranda liste **iki kolona** çıkar (kategori/panel solda, satırlar sağda) + güçlü arama (`/` kısayolu) + sağda **önizleme/özellik paneli** (kapasite, context, fiyat, sağlayıcı, id). Model listesi zaten `GET /api/models` (canlı 600+ satır REQ-130 notu).
5. **Klavye/erişilebilirlik:** odak hapsi tam ekranda da çalışır (mevcut `useFocusTrap`), `Esc` önce kapatır sonra moddan çıkar, `aria-expanded` düğmede.
6. **Diğer bölümler:** kural **tümüne** uygulanır (aynı kabuk), ama her bölüm ekranına özel iki-kolon kuralı yalnız Models'te — ölçüyü bozmamak için.
7. **Mobil:** tam ekran zaten tam ekran; düğme gizlenir (tek kolon).

## Kontrol (kabul kriterleri)

- Varsayılan **değişmez**: 768×640 (regresyon yok).
- Büyütme → modal `w-screen h-screen`; geri düğmesi/`.keyboard Esc` eski boyuta döner.
- Reload sonrası tercih korunur; Reset geri alır.
- Models tam ekranda iki kolon + `/` arama + sağda önizleme paneli; **600+ satırda** kaydırma akıcı (ilk/son satır ölçümü).
- `?settings=models&fullscreen=1` doğrudan o bölümü açar.
- 1500px ve 390px'te taşma yok.
- Kapılar: birim + tsc 0 + sterilize build + `pm2 restart lokma-web` + canlı bundle == disk + prob `scripts/probe-settings-fullscreen.cjs` (boyut ölçümü + reload kalıcılığı + Models iki kolon).

## Dokunulacak yerler

- `packages/lokma-web/web/src/components/settings/settings-modal.tsx` (`:179` kabuk + düğme + state)
- `packages/lokma-web/web/src/components/settings/settings.ts` (Models bölümü iki kolon)
- `packages/lokma-web/web/src/components/settings/index.ts` (export)
- `packages/lokma-web/web/src/stores/` veya `layout.ts` (snapshot alanı)

## Bitirme (done)

1. Kontroller PASS + prob + ekran görüntüsü.
2. Atomik İngilizce commit(ler) + push.
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index + `Docs/00`.

## Notlar

- **Write-only:** kod yazılmadı. Ekranlar bu REQ'e **ait değil** (browser hatası gösteriyor), bu yüzden ss eklenmedi — REQ-193'e eklendi.

## Slice 1 — full-screen kabuk (bc6948c)

Kapsam 1, 2, 3, 5 ve 6 **bitti**; kapsam 4 (Models iki kolon + önizleme) ve canlı prob sırada.

1. **Tek çözümleyici:** `settings.ts` `settingsShellClass(fullscreen)` iki kabuk geometrisinin tek sahibi. Varsayılan **hiç değişmedi** (`h-[640px] max-h-3xl` → 768×640; probe bunu geriye-dönük guard olarak ölçüyor), tam ekran `h-screen w-screen max-w-none` + köşesiz.
2. **Kalıcılık:** `lokma-settings-fullscreen:v1`, `"1"` = tam ekran. `readSettingsFullscreen`/`writeSettingsFullscreen` **enjekte edilebilir storage** alır (probe DOM'suz ölçüyor) ve storage bloklanmışsa varsayılan kabuğa düşüyor, patlamıyor.
3. **Düğme:** `Maximize2`/`Minimize2` (emoji yok), `aria-expanded`, `sm` altında **gizli** (Kapsam 7 — telefonda tam ekran zaten mevcut düzen).
4. **Esc sırası:** `useFocusTrap`'in `onEscape` callback'i önce tam ekrandan çıkıyor, ikinci basışta kapatıyor; kullanıcı büyük kutuda hapsolmaz (Kapsam 5'in "önce kapatır sonra moddan çıkar" cümlesi bu sırayla çeliştiği için dosyada ölçülebilir sıra yazılı).
5. **Yeniden ölçüm:** kabuk bir flex column, gövde kaydırmayı sahipleniyor; `ResizeObserver` panele bakıyor ve **window `resize` eventi** de yayıyor (container-query paneler + xterm ölçümü yeniden tetiklenir — `@container` bölümleri bunu kullanıyor, `ResizeObserver`'ı dinlemez). Toggle remount YAPMIYOR: açık arama alanı odakta kalıyor.
6. **Backdrop:** tam ekranda `bg-black/40` + `p-4` düşüyor ve backdrop tıklaması **kapatmıyor** (arkada açığa çıkacak bir şey yok, dolguya tıklayan formu bozmaz).
7. **Deep link (Kapsam 3):** `?settings=models&fullscreen=1` mount'ta bir kez okunuyor, sonra **parametreler URL'den siliniyor** — yeniden yükleme ya da paylaşılan çıplak URL tam ekran kutuyu tekrar açmıyor. `fullscreen=1` kalıcı tercihe yazılıyor, modal açılışta onu okuyan taraf.
8. **Reset layout:** `RESET_LAYOUT_EVENT` handler'ı (`workspace.tsx:389`) tercihi tiling snapshot'ıyla birlikte temizliyor — Kapsam 2'nin "Reset layout ile geri alınabilir" maddesi, ikinci bir düğme uydurmadan.

### Ölçüm

- `bun src/components/settings/settings-modal.test.ts` → **70 passed, 0 failed** (+37 yeni).
- `bun x tsc --noEmit` → **0 hata**.
- `env -u NODE_CHANNEL_FD -u NODE_ENV bun run build` → **built in 3.37s**, `index-CDbfNXGK.js` (683.77 kB).
- Canlı: `pm2 restart lokma-web` → servis edilen `assets/index-*.js` **disk ile aynı** (`index-CDbfNXGK.js`), `web=200`, `api /health=200`, login gate **ON** (`/api/auth/me` tokenless → 401).
- Yeni sembol demesi: `grep -c 'lokma-settings-fullscreen:v1' dist/assets/index-CDbfNXGK.js` = **1** (eski hash'lerde 0 — canlıya gerçekten çıkmış).
- `a11y.test.ts` → 48 passed / 4 failed; **4'ü de clean baseline'da aynı** (`git stash` ile doğrulandı): `single-chat-view.tsx:248` nameless button, dialog registry, `fullscreen-modal.tsx` + `pane.tsx` focus trap. Bu REQ'in regresyonu değil, ayrı iş.

### Kalan

- **Kapsam 4:** Models tam ekranda iki kolon (kategori/panel solda, satırlar sağda) + `/` arama kısayolu + sağda önizleme paneli (kapasite/context/fiyat/sağlayıcı/id). Not: mevcut `models-pane.tsx:147` satır listeyi `max-h-[320px] overflow-auto` ile **kendi içinde** kaydırıyor — tam ekranda bu sabit yükseklik kullanılmayacak, gövde kaydıracak.
- **Prob:** `scripts/probe-settings-fullscreen.cjs` (ölçüm + reload kalıcılık + Models iki kolon) + 1500px/390px taşma kontrolü.
- Kapsam 4 ölçülebilir bir düzen gerektirdiği için ayrı slice: önce iki kolonun düzeni, sonra ona `/` ve önizleme.
