# REQ-189 — Artifacts paneli açılır-kapanır olsun (sağda gizli panel)

**Status:** in-progress (tick 2/5 — markup: the panel is a closable right column, cb5f1ed)
**Tarih:** 2026-10-02 · tur 2: 2026-10-03
**Kaynak:** Kullanıcı mesajı (2 Ekim 2026):
> "arttaki articfast açılır kapabilir olsun."

**İlişkiler:** REQ-188 (composer) · REQ-172 (iki kolon) · REQ-190 (canvas düzenleme). Artifacts listesi bugün **sol kolonun** parçası; bu REQ onu **sağdaki kapatılabilir panel**e taşır.

## Bugünkü durum (ölçülmüş)

1. **Artifact listesi sol komut kolonunda, kalıcı yer kaplıyor.** `packages/lokma-web/web/src/components/design/design-page.tsx` iki kolonlu: solda brief + chat, sağda canvas. Liste (`design-artboards.tsx` + `design.ts`) solun içinde; REQ-172 onu "Stitch tarzı varyant şeridi" olarak canvas'ın altına indirmişti, artboard tip filtresi de aynı dosyada.
2. **Kullanıcı isteği bunun tersi:** canvas'ı temiz tutmak için liste **gizli**, bir düğmeyle açılan panel olsun. Yani liste "ana görünüm" değil, **ikincil yüzey**.
3. **Panel altyapısı hazır:** uygulamada `components/ui/` altında kapatılabilir panel/çekmece deseni ve `@container` modlu modal kabuğu var (REQ-167 Archify modalı bu kabuğu kullanıyor) — yenisi icat edilmemeli.
4. **Doğruluk notu:** paneli kapatmak, listeyi **silmek** değildir; seçili artifact, canvas ve komut hâlâ yerinde kalır.

## Kapsam

1. **Sağda bir Artifacts paneli:** varsayılan **kapalı**; canvas sağ tam genişlik. Başlık çubuğunda bir düğme (Lucide ikonu — emoji yasak) + rozet (artifact sayısı) paneli açar/kapatır.
2. **Panel içeriği = bugünkü tam liste:** arama, tip filtresi (`SelectMenu` — native `<select>` yasak, REQ-179), varyant şeridi (canlı `/api/design/:id/view` önizlemeleri), seçili/kaydetme durumu.
3. **Genişlik ve kaydırma:** panel `w-[380px]`…`w-[440px]` arası, kendi içinde kaydırılır, tuvali ezmez (`min-w-0` zinciri — REQ-157 tuzağı).
4. **Kalıcılık:** açık/kapalı durumu snapshot'ta (`lokma-design-page:v1` ile aynı mekanizma), reload'da korunur.
5. **Klavye + erişilebilirlik:** düğme `aria-expanded`/`aria-controls`; panel açılınca odak panele, Esc ile kapanır; mobilde tam ekran çekmece.
6. **Seçim davranışı korunur:** listeden seçince canvas o artifact'a geçer, panel **kapanmaz** (tekrar kullanılabilir kalır) — kapanması yalnız düğmeyle.
7. **Boş durum:** 0 artifact → panel açılsa bile dürüst boş durum + Generate yönlendirmesi.

## Kontrol (kabul kriterleri)

- Varsayılan: panel **yok**, canvas tam genişlik (prob: canvas genişliği = sol kolon + sağ kolon toplamı).
- Düğme paneli açar → liste görünür, canvas daralır, **taşma yok** (1500px + 390px).
- Açık/kapalı reload'da korunur (`lokma-design-page:v1`).
- Panel içindeki arama + tip filtresi çalışır; seçim canvas'a yansır ve panel kapanmaz.
- `aria-expanded` doğru ilerler; Esc kapatır.
- 0 artifact → dürüst boş durum.
- Kapılar: design birimleri yeşil, tsc 0, sterilize build, pm2 restart, canlı bundle == disk, prob `scripts/probe-design-artifacts-panel.cjs`.

## Dokunulacak yerler

- `packages/lokma-web/web/src/components/design/design-page.tsx` (kolon düzeni)
- `packages/lokma-web/web/src/components/design/design-artboards.tsx` (panel gövdesi)
- `packages/lokma-web/web/src/components/design/design-page-state.ts` (snapshot alanı)
- `packages/lokma-web/web/src/components/ui/` (mevcut kapatılabilir panel/çekmece deseni)

## Bitirme (done)

1. Kontroller PASS + prob + ekran görüntüsü.
2. Atomik İngilizce commit(ler) + push.
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index + `Docs/00`.

## Notlar

- **Write-only:** kod yazılmadı.
- Tasarım kararı: liste **gizli panel** olur ama **seçim sonrası kapanmaz** — kapatıp her seferinde açmak zorlamak, canvas'ı kullanan iş akışını bozar.

## Uygulama (tick 1-2)

- **tick 1 · `7a75f83`** — state katmanı: snapshot `artifactsPanel` (yalnız açık `true` geri yüklenir; `"true"`/`1`/bozuk payload paneli **kapalı** tutar) + `toggleArtifactsPanel()` tek yazar + birim testleri.
- **tick 2 · `cb5f1ed`** — markup: `design-artboards.tsx` panel gövdesi oldu (arama, `SelectMenu` tip filtresi, canlı sandbox önizlemeler, 380-440px sağ kolon, kendi kaydırması, boş durum); `design-page.tsx` canvas+panel'i tek satıra aldı (panel kapanınca genişlik canvas'a geri döner), araç çubuğuna `aria-expanded`/`aria-controls` + sayı rozetli açma düğmesi, açılışta panele odak; Esc yalnız panel **mount** iken dinleyici kaydediyor.

### Ölçülen kapılar (tick 2)

- Birim: design 67/67 · kök `bun x tsc --noEmit` 0 · sterilize build yeşil.
- Canlı: `pm2 restart lokma-web` → servis edilen bundle `index-DTS946yu.js` == disk; token'siz `/api/auth/me` **401** (login gate açık).
- Yeni prob `scripts/probe-design-artifacts-panel.cjs` **35/35**: varsayılan kapalı (DOM'da yok), canvas 1115px → açınca 695px, panel 420px sağda, aria bağı çözülüyor, seçim paneli kapatmıyor ve canvas'ı değiştiriyor, Esc ve X kapatıyor, reload sonrası durum korunuyor, 1500px ve 390px'te taşma yok.
- **Kardeş prob'lar**: `[data-design-strip]` artık sadece panel açıkken var; `probe-design-visual.cjs` ve `probe-design-studio-layout.cjs` paneli önce açıyor (layout probunda **strip kontrolünden önce** — sonra açmak kapalı paneli okuyup alakasız kırmızı veriyor).
- **Regresyon tabanı (ölçüldü, tahmin değil):** bu değişiklik `git stash` ile geri alınıp yeniden build+koşuldu — `probe-design-studio-layout` değişiklik **öncesi 9**, **sonrası 7** failure. 7'si aynı: Generate sonrası zincir (canlı model kredisi gerektiriyor). Çıkan 2 fark, özelliği olmayan baseline'da **var olamayacak** olan yeni panel kontrolleri. Yani hiçbir yeşil kontrol kaybolmadı.
