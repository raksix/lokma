# REQ-169 — Setup girişi kurulum bittikten sonra sidebar'larda görünmesin

**Status:** pending
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
