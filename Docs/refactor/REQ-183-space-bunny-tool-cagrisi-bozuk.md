# REQ-183 — space-bunny-alpha tool çağrısı yapamıyor (gerçek `tools[]` düşüyor + gövdesiz `<tool>` sızıyor)

**Status:** pending
**Tarih:** 2026-10-01
**Kaynak:** Kullanıcı mesajı (1 Ekim 2026):
> "sapce bunny modelinde tool çağrısı da yapamıo ona da serisinden bi fix"

Ekran: `commandcode/stealth/space-bunny-alpha · thinking: max · akil yurutme yayinlanmadi`; sohbette `Lokma 20:10` altında **ham** `<tool name="list_files">` metni.

**İlişkiler:** REQ-180/181/182 bu dalganın diğer işleri (bu REQ onlardan **bağımsız** — kendi başına bir bug). REQ-128 (tool engine) ve REQ-118 (native tools) bu hatanın doğduğu katmanlar.

## Bugünkü durum (ölçülmüş, `file:line` kanıtlı)

Önce modeli suçlamadan ölçüldü — **model ve upstream sağlam**:

| Ölçüm | Sonuç |
|---|---|
| `stealth/space-bunny-alpha` + `tools[]` (native) | HTTP 200, `finish_reason: tool_calls`, `tool_calls: [list_files]`, args `{"path":"."}` — **çalışıyor** |
| 10 ardışık koşu (tools + `tool_choice:auto`) | **10/10 nativeOnly**, sızıntı yok |
| `reasoning_effort: max` / `high` / `medium`, `reasoning:{effort:max}` | 4/4 native çalışıyor, sızıntı yok |

Yani `stealth/space-bunny-alpha` tool çağrısını **yapabiliyor**. Ekranın iki gerçek ayrıntısı sapmanın kapısını gösteriyor:

