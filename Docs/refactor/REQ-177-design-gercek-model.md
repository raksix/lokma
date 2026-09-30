# REQ-177 — Design üretimi GERÇEK modele bağlansın + model seçimi gelsin ("tasarımlar çok kötü"nün kökü)

**Status:** in-progress (worker — core + server + UI landed; live API path 21/21 PASS including the budget fix; remaining: UI picker probe, before/after screenshots, close-out)
**Tarih:** 2026-09-30
**Kaynak:** Kullanıcı mesajı + ekran görüntüsü (30 Eyl 2026):
> "bunların tasarımı desgin de çok kötü." / "ayrıcadesgin de model seçimi vs de yok."
**Ek:** `assets/REQ-177-ss1-design-form.png`

## Kök neden (kod izleri — kanıtlı)

- `packages/lokma-web/server/src/routes/design.ts:42` → `POST /api/design/generate { type, brief, system? }` — **body'de model YOK** (`GenerateDesignBody`, `lib/api.ts:619`).
- `packages/lokma-core/src/design/store.ts:243` → `generateArtifact()` doğrudan **`buildArtifactHtml(type, brief, system)`** çağırıyor: bu **deterministik bir şablon üreticisi**, LLM çağrısı yok.
- `packages/lokma-core/src/design/render.ts` — görsel yer tutucu net: *"No image model in the harness — a deterministic SVG composition holds"* ("SVG placeholder composition …" metni artifact HTML'ine gömülü).
- Artifact'lar global: `~/.lokma/design/artifacts/<id>/`.

**Sonuç:** "Generate" gerçek bir tasarım üretmiyor, şablon basıyor → üretilenler "çok kötü" görünüyor; model kullanılmadığı için de model seçimi yok. İki şikâyet aynı kökten.

## Kapsam

1. **Üretim gerçek model çağrısına bağlanır:** `generateArtifact` (ve gerekiyorsa yeni bir `generateArtifactHtml` yolu) **lokma-ai adapters** üzerinden LLM çağırır (mevcut provider zinciri; stream veya tek atım — worker'ın kararı; sanitize/validate aynı kalır). Prompt: seçili tip (prototype/deck/mobile/image/document/hyperframe) + brief + sistem (bundled token seti veya proje DESIGN.md guard'ı) → **tam, geçerli HTML** çıktısı.
2. **Model seçimi:** istek gövdesine `model` alanı eklenir (`GenerateDesignBody.model?`) ve **UI'da model seçici** olur (composer'daki picker deseni: 'Default' = config default zinciri, liste `/api/models` kataloğundan; seçim localStorage'da kalıcı — REQ-130/133 desenleri). Seçili model generate çağrısına gider.
3. **Dürüst hata:** model yok/anahtar yok/upstream hata → kullanıcıya **net hata** (sessizce şablona düşme YOK). Eski deterministik builder kodda kalabilir ama **varsayılan yol LLM**; otomatik fallback yapılacaksa bu UI'da açıkça belli olmalı (ör. "offline template") ve tercihen hiç yapılmamalı.
4. **Kalite kuralları (prompt sözleşmesi):** çıktı HTML'i gerçek içerik + tipografi + boşluk kullanır; **placeholder SVG / "lorem" / "placeholder composition" metni YASAK**; renkler seçili sistemin tokenlarından; sayfa responsive; kod tek dosya (inline CSS) olarak geçerli.
5. **Mevcut akış korunur:** `persist()` + 5D critique + guard + export uçları aynen; sadece HTML'in KAYNAĞI değişir. Streaming tercih edilirse canlı ilerleme chat'e narration chip olarak düşer.

## Kabul (kabul kriterleri)

- Canlı kanıt: aynı tip + FARKLI iki brief → **iki belirgin şekilde farklı, gerçek HTML** (önceki deterministik şablon çıktısıyla aynı olmadığı commit'te gösterilir); sayfada "placeholder" yaklaşımı kalmamış.
- UI'da model seçici görünür + seçim generate'e gidiyor (probe: seçilen model istek gövdesinde); yenileme sonrası seçim korunur.
- Model hatası senaryosu: kullanıcıya net hata (şablona sessiz düşüş yok — test edilir).
- Kapılar: `bun x tsc --noEmit` 0; design testleri + yeni birim testleri (prompt kurucu saf fonksiyon olarak test edilebilir); sterilize build; pm2 tek-proc restart; canlı bundle == disk hash.
- Before/after ekran görüntüsü (üretilen artifact kalitesi).

## Dokunulacak yerler (öngörü)

- `packages/lokma-core/src/design/store.ts` (+ gerekirse yeni `generate` modülü), `render.ts` (fallback/fixture olarak kalır)
- `packages/lokma-web/server/src/routes/design.ts` (`model` alanı, provider çağrısı, hata eşlemesi)
- `packages/lokma-web/web/src/lib/api.ts` (`GenerateDesignBody.model?`), `components/design/design-chat.tsx` (+ model picker), `use-design-studio.ts`

## Kanıt (30 Eyl — tur 3, canlı)

- **Canlı API yolu (public URL, nginx üzerinden):** `scripts/probe-design-real-model.cjs` → **21/21 PASS**
  - A: modelsiz generate → gerçek model çağrısı; manifest `commandcode/deepseek/deepseek-v4.1-flash`; 21.608 bayt gerçek HTML (103s; önceki koşu 114s)
  - B: ikinci brief → 27.368 bayt, ayrı içerik; A/B kelime jaccard 0.363 — iki belirgin farklı doküman
  - C: istek modeli default'u yener (`offline-template` sentinel manifest'e yazıldı); aynı brief için gerçek çıktı deterministik şablondan kökten farklı (jaccard 0.147; şablon 1.873 bayt)
  - D: eski şablonun `SVG placeholder composition` işareti aynı filler denetimine yakalanıyor (pozitif kontrol — A6/B6'daki 'temiz' sonuç anlamlı)
  - E: kötü model id → **502** `{code: design_upstream_error, message}` + artifact YOK (sessiz şablon fallback yok)
- **Bütçe düzeltmesi (ölçüme dayalı):** tam HTML üretimi ~2 dakika sürüyor (103-114s; bir deneme eski 120s tavanını aştı ve jenerik 502'ye düştü) → `DESIGN_GENERATION_TIMEOUT_MS` **120s → 240s** + abort artık sinyal üzerinden izlenir, `design_timeout/504`'e eşlenir. Prod nginx `/api/` `proxy_read_timeout` **60s → 300s** (sunucu config'i, repo dışı; yedek `/root/nginx-backups/`).
- **Birim + gates:** core design suite (generate 24 · raster 15 · webm 23) PASS; core+server `tsc --noEmit` 0; kök `tsc --noEmit` temiz; lokma-server tek-proc restart (13:57) sonrası canlı bundle/binary bayat değil.
- **Kalan:** UI probu (picker görünür + seçim istek gövdesinde + reload kalıcılığı + hata görünürlüğü), before/after ekran görüntüleri, kapanış.

## Bitirme (done)

1. Kontroller canlıda PASS + kanıt (prob/çıktı farkı + ekran görüntüsü + bundle hash).
2. Atomik İngilizce commit(ler) + `git push origin main`.
3. Dosya: `Status: done` + hash'ler; `git mv` → `Docs/refactor/finished/`; README index; `Docs/00-LOKMA-KONTEKST.md` kronoloji.

## Notlar

- Kullanıcı kuralı: SADECE `deepseek/deepseek-v4.1-flash` (CommandCode) — model seçici yine de katalogdan beslenir, varsayılan config'ten gelir.
- Write-only: kod yazılmadı; worker uygular. İlişkili: REQ-172 (sayfa düzeni), REQ-178 (proje seçimi).
