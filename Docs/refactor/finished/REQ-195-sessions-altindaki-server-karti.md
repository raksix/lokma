# REQ-195 — Sessions listesinin altındaki Server kartı kalksın (durum zaten başka yerde)

**Status:** done (2026-10-03, commit `9987ac9`)
**Tarih:** 2026-10-03
**Kaynak:** Kullanıcı mesajı (3 Ekim 2026):
> "sessionsa da en altta buna grek yok kaldır"

Ekranlar: `upload_20261003_102557_5.png` + `upload_20261003_102614_6.png` — ikisi de aynı kare, en altta **Server** kartı:
> `Server`
> `• server up    Fastify :3456`

**İlişkiler:** REQ-043 (Explorer ayrışması — bu kart o zaman "sessions + server card" olarak konmuştu) · REQ-175 (header'dan `Active/Down` rozeti kaldırıldı, **aynı gerekçe**) · REQ-193/194 (aynı tur).

## Bugünkü durum (ölçülmüş, `file:line`)

1. **Kart tam olarak ekrandaki yerde.** `packages/lokma-web/web/src/components/app-shell.tsx:613-623` — `explorerContent` = `<SessionsSidebar/>` + bir `<div className="rounded border border-dashed p-3">` içinde `Server` başlığı, `<HealthBadge/>` ve `<span>Fastify :3456</span>`. Yani Explorer'ın (sessions panelinin) **en altına** yapışmış, `space-y-4` ile sadece boşluk bırakıyor.
2. **İçeriğin tamamı gereksiz çünkü **başka yerde zaten var:**
   - `packages/lokma-web/web/src/components/shell/footer-bar.tsx:44-51` → `gateway · 281ms` / `gateway down` (canlıda ekranda da görünüyor, REQ-175 notu).
   - `HealthBadge` (`packages/lokma-web/web/src/components/status/health-badge.tsx:32`) → `● server up` / `○ checking…` — bu rozet Settings içinde de kullanılıyor. **Düzeltme (ölçüldü, aşağıdaki ilk taslak yanlış sayıyordu):** satır **Settings → About**, `AboutSection` (`settings-modal.tsx:448`, `<dl>` `:474-477`), **General değil** — `general` sekmesi bu satırı içermiyor.
3. **Kullanıcının gerekçesi tutarlı ve zaten bir kez savunuldu:** REQ-175'te header'dan `sess_…` + `Active/Down` rozeti **aynen bu yüzden** kaldırılmıştı — bilgi gerçek ama kullanıcıya hiçbir şey söylemiyor, sadece yer kaplıyor. Buradaki kart aynı sınıf.
4. **Port yazısı ayrı bir tuzak:** `Fastify :3456` **derlenmiş** bir sabit — farklı port/host'ta çalıştırınca **yanlış** bilgiyi gösterir (REQ-193'teki uzak kurulum bahsi bunu daha da yanıltıcı kılıyor).

## Kapsam

1. **`explorerContent`den kart kaldırılsın** (`app-shell.tsx:616-622`): sessions listesinin altı artık temiz biter. **Silinen** kod = kartın `<div>`'i, `Server` başlığı, `<HealthBadge/>` ve `Fastify :3456` satırı; `HealthBadge` **import'u da** temizlenir (grep ile başka kullanım kalmadığı doğrulanarak).
2. **Bilgi kaybı olmasın:** `serverUp` durumu **footer-bar'da zaten** var (`gateway · Nms` / `gateway down`) — kart kaldırılınca da görünür kalır. Settings → General'deki `Fastify :3456 · version` satırı **kalır** (oraya kullanıcı bilerek gidiyor).
3. **Kanıt disiplini:** kaldırma sonrası canlı bundle'da `Fastify :3456` **tek** yerde kalmalı (grep `index-*.js`), Explorer'da `Server` başlığı **0**, ve oturum listesi panelin sonuna kadar uzanmalı (alt boşluk yok).

## Kontrol (kabul kriterleri)

