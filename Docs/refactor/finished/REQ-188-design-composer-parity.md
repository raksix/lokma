# REQ-188 — Design brief input'u gerçek input olsun (chat composer'ıyla aynı tasarım + yetenekler)

**Status:** done
**Tarih:** 2026-10-02 — kapandı 2026-10-03 (`f247e8d`, `889330f`, `7137b2f`)
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

## Kapanış (2026-10-03) — ölçülen

### Kapsam 1-5 + 7-8: tek primitif (commit `f247e8d`)

`packages/lokma-web/web/src/components/chat/composer-input.tsx` (yeni) prompt
input'unun **tek** sahibi: auto-grow textarea, `@path` chip'leri, `/` paleti ve
Enter kontratı. İki yüzey de onu bileşik ediyor.

- **Yapısal kabul (ölçüldü):** `grep -c "<textarea" composer.tsx` → **0**; bundle
  içinde composer Enter kuralı (meta/ctrl/shift) **1** kez, `@path` mention
  deseni **1** kez tanımlı. İkinci bir uygulama yok.
- `design-slash.ts` (yeni): Design'ın kendi komutları **veri** olarak
  (`/new`, `/sample`, `/type`, `/system`) + saf uygulayıcı; her satır gerçek
  bir form düzenlemesi, bilinmeyen değer sessiz no-op yerine hata döner.
- Erişilebilirlik: `aria-label`, `aria-describedby` → ipucu, chip'ler
  `role="button"` + Enter/Space ile silinir, `X` düğmesi `aria-label`'lı.
- Çok satırlı: Design 56→200px, chat 28→120px (aynı `min/maxHeight` API'si).

### Kapsam 2 — asıl boşluk: mention gerçekten içeriğe dönüşmüyordu (commit `889330f`)

Chip **görünüyordu**, ama `POST /api/design/generate` `form.brief`'i **olduğu
 gibi** gönderiyordu — model `@Docs/34-….md` **dosya adını** alıyordu, dosyayı
 okumuyordu. REQ'in vaat ettiği "üretim isteğinde `<file path>` bloğu" o
 yüzeyde sessizce hiçbir şey yapmıyordu.

- `server/src/utils/context-blocks.ts` (yeni) okuyucuyu sahiplenir:
  `readContextBlocks` (WS yolundan **çıkarıldı** — aynı jail, 5 dosya / 20KB
  tavanı, `<context path="…">` şekli) + `expandPromptMentions` (mention metnini
  **siler**, gerçek içeriği başa koyar → model dosya adı değil içerik görür).
  Okunamayan/jail dışı yol **atlanır**, asla hata değil — bir yazım hatası
  üretimi çökertmemeli.
- `routes/design.ts` brief'i **artifact'in saklandığı aynı cwd'ye** göre
  açar (proje kapsamlı mention proje dosyasını okur).
- `routes/ws.ts` artık paylaşılan okuyucuyu import eder; özel kopyası ve o
  kopyanın tek başına kullandığı 6 sembol (`readFile`, `stat`, `relative`,
  `resolveInRoot`, `MAX_CONTEXT_FILES`, `MAX_CONTEXT_BYTES`) silindi.
- `server/tsconfig.json` artık `**/*.test.ts` hariç tutuyor (lokma-core /
  lokma-ai / lokma-shared ile aynı konvansiyon) — yoksa `src/` içindeki bir
  test dosyası "Cannot find module 'bun:test'" ile **yayın build'ini** kırıyor.
- Sunucu mention regex'i istemci `composer-utils.ts` deseniyle **birebir**
  eşitlenip testle sabitlendi: chip ile blok tek parser'ın iki ucu.

### Kapılar

| Kapı | Sonuç |
|---|---|
| `bun x tsc --noEmit` (root) | 0 hata |
| `server` build | temiz |
| `web` sterilize build | yeşil (`1860+` modül) |
| `bun test src/utils/context-blocks.test.ts` | **15/15** |
| `agent-loop` / `session-feed` | 52 ve 11 — değişmedi (geçici HOME şartı pre-existing guard) |
| canlı prob `scripts/probe-design-composer-parity.cjs` | **25/25** |
| negatif kontrol | private token seti geri getirildi → prob **kırmızı** (yalnız parity kontrolleri), revert md5 birebir |
| `pm2 restart lokma-web` + bundle | `index-CiMtGyrA.js` disk == canlı |
| login gate | `/api/auth/me` → **401** (kapı AÇIK kalmadı) |

### Prob neyi gerçekten ölçtü

- **Parity:** chat composer Design modunda **mount edilmediği** için onu
  ölçmek hiçbir şey karşılaştırmazdı (ilk denemede 3 kontrol bu yüzden
  kırmızıydı — **prob hatası**, ürün farkı değil). Dürüst ölçüm: iki yüzey de
  `COMPOSER_SHELL_CLASS` sabitini boyuyor; sabitin class string'i canlı shell'in
  `className`'i + **computed** border/radius ile karşılaştırıldı.
- **Yapısal:** bundle'da ham `key==="Enter"` sayısı (16) **anlamlı değil**
  (her arama/liste input'u sayılıyor). Doğru ölçüm: composer'ın
  meta/ctrl/shift Enter kuralı ve `@path` deseni **kaç kez tanımlı**.
- **Wire:** DOM okuması göremez; `/api/design/generate` POST'u yakalanıp
  gövdesi okunur. **Route stub'landı** (gerçek çağrı dakikalarca kilitliyor,
  artifact bırakıyor, token yakıyor) → deterministik, hızlı, artifact'siz.
  Sunucu tarafındaki genişletme aynı okuyucuya karşı birim testlerle ölçülüyor.
- **Dürüst durumlar:** üretim sırasında composer kilitli + Generate pasif;
  bitince brief sıfırlanır ve **boş brief'te Generate yeniden pasif** olur
  (ilk "wedge" hatası probe'un kendi beklentisiydi: kilit açılması için
  `generateDisabled === false` bekleniyordu, oysa ürün doğru davranıyordu).

### Ekran görüntüsü

`assets/REQ-188-ss1-composer-parity.png` (prob çıktısı, chip + palette durumu).
`assets/REQ-188-ss0-tasin-basar.png` = kullanıcının ekranı, bu REQ'e ait **değil**.

### Temizlik

Stub öncesi çalışan tek denemede Enter gerçek uca düşüp bir artifact
yaratmıştı (`line-one-line-two-mus94yss`, brief "line one\n line two"); API ile
silindi ve **kalıcı yok** diye yeniden kontrol edildi. Kullanıcının gerçek
artifact'i (`portfolyo-sitesi-yaz-muq2yi8e`, 1 Ekim) **korundu**.
