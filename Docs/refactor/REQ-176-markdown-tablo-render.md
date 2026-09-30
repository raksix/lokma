# REQ-176 — Sohbette markdown TABLO render edilmiyor (ham `|` metni kalıyor)

**Status:** pending
**Tarih:** 2026-09-30
**Kaynak:** Kullanıcı mesajı + ekran görüntüsü (30 Eyl 2026):
> "tablo falan parse edemiyor düzügnce onu da düzelt"
**Ek:** `assets/REQ-176-ss1-tablo-ham.png`

## Belirti

Asistan cevabındaki markdown tablosu **ham metin** olarak görünüyor: `| Katman | Ne çıktı |`, `|--------|----------|` ve tüm satırlar düz yazı; gerçek tablo çizilmiyor. Ekranda ayrıca bazı öğeler ham kalıyor (örn. `- Token'lar: ...` düz metin, satır içi kodlar backtick'li metin gibi).

## Kök neden (kod izleri)

`packages/lokma-web/web/src/components/chat/lokma-message.tsx`:

- Blok ayrıştırıcı `parseMarkdownBlocks()` yalnız şu blokları üretiyor: `p, h(1-4), quote, hr, ul, ol` (`MdBlock` union, satır 203-209). **`table` diye bir blok türü YOK.**
- Tablo satırları (`| ... |`) hiçbir kurala uymadığı için son paragraf grubuna düşüyor; `|---|:---:|` ayraç satırı hr regex'ine de uymuyor (`^\s*---\s*$` bekliyor, satır `|` ile başlıyor) → tek `p` bloğu, ham metin.
- Inline katman (`renderInline`, satır ~317) bold/italic/code/strike/link destekliyor — eksik olan blok tarafı.

## Kapsam

1. **GFM tablo bloğu:** `MdBlock`'a tablo türü eklenir — `{ kind: 'table'; header: string[]; aligns: ('left'|'center'|'right')[]; rows: string[][] }` (veya eşdeğeri); `parseMarkdownBlocks` header + ayraç satırını (`|---|:---:|---:|`) tanıyıp gövde satırlarını toplar; ardışık tablolar ve eksik/boş hücreler doğru işlenir.
2. **Render:** gerçek `<table>` (`<thead><tr><th>` + `<tbody><tr><td>`); ayraçtan **hizalama** (sol/orta/sağ); mevcut krem/ink tokenlarıyla uyumlu kenarlık ve tipografi, koyu tema dahil; **dar ekranda yatay kaydırma** (`overflow-x-auto` sarmalayıcı — sayfa taşmaz); hücre içeriği `renderInline` ile (bold/code/link çalışır).
3. **Diğer eksikleri doğrula/tamamla:** ekran görüntüsünde ham görünen öğeler (liste madde işareti, kalın, satır içi kod) gerçekten render edilecek şekilde kontrol edilir; tablo hücresinde `|` kaçışı (`\|`) desteklenir.
4. **Güvenlik ilkesi korunur:** REQ-069 kararı — **`dangerouslySetInnerHTML` YOK**; model çıktısı markup/script enjekte edemez, her şey React elementi olarak üretilir.
5. **Streaming uyumu (REQ-123):** tablo yarım gelirken (ayraç satırı henüz gelmemişken) render çökmemeli; tamamlanınca tabloya döner — canlı akış yolu bozulmaz.
6. **Kopyalama:** tablo metni seçilebilir/kopyalanabilir; mevcut CodeBlock/copy davranışı değişmez.

## Kabul (kabul kriterleri)

- **Birim testler:** `parseMarkdownBlocks` tablo senaryoları (hizalama varyantları, boş/eksik hücre, `\|` kaçışı, ardışık tablolar, hücre içinde **bold** ve `code`) + mevcut testler PASS.
- **Canlı prob** `scripts/probe-markdown-table.cjs`: sohbete tablolu bir cevap üretilir → DOM'da **`<table>` VAR** (satır/sütun sayısı beklenenle aynı), ekranda `|---|` veya `| Katman |` gibi **ham metin YOK**; dar genişlikte tablo sayfayı taşırmıyor (yatay kaydırma konteyneri var).
- Before/after ekran görüntüsü REQ dosyasına/commit'e eklenir.
- Kapılar: `bun x tsc --noEmit` 0; ilgili testler güncel; sterilize build; pm2 tek-proc restart; canlı bundle == disk hash.

## Dokunulacak yerler (öngörü)

- `packages/lokma-web/web/src/components/chat/lokma-message.tsx` (`MdBlock`, `parseMarkdownBlocks`, `renderMdBlock`) + `lokma-message.test.ts`

## Bitirme (done)

1. Kontroller canlıda PASS + kanıt (prob çıktısı + before/after ekran görüntüsü + bundle hash).
2. Atomik İngilizce commit(ler) + `git push origin main`.
3. Bu dosya: `Status: done` + hash'ler; `git mv` → `Docs/refactor/finished/`; README index güncellenir; `Docs/00-LOKMA-KONTEKST.md`'ye kronoloji satırı.

## Notlar

- `deepseek/deepseek-v4.1-flash` sık sık tablo üretiyor → tablo desteği öncelikli; diğer öğeler doğrulama kapsamında.
- Write-only: kod yazılmadı; worker uygular.