1. Ekrandaki id **`commandcode/stealth/space-bunny-alpha`** (viewId'li) → upstream'e **birebir gönderilirse** `HTTP 400 {"code":"unsupported_model","message":"Model \"commandcode/stealth/space-bunny-alpha\" is not supported on this endpoint."}`. (`shortModelId` — `packages/lokma-ai/src/provider/openai.ts:38-41` — ilk segmenti soyup `stealth/space-bunny-alpha` gönderdiği için **tel doğrudur**; sapma başka bir yoldan gelir.)
2. Transcript'te yazan **gövdesiz ve kapanışsız**: `~/.lokma/projects/-root-fermag-website-bbba7e40/sessions/sess_mupsivmh_4tvi.jsonl` → `'<tool name="list_files">'` (`role:'assistant'`, **`role:'tool'` satırı yok**). Gövdeli olsaydı `{"path":"."}` ile kapanırdı.

**Üç halkalı tek bug (hepsi ölçüldü):**

**(1) Yanlış capability-probe eşleşmesi — asıl halka.** Upstream'in gerçek `unsupported_model` 400'ü `looksLikeToolPairingError()`'e **yanlış eşleşiyor**: fonksiyon (`openai.ts:438-441`) 400/422 kabul edip gövdede `invalid_request_error` / `function` / `tool_calls` arıyor; gerçek gövde `{"error":{"message":"Model ... is not supported on this endpoint.","type":"invalid_request_error","param":"model","code":"unsupported_model"}}` — `invalid_request_error` yüzünden **eşleşiyor**. Ölçüm:
```
looksLikeToolPairingError(400, real_unsupported_model_body) -> true   ← YANLIŞ
looksLikeToolsUnsupported(400, aynı gövde)                   -> false  ← doğru (korumada)
```
Sonuç (`openai.ts:547-551`): `flattenHistory = true` → `buildBody` yeniden kurulur (`openai.ts:509`) ve **gönderilen `tools` alanı artık `[]` görünür** (`:482` zaten `flattenHistory`'dan bağımsız ama `chatTools` bu tur boşaltılır) → upstream `tools[]` **almaz** → model elinde şema yokken elindeki tek talimat olan `<tool name="...">` metnini yazar.

**(2) Gövdesiz `<tool>` parser'dan kaçıyor.** `COMPLETE_BLOCK` (`parse.ts:65`) `<tool name="x">…</tool>` ya da `<tool name="x" />` bekliyor. Gövdesiz + kapanışsız `<tool name="list_files">` **hiç eşleşmez** → çağrı çalıştırılmaz, blok metin olarak sohbete yazılır (transcript'te gördüğümüz satır). Üstelik `openai.ts:447` kendi prompt'unda `<tool name="...">` biçimini **dayatıyor**, yani kaçış yolu de bu.

**(3) Model hatası dürüst gösterilmiyor.** `unsupported_model` gerçek bir upstream hatası; `openai.ts:561-565` `http_error` fırlatır → loop'un retry'sı → kullanıcı sonunda "hiçbir şey olmuyor" görüyor. Doğrusu: viewId'li id upstream'e **asla gönderilmemeli**, `shortModelId` tek doğruluk kaynağı olmalı.

## Kapsam

1. **`looksLikeToolPairingError` daraltılsın** (`packages/lokma-ai/src/provider/openai.ts:438`): eşleşme **gerçek pairing reddi** için olmalı — gövdede `tool_call_id` / `tool_calls` **parametre adı** geçmeli. Jenerik `invalid_request_error` / `function` **tek başına** yetmez; `code` alanı `unsupported_model` / `model_not_found` / `invalid_api_key` ise **pairing değildir** → probe false dönmeli.
2. **Üç negatif kontrol testi (yanlış eşleşme regresyonu):** (a) gerçek `unsupported_model` gövdesi → `false`; (b) `Invalid API key` → `false`; (c) `insufficient credits` → `false`; (d) gerçek pairing reddi (`tool_call_id must be…`) → `true`. Aynı matris `looksLikeToolsUnsupported` için de korunur.
3. **`flattenHistory` geri bildirimi dürüst olsun:** probe bir kez "bu eşleşme pairing değil" derse, o 400 **olduğu gibi** `http_error` olarak yükselsin — sessiz yeniden deneme + şema düşürme yok.
4. **Gövdesiz `<tool name="x">` salvage (fail-safe):** `parse.ts` — kapanışsız/gövdesiz blok, akış **bitene kadar** biriktiyse `input:{}` ile çalıştırılmalı (kullanıcının niyeti belli, girdi yoksa araç şeması doldurur); gerçekten içi açık kalan yarım akışta **yine de** metin kalır (mevcut `BLOCK_FILTER_BUFFER_CAP` davranışı korunur, hayalet çağrı yok).
5. **`<tool>` markup sızıntısını upstream'tan ayır:** native `tool_calls` **geldiyse** (`:718-755`) aynı yanıttaki `<tool…>` metnini temizle — çift üretim (native + markup) canlıda bir kez ölçüldü (`content: "I'll list the files...<tool"` ile `tool_calls:[list_files]` aynı yanıtta); temizlik `text_delta` **yayınlanmadan önce** yapılır, transcript'e sızamaz.
6. **Model id doğrulaması:** upstream `unsupported_model` döndüğünde **viewId'li id** hatırlanıp `GET /api/models` kataloğunda **kırpılır** veya rozetlenir; kullanıcı seçim yaparken "bu model sunucuda yok" işareti görür. `shortModelId` tek kaynak kalır.
7. **Arayüz dürüstlüğü:** koşu "model tool çağrısı yapamıyor / şema gönderilemedi" durumunda **satır içi hata** bırakır (sessiz boş cevap yok — REQ-071 boş-ilk-tur kuralıyla aynı ahlak).

## Kontrol (kabul kriterleri)

- **Birim:** `adapters.test.ts` — 4 negatif + 1 pozitif `looksLikeToolPairingError` vakası; `parse.test.ts` — gövdesiz `<tool name="x">` → `input:{}` ile çağrı + yarım akış hâlâ metin.
- **Canlı prob:** `scripts/probe-space-bunny-tools.cjs` (mint'li token, gerçek model):
  1. `stealth/space-bunny-alpha` ile **3 ardışık koşu**: üçünde de `role:'tool'` satırı + transcript'te `Open project`/`list_files` **insan cümlesi**, ve transcript'te **hiç** `<tool` **yok**;
  2. ekranda görülen viewId'li seçim (`commandcode/stealth/space-bunny-alpha`) gerçekten çalışıyor (id soyulup gönderiliyor, katalog rozeti doğru);
  3. `plan` modunda tool çağrısı reddediliyor (gate), `auto`'da çalışıyor;
  4. upstream `unsupported_model` **simüle** edilirse probe geçici şema düşürüyor, transcript'te hata satırı var, sessiz metin-sız cevap yok.
- **Temizlik:** prob'un oluşturduğu oturum/dizinler silindi + **stays-gone** tekrar kontrolü.
- Kapılar: `bun x tsc --noEmit` 0, sterilize build, `pm2 restart lokma-web`, canlı bundle == disk hash, tokenless `/api/auth/me` 401.

## Dokunulacak yerler

- `packages/lokma-ai/src/provider/openai.ts` — `looksLikeToolPairingError` (`:438`), `buildBody`/temizlik (`:498-513`, `:718-755`), `http_error` yolu (`:561`)
- `packages/lokma-core/src/tools/parse.ts` — `COMPLETE_BLOCK` (`:65`) + gövdesiz-blok salvage + markup sızıntı temizliği
- `packages/lokma-web/server/src/agent-loop.ts` — tool hata satırının transcript'e yazılması
- `packages/lokma-web/server/src/routes/models.ts` — `unsupported_model` rozeti/kırpma (`:82-98` `mergeLiveIds` çevresi)

## Bitirme (done)

1. Kontroller PASS + kanıt (prob çıktısı + önce/sonra transcript satırı).
2. Atomik İngilizce commit(ler) + push (önce probe, sonra predicate, sonra parse salvage, sonra UI rozeti).
3. Dosya: `Status: done` + hash'ler; `git mv` → `finished/`; README index + `Docs/00` kronoloji.

## Notlar

- **Write-only:** kod yazılmadı; kullanıcı açık fiil söylemeden uygulanmaz.
- Ölçüm dosyaları bu turda `/tmp/probe_bunny_*.mjs` ile yapıldı; kalıcı prob bu REQ'in tesliminde `scripts/` altına yazılır.
- Not: `deepseek/deepseek-v4.1-flash` bu anahtarla kredisiz (400 insufficient credits) — bu REQ'in probu **space-bunny** üzerinden yazılmalı, başka modele düşmemeli.