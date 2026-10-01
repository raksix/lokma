# REQ-183 — space-bunny-alpha tool çağrısı yapamıyor (gerçek `tools[]` düşüyor + gövdesiz `<tool>` sızıyor)

**Status:** in-progress (tur 4/5 — canlı prob yeşil; tur 1-4: `82a64b7` `6e87a27` `509e192` `a0673aa`)
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

## İlerleme (tur 1/5 — 1 Ekim 2026)

**Ölçüm düzeltmesi (önemli):** REQ yazılırken `/tmp/probe_predicate.mjs` içindeki fonksiyon kaynaktan import edilmiş **gerçek** fonksiyon değil, elle yazılmış bir **kopyaydı** (kopya `invalid_request_error` ve `function` kelimelerini arıyordu). Gerçek `looksLikeToolPairingError` kaynaktan import edilip aynı gövdeyle koşturuldu: `false` — yani "unsupported_model yanlış eşleşiyor" iddiası gerçek kodda **doğrulanmadı** (`unsupported_model` gövdesi → her iki probe da `false`; fonksiyon 5832d85'ten beri aynı şekilde, git geçmişi kanıtlı).

**Gerçek arıza bu turda yeniden üretildi** (gerçek adapter + gerçek 47 tool'luk registry + `reasoningEffort=max` + `stream:true`; oturum `sess_mupsivmh_4tvi` şekli):

- V2: model yalnız metin yazdı: `I'll take a look at the workspace structure.<br>` + `<tool name="list_files">` — **native çağrı YOK**, çağrı çalışmadı (kullanıcının gördüğü ekranın birebir şekli).
- V3: native `list_files` çağrısı geldi AMA metinde `<tool name="memory_read">` artığı da sızdı.
- Yani model **aralıklı olarak** parçalı markup yazıyor; block filter kapanışsız-gövdesiz artığı fail-open ile **metne** çeviriyor → çağrı kayboluyor.
- Session kanıtı: `usage.jsonl` iki turda da `outputTokens:6` (yalnız çıplak tag), transcript'te `role:'tool'` satırı yok; oturum 2'de "çalışan" tool çağrıları aslında `deepseek-v4.1-flash` koşularıydı (meta'da space-bunny yazsa da — koşu modeli değil).

**Landed (tur 1 — `82a64b7`):** capability probe sıkılaştırma — `snippetErrorCode()` (regex'siz `code` okuyucu) + `NON_TOOL_ERROR_CODES`; `unsupported_model` / `model_not_found` / `invalid_api_key` gövdeleri hiçbir probe'a takılmaz; pairing reddi artık tools probe'una düşmez (yanlış kalıcı `nativeToolsRejected` işareti kapandı). Testler: 4 negatif + 1 pozitif matris + stub akış testi (model reddi TEK istek + `http_error`; retry/şema düşürme yok). **159/159 PASS**, root `tsc` 0.

**Landed (tur 2 — `6e87a27`):** `parse.ts` — kapanışsız/gövdesiz trailing `<tool name="x">` artık `input:{}` ile GERÇEK çağrıya dönüşür (stream mark'ıyla; yarım gövde ve `>`-siz dev blok yine metin kalır — mevcut fail-open guard'ı korunur); `finish({haveNativeCalls:true})` native çağrı zaten turu taşımışsa aynı artığı DÜŞÜRÜR (hayalet çağrı yok). 14 yeni assert; parse probe 104/104 PASS; root tsc 0; concept build yeşil.

**Landed (tur 3 — `509e192`):** loop/tui wiring — `agent-loop.ts:635` artık `attemptFilter.finish({ haveNativeCalls: nativeCalls.length > 0 })`, `cli/tui.ts:333` artık `filter.finish({ haveNativeCalls: nativeCalls.length > 0 })`. Native çağrı turu taşıdıysa trailing gövdesiz `<tool>` artığı düşer (hayalet çağrı yok); çağrı yoksa parse salvage'ı onu gerçek çağrıya çevirir. Kanıt: root tsc 0, parse probe 104/104, agent-loop probe 31/31, core+server dist yeniden derlendi (dist grep: `haveNativeCalls` server `agent-loop.js:482`), `pm2 restart lokma-server` → uptime 9s, `/health` + `/api/health` 200, `lokma-web` :3457 200.

**Landed (tur 4 — `a0673aa`):** canlı prob `scripts/probe-space-bunny-tools.cjs` — kullanıcının ekranındaki id (`commandcode/stealth/space-bunny-alpha`) + `thinking max`, gerçek sunucu (127.0.0.1:3456). Üç bölüm yeşil:

- **A — 3 ardışık koşu: 29/29 PASS** (`/tmp/probe183-a.log`). Her koşuda native `tool_start` + eşleşen ok `tool_result` + transcript'te gerçek `role:'tool'` satırı (sırayla `list_files`, `read_file`, `read_file`); 2. ve 3. koşuda GERÇEK dosya içeriği (BANANA-42 / PINEAPPLE-99) transcript'e ulaştı; görünür akışta ve TÜM transcript'te SIFIR `<tool`; oturum + proje dizini + temp dizin **stays-gone**.
- **B — plan modu reddi: 9/9 PASS** (`/tmp/probe183-b2.log`). İzole temp-cwd `.lokma/settings.json` (`defaultMode: plan`) → write denemesi `Denied by permissions: write_file` sonucu, dosya diskte YOK, transcript'te denial satırı. (İlk B koşusunun turn-2 çağrısı aşağıdaki asılma olayına takıldı; reddi kaydı zaten diskteydi; sonraki koşu tamamen geçti.)
- **C — auto modu onay akışı: 10/10 PASS** (`/tmp/probe183-c.log`). `permission_request` (write_file) → prob `allow` → çağrı koştu → dosya diskte + içerik birebir + transcript `ok:true`.
- Prob sertleştirmeleri: `--section=a|b|c` seçici; `api()`'de 20 sn fetch timeout (kilitli sunucu cleanup'ı asmasın); run başına 150 sn settle timeout; token runtime'da mint edilir, asla loglanmaz.

**Olay notu (bu REQ'in kapsamı dışında — ayrı araştırma gerekir):** tur 4 sırasında iki anomali görüldü: (1) 23:00:39'da `lokma-server` (bun 1.2.3) B koşusu başlarken TÜMÜYLE kilitlendi — 68% CPU spin, 9+ dakika health yanıtsız, log durdu; `pm2 restart lokma-server` ile döndü. (2) Aynı dönemde iki CommandCode streaming çağrısı harness içinde sessizce asıldı (turn-1 hiç yanıtlanmadı; turn-2 >2.5 dk) — aynı ANDA curl 9/9 ve taze bun süreci 6/6 sorunsuzken. Upstream temiz; asılma sınıfı harness/bun liveness tarafında; takip edilmeli.

**Kalan turlar:** (5) katalog rozeti (`models.ts` — `unsupported_model` dönen viewId işaretlenir) + close-out.

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