- Sessions paneli en altta **yalnız** oturum listesi var: `Server`, `server up`, `Fastify :3456` **hiçbiri** görünmüyor.
- Panelde artık o boş kesikli kart yeri yok; liste panelin dibine kadar iniyor (probe: son satırın alt boşluğu < bir satır yüksekliği).
- `health-badge` import'u kaldırıldı; `grep -rn "Fastify :3456" web/src` → yalnız `settings-modal.tsx:369`.
- Footer'da gateway durumu **daha da görünür** kalıyor (`gateway · Nms`).
- Mobil tek-kolon düzende de kart yok.
- Kapılar: tsc 0, sterilize build, `pm2 restart lokma-web`, canlı bundle == disk hash, prob `scripts/probe-explorer-no-server-card.cjs` (DOM yokluk + import temizliği + footer var).

## Dokunulacak yerler

- `packages/lokma-web/web/src/components/app-shell.tsx` (`:613-623` + `HealthBadge` import satırı)
- `packages/lokma-web/web/src/components/shell/footer-bar.tsx` (yalnız doğrulama — değişmez)

## Bitirme (done)

1. Kontroller PASS + prob.
2. Atomik İngilizce commit + push.
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index + `Docs/00`.

## Sonuç (2026-10-03, `9987ac9`)

- `explorerContent` artık **yalnız** `<SessionsSidebar/>` — sarmalayan `space-y-4` ve kesikli kart `div`'i gitti.
- `HealthBadge` **import'u** kaldırıldı; grep ile doğrulandı (bileşenin kendi dosyası hariç **0** kullanım). Bileşenin kendisi silinmedi — ileride başka yerde kullanılabilir, bu REQ yalnız `app-shell`'deki tek çağrıyı kaldırıyor.
- Ölçülen: **tsc 0** · sterilize build yeşil (`index-Dxl876ve.js`) · `pm2 restart lokma-web` → canlı bundle **==** disk hash · login gate **ON** kaldı (tokenless `/api/auth/me` → 401).
- Bundle kanıtı (**güncel** chunk'ta — `emptyOutDir:false` yüzünden eski hash'lerde arama yapmak yanlış kanıt verir): `Fastify :3456` index chunk'ta **0**, tek yerde `settings-modal-CF-ba05w.js`'te **1**.
- Canlı prob `scripts/probe-explorer-no-server-card.cjs` **12/12**. Kart metinleri Explorer **kapsayıcısının içinde** yoklanıyor (kapsam önemli: footer meşru olarak `gateway` gösteriyor, toast'lar "is the server up?" diyor — sayfa genelinde arama yanlış pozitive verirdi).
- **Proven-to-fail:** kart geri konunca (build + restart sonrası) tam olarak **2** kart assert'i kırmızı, `exit 1`; geri alma **bayt bayt** yapıldı (`md5sum` doğrulandı).

### Probdan çıkan iki ölçüm (ilk yazımda yanlış olanlar)

1. **Footer `<footer>` etiketi değil**, sade bir `div` (`h-6 shrink-0 … border-t`) — ilk prob `querySelector('footer')` ile boş döndü. Gerçek node `^gateway` ile başlayan metinle bulundu (ölçüldü: `gateway · 21ms …`, y=926).
2. **Sunucu satırı Settings → General'da değil, About'ta** (`AboutSection`). `?settings=general` ile açılan modalda satır **yok** (`hasFastify:false`), `?settings=about` ile **var** (`Fastify :3456 · 0.1.0`) — yani ilk prob "bilgi kayboldu" diye okuyabileceği halde aslında yanlış sekmeye bakıyordu. Prob düzeltildi, **ürün değişmedi**.

## Notlar

- **Write-only:** kod yazılmadı. Ekranlar bu REQ'in kanıtı (`assets/REQ-195-ss1..2.png`).
- Bu, REQ-175'in **aynı kararının** Explorer'a taşınmış hâli; ikisi de "durum rozeti gerçek ama yer kaplıyor" sınıfı. Aynı dalgada iki ayrı yüzeyde aynı temizlik yapılıyor.
