# REQ-168 — Design Studio apayrı bir sayfa olsun; üst geçişe "Design" eklensin (Claude Design gibi)

**Status:** pending
**Tarih:** 2026-09-26
**Kaynak:** Kullanıcı mesajı (26 Eyl 2026):
> "design studio ayrı bir sayfa olcak demiştim ya yukarda lokma - bots vardı onun yanına da design ekle o tamamen apayarı bir sayfa olcak işte. claude design gibi olcak"

**İlişki:**
- **REQ-161** (üst geçiş: `lokma` · `Bots`) altyapısının üçüncü girişi: `lokma` · `Bots` · `Design`.
- REQ-163–166 Settings modalına bölüm, REQ-167 kendi modalı — **Design ise kendi başına bir SAYFA** (ne pane, ne modal, ne settings bölümü).
- Docs/34 zaten bu yönü çiziyor: kullanıcının ilk cümlesi *"lokmanın kendi içinde tasarım da yapılabilsin. claude design gibi olacak bu."*

## Bugünkü durum

- Design Studio bir **pane**: `components/design/design-pane.tsx` (`DesignPane` — 6 artifact tipi (prototype/deck/mobile/image/document/hyperframes) + brief formu + sistem satırı + sandboxed viewer + Code tab + Critique (5 boyut) + export şeridi + DESIGN.md guard'ı), girişleri:
  - `components/shell/inspector-rail.tsx: { tab: 'design', label: 'Design', Icon: Paintbrush }`
  - `components/panes/inspector-host.tsx: if (tab === 'design') return <LazyDesignPane />`
  - `components/panes/panes.ts` 'design' sekme tanımı (`onOpenDesign`).
- İçerik canlı: `GET /api/design/list`, `POST /api/design/generate`, `GET /api/design/:id/view` (sandboxed iframe), `PUT /api/design/:id` (Code tab), `POST /api/design/:id/critique`, export indirmeleri, `GET /api/design/guard` (`.lokma/DESIGN.md`), `DELETE /api/design/:id`.
- Üst geçiş deseni REQ-161'de kuruldu (`lokma` → normal mod, `Bots` → botlar modu; aktif giriş vurgulu).

## Referans — "Claude Design gibi"

Claude Design (claude.ai/design, Anthropic): **sol sohbet + sağ canvas** — brief'i konuşarak verirsin, tasarım canvas'ta canlı üretilir; konuşma + doğrudan düzenleme ile iterate edilir; tasarım sistemi/brand bağlanır; export (PDF/PPTX/HTML) ve devir teslim vardır. Bu REQ'in yerleşim/deneyim yönü budur (birebir klon hedefi değil; mevcut işlevler kayıpsız korunur).

## Kapsam

1. **Üst geçişe üçüncü giriş:** header marka bloğunda `lokma` · `Bots` · **`Design`** (REQ-161'deki desen; aktif giriş görünür şekilde vurgulanır; `lokma` → normal mod).
2. **Design Studio kendi başına bir SAYFA olur:** mod değişince uygulama çalışma alanı (pane/tiling) yerine **Design sayfası** render edilir — tam sayfa düzen (solda brief/sohbet alanı + sağda canvas/viewer; Claude Design düzenine yakın). Ne pane, ne modal, ne Settings bölümü.
3. **Pane yolu kalkar:** inspector-rail'deki 'design' girişi KALMAZ (Bots/REQ-161 deseni — sayfa olan şey rail'de pane olarak durmaz); `panes.ts` + `inspector-host` design dalı temizlenir.
4. **İçerik korunur (kayıp yok):** 6 artifact tipi + brief/generate, viewer (gerçek `/view` iframe'i), Code tab (kaydet + yeniden critique), Critique (5 boyut), export indirmeleri (SVG/HTML/PNG…), DESIGN.md guard, iki tık silme — hepsi gerçek uçlarla (ölü buton yok).
5. **Mod izolasyonu:** Design sayfasından `lokma`ya dönünce normal modun açık sekmeleri/pane düzeni AYNEN korunur; Design'ın kendi durumu (seçili artifact, form) sayfa yeniden açılınca korunur.

## Kontrol (kabul kriterleri)

- Header'da `lokma` · `Bots` · `Design` üçlüsü; `Design` → tam sayfa Design Studio; `lokma` → normal mod (bozulmamış); `Bots` → botlar modu (bozulmamış).
- Design sayfasında: brief ile generate çalışır, artifact seçilince viewer gerçek build'i gösterir, Code tab kaydeder, Critique gerçek skorları verir, export iner.
- Rail'de 'Design' pane girişi YOK; design pane/sekme olarak açılamıyor.
- Kapılar: `bun x tsc --noEmit` 0; sterilize build; pm2 tek-proc restart; canlı bundle = disk hash; yeni canlı prob `scripts/probe-design-page.cjs` (üst geçişten sayfa açılır; canvas/viewer yüklenir; `lokma`ya dönüş; hiç pane açılmadı) yeşil; ilgili testler güncel (`design.test.ts`).

## Dokunulacak yerler (öngörü)

- `packages/lokma-web/web/src/components/header.tsx` (üçlü geçiş — REQ-161 düzenine ekleme)
- `packages/lokma-web/web/src/components/app-shell.tsx` (mod state + sayfa render'ı)
- `packages/lokma-web/web/src/components/panes/panes.ts`, `components/panes/inspector-host.tsx`, `components/shell/inspector-rail.tsx` (design pane yolunun kaldırılması)
- `packages/lokma-web/web/src/components/design/` (sayfa gövdesi/yerleşimi — mevcut pane içeriği yeniden kullanılır)

## Bitirme (done)

1. Kontroller canlıda PASS + kanıt (prob çıktısı + ekran görüntüsü + bundle hash).
2. Atomik İngilizce commit(ler) + `git push origin main`.
3. Bu dosya: `Status: done` + hash'ler; `git mv` → `Docs/refactor/finished/`; README index güncellenir; `Docs/00-LOKMA-KONTEKST.md`'ye kronoloji satırı.

## Notlar

- REQ-161 ile koordineli: üst geçiş üç girişe çıkarken aktif-mod mantığı tek yerden yönetilmeli (lokma/Bots/Design).
- `concept/` prototipi kapsam dışı — yalnız `packages/lokma-web`.
