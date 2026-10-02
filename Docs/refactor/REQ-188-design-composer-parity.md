# REQ-188 — Design brief input'u gerçek input olsun (chat composer'ıyla aynı tasarım + yetenekler)

**Status:** pending
**Tarih:** 2026-10-02
**Kaynak:** Kullanıcı mesajı (2 Ekim 2026):
> "kanka design de input nromal inptula aynı tasarımda anyı cpomntent gibi kulanabilrisn."

**İlişkiler:** REQ-172 (Design iki kolon) · REQ-176..179 (Design görsel kalite) · REQ-189 (artifacts panel) bu dalganın ardılı.

## Bugünkü durum (ölçülmüş, `file:line`)

1. **Design'in brief alanı ham bir `<textarea>`** — `packages/lokma-web/web/src/components/design/design-chat.tsx:247-261`: `rows={3}`, `placeholder="e.g. pricing page, 3 tiers, terracotta, Stripe polish…"`, `⌘/Ctrl+Enter` handler'ı **kendi içinde** (`:252-257`). Görsel olarak uygulamanın geri kalanından kopuk: `border-line` + `rounded-lg`, marka aksanı yok, chip yok, mention yok, `/command` yok.
2. **Chat composer'ı aynı işi çok daha iyi yapıyor** — `packages/lokma-web/web/src/components/chat/composer.tsx`: `@path` mention → **chip**e dönüşüyor, `/command` satırı **paleti** açıyor, Enter gönderiyor / Shift+Enter satır atlıyor, ek (attachment) düğmesi var, boş-ipuçları var. Saf yardımcıları `packages/lokma-web/web/src/components/chat/composer-utils.ts` içinde (`parseMentions`, `removeMention`, slash parse) ve `chat.test.ts` ile testli.
3. **İki composer birbirinden kopuk**: `composer-utils.ts`'teki mention/slash mantığı Design'de **hiç kullanılmıyor**; Design kendi `⌘Enter`'ını elle tekrar yazıyor (tekrar = DRY ihlali, proje kuralı #9).
4. **`/file` ile proje bağlamı:** Design zaten proje kapsamlı (REQ-178), yani brief içinde `Docs/34-…md` gibi bir dosya yolu geçmek **doğru çalışmalı** — şu an `type="text"` davranışı sayesinde farkında değil ama hiçbir işlev de yok.

## Kapsam

1. **Tek Composer primitifi, iki yüzey:** Design brief, chat `composer.tsx`'in **aynı** bileşenini kullansın (modu: `variant="design"`). Aynı token seti: kenar, focus halkası (`terracotta/30`), yazı tipi, ipucu rengi, boş durum, chip stili, ikon satırı.
2. **Mention (`@path`) yeteneği:** `parseMentions` Design'de de çalışsın — yazılan yol **chip**e dönüşsün, `⌫`/`×` ile düşsün; brief'e gömülü yol, üretim isteğinde `<file path="…">` bloklarına dönüşsün (yani ajan gerçekten o dosyayı okusun, isim görmesin).
3. **`/command` paleti:** `/design` (yeni brief), `/system`, `/template`, `/examples` gibi Design'a özel komutlar + mevcut komutlar tek listede; okunabilir kısayol ipuçlarıyla.
4. **Enter / Shift+Enter / ⌘Enter:** Enter gönderir, Shift+Enter satır atlar, ⌘/Ctrl+Enter de gönderir (mevcut davranış korunur) — **tek** yerde tanımlı.
5. **Çok satırlı davranış:** 3 satırda otomatik büyür, 12 satırda iç kaydırma (composer ile aynı tavan).
6. **Ekle düğmesi:** `+` ile artifact'a referans eklenir (REQ-189'daki listeden seçim), tek yazma yolu (`use-design-studio`).
7. **Dürüst durumlar:** üretim sırasında composer kilitlenir ve neden görünür; boş brief gönderilemez (`Generate` pasif + ipucu).
8. ** Erişilebilirlik:** `aria-label`, ⌘Enter ipucu `aria-describedby` ile okunur, chip'ler `role="button"` + klavye ile silinir.

## Kontrol (kabul kriterleri)

- `git diff` kanıtı: `design-chat.tsx`'de ikinci bir Enter/mention mantığı **yok** (tek uygulama).
- Brief içine `@Docs/34-DESIGN…md` yazılıp Enter → sohbette **chip**, üretim isteğinde `<file path="Docs/34-…md">` (prob istek gövdesini okur).
- `/` ile palet açılır, `design` komutu listede, Enter ile uygulanır.
- Enter gönderir / Shift+Enter satır atlar / ⌘Enter gönderir — üçü de prob'da.
- Composer, chat composer'ı ile **aynı sınıf adlarını** taşır (görsel eşitlik ölçümü: computed style kenar/yazı/ipucu rengi).
- Üretim sırasında kilit + neden; boş brief gönderilemiyor.
- 390px'te taşma yok.
- Kapılar: `composer-utils` birimleri + design birimleri yeşil, `bun x tsc --noEmit` 0, sterilize build, `pm2 restart lokma-web`, canlı bundle == disk, canlı prob `scripts/probe-design-composer-parity.cjs`.

## Dokunulacak yerler

- `packages/lokma-web/web/src/components/chat/composer.tsx` (orthak primitif) + `composer-utils.ts`
- `packages/lokma-web/web/src/components/design/design-chat.tsx` (`:200-270` composer bloğu)
- `packages/lokma-web/web/src/components/design/use-design-studio.ts` (brief + mention/command yorumlama)
- `packages/lokma-core/src/tools/parse.ts` veya design uçları — `<file>` bloklarının ajana taşınması

## Bitirme (done)

1. Kontroller PASS + prob + ekran görüntüsü (`assets/REQ-188-ss*.png`).
2. Atomik İngilizce commit(ler) + push.
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index + `Docs/00` kronoloji.

## Notlar

- **Write-only:** kod yazılmadı. Kullanıcının ekran görüntüsü **Design sayfasını değil**, Browser pane'in `127.0.0.1:3014` bağlantı hatasını gösteriyordu ("127.0.0.1 bağlanmayı reddetti") — istekler bu yüzden koda bakarak yazıldı; ekran kanıtı bu REQ'e ait değil.
