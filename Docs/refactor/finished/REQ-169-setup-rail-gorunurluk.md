# REQ-169 — Setup girişi kurulum bittikten sonra sidebar'larda görünmesin

**Status:** done (2026-09-26) — commits `0825ac9` + `df0684f`
**Tarih:** 2026-09-26
**Kaynak:** Kullanıcı mesajı (26 Eyl 2026):
> "setup kısmı kuurlum bititkten sonra sidevbardalar görünmesine gerek yok"

**İlişki:** REQ-161 (üst geçiş) + REQ-163–168 (yerleşim dalgası) sonrası — bu kez: **Setup girdisinin koşullu görünürlüğü**.

## Bugünkü durum

- Setup bir **pane**: `components/setup/setup-pane.tsx` (feature seçimi + init + doctor + cloud import), girişleri:
  - `components/shell/inspector-rail.tsx: { tab: 'setup', label: 'Setup', Icon: HardDrive }` → **koşulsuz**, kurulum bitse de görünüyor (şikâyet bu).
  - `components/panes/panes.ts` 'setup' tanımı + `components/panes/inspector-host.tsx` dalı.
- Mevcut durum sinyali: **`bootstrapped`** — ilk admin kaydı; `GET /api/auth/settings` yanıtında döner (`{ settings, bootstrapped }`); `server/src/routes/auth.ts`: *"Until bootstrapped the instance is single-user-open"*. Onboarding sihirbazı zaten yalnız unbootstrapped iken görünür (`auth/onboarding-wizard.tsx`).

## Kapsam

1. **Koşullu görünürlük:** Setup sidebar girişi YALNIZCA kurulum bitmemişken görünür; kurulum bitince (bootstrapped) sidebar(lar)dan kalkar.
2. **Tamamlanma sinyali = `bootstrapped`** (ilk admin kayıtlı). Yeni bayrak / ek adım uydurulmaz; sunucu tarafında gerekirse `GET /api/setup` yanıtına `complete: boolean` (= bootstrapped) alanı eklenir — hangi uçtan okunacağı worker'ın kararı, ama kaynak tek ve gerçek olmalı.
3. **Web:** rail girişi koşullu render edilir; durum uygulama açılışında BİR kez yüklenir (mevcut auth/settings fetch'i varsa onunla — gereksiz ekstra istek yok) ve store/cache'te tutulur; sayfa yenilemede tekrar doğrulanır.
4. **Pane kaydı KALIR:** gizliyken de Setup panesine programatik yolla (tab/URL/komut) erişilebilir kalır; setup işlevleri (feature kaydı, init, doctor) silinmez — yalnız görünürlük değişir.
5. **Kapsam:** inspector-rail + varsa mobil/başka sidebar listeleri (aynı kural). Kurulum bitmemişse davranış AYNEN eskisi gibi.

## Kontrol (kabul kriterleri)

- Bootstrapped instance'ta: sidebar'da Setup girişi **YOK**; unbootstrapped instance'ta **görünür**.
- Setup işlevleri erişilebilir kalır: pane programatik açılabiliyor; `GET /api/setup` + doctor uçları çalışıyor.
- Kapılar: `bun x tsc --noEmit` 0; sterilize build; pm2 tek-proc restart; canlı bundle = disk hash; yeni canlı prob `scripts/probe-setup-visibility.cjs` (rail'de setup girişi yok + `/api/auth/settings` → `bootstrapped:true`); birim testler: rail koşullu render (iki durum) + setup durum okuma.
- İlgili testler güncel: `components/setup/setup.test.ts` + rail/app-shell testleri.

## Dokunulacak yerler (öngörü)

- `packages/lokma-web/web/src/components/shell/inspector-rail.tsx` (koşullu giriş)
- `packages/lokma-web/web/src/components/app-shell.tsx` + durum kaynağı (auth settings fetch'i; gerekirse `lib/api.ts`)
- `packages/lokma-web/server/src/routes/setup.ts` (gerekirse `complete` alanı)

## Bitirme (done)

1. Kontroller canlıda PASS + kanıt (prob çıktısı + ekran görüntüsü + bundle hash).
2. Atomik İngilizce commit(ler) + `git push origin main`.
3. Bu dosya: `Status: done` + hash'ler; `git mv` → `Docs/refactor/finished/`; README index güncellenir; `Docs/00-LOKMA-KONTEKST.md`'ye kronoloji satırı.

## Notlar

- Tamamlanma = **bootstrapped** (ilk admin). Ek koşul (feature seçimlerinin kaydedilmiş olması vb.) İSTENMEDİ — kullanıcı, tamamlanmış instance'ta bu girişi görmek istemiyor.
- Pane tamamen kaldırılmıyor ve başka bir yere (Settings vb.) taşınmıyor — yalnız sidebar görünürlüğü. Taşıma gerekirse ayrı REQ.
- `concept/` prototipi kapsam dışı — yalnız `packages/lokma-web`.

## Sonuç (done 2026-09-26)

- **Uygulama:** Setup girişi artık KOŞULLU — tek doğruluk kaynağı sunucunun `bootstrapped` biti (`GET /api/auth/settings`). App boot gate'i AYNI fetch'ten yeni `lib/bootstrapped.ts` store'unu tohumlar (ekstra istek yok; her sayfa yenilemesinde tekrar doğrulanır). `visibleInspectorRailItems(bootstrapped)` display listesini filtreler: bootstrapped instance'ta Setup ikonu desktop rail'den VE mobil 'tools' şeridinden düşer (20/21). Canonical `INSPECTOR_RAIL_ITEMS` tablosu + pane kaydı dokunulmadan kalır. Bilinmeyen durum (yükleniyor/hata) bootstrapped SAYILMAZ → taze kurulumda liste eskisi gibi; gizleme yalnız gerçek `true`'da olur.
- **Pane erişilebilirliği:** rail girişi yokken de Setup panesine ulaşılıyor — Extras → `lokma doctor --agents` satırındaki Open, Inspector'ı rail'siz Setup sekmesine geçiriyor ve pane render ediyor (`1 Init`/`4 Cloud`); `GET /api/setup` + `GET /api/doctor` 200.
- **Kanıt:** yeni canlı prob `scripts/probe-setup-visibility.cjs` **16/16 PASS** (canlı app :3457, minted Bearer — gate ON): settings `bootstrapped:true`; rail 20/21 (Setup yok, Todos sanity); mobil şeritte Setup pili yok; Extras→Open ile Setup panesi render; negatif kontrol (settings `bootstrapped:false` stub'ı) rail'de Setup'ı GERİ getiriyor (21/21); iki bağlamda 0 konsol hatası; prob oturumu POST /api/sessions ile açılıp silindi ve GET→404 ile re-check edildi (prob-oluşturulan durum temiz).
- **Kapılar:** root `bun x tsc --noEmit` 0; sterilize web build yeşil (`index-BYjhiqz2.js`); concept build yeşil; `pm2 restart lokma-web` sonrası servis edilen bundle == disk hash. Testler: inspector-rail 24/24 (4 yeni REQ-169 koşullu-liste kontrolü) + bootstrapped store 6/6.
- **Commitler:** `0825ac9` (refactor web) + `df0684f` (probe) + bu kapanış docs commit'i.
