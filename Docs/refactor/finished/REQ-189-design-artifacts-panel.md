# REQ-189 — Artifacts paneli açılır-kapanır olsun (sağda gizli panel)

**Status:** done (3 Ekim 2026 — turlar 1-3: `7a75f83` `cb5f1ed` `5403a3f` `80c571b`; kapanış: bu kapanış docs commit'i)
**Tarih:** 2026-10-02 · tur 2: 2026-10-03 · tur 3 (kapanış): 2026-10-03
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

1. Kontroller PASS + prob + ekran görüntüsü. — **80c571b** (48/48, `ss1` boş durum + `ss2` panel açık)
2. Atomik İngilizce commit(ler) + push. — `7a75f83` `cb5f1ed` `5403a3f` `80c571b` + kapanış
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index + `Docs/00`. — bu commit

## Notlar

- **Write-only:** kod yazılmadı.
- Tasarım kararı: liste **gizli panel** olur ama **seçim sonrası kapanmaz** — kapatıp her seferinde açmak zorlamak, canvas'ı kullanan iş akışını bozar.

## Uygulama (tick 1-3)

- **tick 1 · `7a75f83`** — state katmanı: snapshot `artifactsPanel` (yalnız açık `true` geri yüklenir; `"true"`/`1`/bozuk payload paneli **kapalı** tutar) + `toggleArtifactsPanel()` tek yazar + birim testleri.
- **tick 2 · `cb5f1ed`** — markup: `design-artboards.tsx` panel gövdesi oldu (arama, `SelectMenu` tip filtresi, canlı sandbox önizlemeler, 380-440px sağ kolon, kendi kaydırması, boş durum); `design-page.tsx` canvas+panel'i tek satıra aldı (panel kapanınca genişlik canvas'a geri döner), araç çubuğuna `aria-expanded`/`aria-controls` + sayı rozetli açma düğmesi, açılışta panele odak; Esc yalnız panel **mount** iken dinleyici kaydediyor.
- **tick 3 · `5403a3f` + `80c571b`** — **kalan kabul kriteri ölçüldü.** İki tanesi daha önce ölçülmüyordu: (a) *"arama **çalışır**"* — varlığı değil **işlevi**: eşleşmeyen parça listeyi 0/4'e boşaltıyor, temizleme 4/4'ü geri getiriyor, gerçek bir brief parçası 3/4'e daraltıyor (parça DOM'dan okunuyor, uydurulmuyor); (b) *"0 artifact → dürüst boş durum"* — canlı hesap **her zaman** artifact'lı olduğu için bu kriter kendi kendine ASLA ölçülemiyordu (prob `listCount > 0` üzerinde atlayor ya da boş kartı `||` ile geçiyordu = hiçbir şey kanıtlamıyor). Çözüm: **tek sayılan okuma** (`GET /api/design/list`) stub'lanarak sıfır GERÇEK kılındı (uygulamanın kendisi değil metered okuma), sonra dürüst boş kartın çizildiği, sayacın `0/0` okuduğu, arama input'unun durduğu, taşma olmadığı ve panelin **hâlâ** açılıp kapandığı ölçüldü; stub kaldırılıp sayfa yeniden yüklendi (hesap bulunduğu gibi bırakıldı).

### Ölçülen kapılar (tick 3 — kapanış)

- **Canlı prob `scripts/probe-design-artifacts-panel.cjs` 48/48 PASS** (39/39 → 48/48): varsayılan kapalı (DOM'da yok), canvas 1115px → açınca 695px (panel 420px, canvas.right == panel.left == 1075), `aria-expanded` false→true + `aria-controls` panel id'sini çözüyor, açılışta odak panele, 0 native `<select>`, arama gerçekten filtreliyor, seçim paneli kapatmıyor ve canvas `src`'si değişiyor, Esc + X kapatıyor, reload sonrası durum korunuyor, **ZORLA boş durum** dürüst kart + `0/0` + taşma yok, 1500px ve 390px'te taşma yok, 0 JS hatası.
- Birim: design **67/67** · kök `bun x tsc --noEmit` **0 hata**.
- Canlı dağıtım: servis edilen bundle `index-DTS946yu.js` == disk `web/dist` (prob **deployed** bundle'a karşı koştu) · token'siz `/api/auth/me` **401** (login gate AÇIK kalmadı).
- **Bu tick'te ürün kodu değişmedi** — yalnız prob + iki ekran görüntüsü + bu doküman; web paketlemesi değişmediği için rebuild/pm2 restart gerektirmedi (prob zaten canlı dağıtımı sürüyor).
- **Kesilmiş turdan kurtarma:** bu turun başında ağaç kirliydi — REQ-189'un boş-durum prob uzantısı commit'siz, ayrıca REQ-183 kesintisinden kalan iki yetim prob (`probe-live-write.ts`, `probe-live-write-full.ts`) sahipsiz duruyordu. Talimat gereği silmek yerine ölçüp **adopt** edildi: ikisi de credential taşımıyor (`resolveApiKey` ile çalışma anında çözüyor), `bun build --no-bundle` ile parse temiz, REQ-183'ün gerçek kayıt/registry probu ikilisinin tamamlayıcısı → `e2e908f`.
- **Tuzak notu:** `.git/index.lock` 34 dakika yaşında ve `pgrep -x git` boştu → **kilit eskiydi**, silindi (`pgrep -f` kendi komut satırınla eşleşir, yanlış "aktif yazar" sinyali verir).
