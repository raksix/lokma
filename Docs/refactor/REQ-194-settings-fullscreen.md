# REQ-194 — Settings bölümleri tam ekran (full-screen) açılabilsin, en azından Models

**Status:** pending
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
