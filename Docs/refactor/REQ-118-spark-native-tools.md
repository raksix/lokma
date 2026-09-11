# REQ-118 — Spark'a native tool calling (Responses `function_call` yolu)

- **Status:** open (araştırma tamam — 2026-09-11, 2 paralel kol)
- **Asked:** "muse-spark tam performansta çalışmıyor (thinking/tool).
  hermes-agent ile anomalyco/opencode'a bak, nasıl çözmüşler."
- **Kaynaklar:** task-0 hermes-agent notu + task-1 opencode notu (transcriptler:
  `/root/.hermes/cache/delegation/live/deleg_87fdfcda/task-0.log`,
  `/root/.hermes/cache/delegation/live/deleg_4d1a6fdc/task-1.log`).

## 1) Teşhis (canlı kanıtlı)

Lokma spark'ı `opencode-go` üzerinden `{base}/responses` + `input[]` ile
çağırır (REQ-039, `packages/lokma-ai/src/provider/openai.ts`:
`usesResponsesApi` + `toResponsesInput` + `x-opencode-session` header) —
ama gövdede **`tools` YOK**. Sonuç: model native dispatch yapamaz, `<tool>`
metnine düşer (sloppy varyantlar: `</tool_result>` closer, XML argüman,
`<tool_call>` + hayal-sonuç — REQ-115 hepsini yamadı ama kök neden duruyor).
Thinking akıyor (`response.reasoning_summary_text.delta` → `thinking_delta`,
`responsesThinkingText` → completed özetleri). Yani eksik TEK şey: native
`tools` göndermek + `function_call` çıktısını yakalamak.

Araştırma birleşimi:
- hermes-agent: spark = `api_mode=codex_responses`, `https://api.meta.ai/v1`,
  top-level `reasoning_effort ∈ {minimal,low,medium,high,xhigh}` (`none`
  YASAK → `minimal`), tool calling **native** `function_call` (text-parse
  sadece arıza-kurtarma).
- anomalyco/opencode (= taşınmış upstream, fork değil): Go hattında spark
  **yalnızca** `https://opencode.ai/zen/go/v1/responses` altında listelenir
  (`@ai-sdk/openai`); `/chat/completions` + `messages` = HTTP 500 (issue
  #44627, DevonGithub: responses 200 / chat 500). Tool'lar native taşınır,
  sonuçlar `input[]` içinde `{"type":"function_call_output","call_id":
  "...","output":"..."}` döner. Gateway her isteğe `reasoning:
  {effort:"medium"}` basar (istemci göndermese de). Bölge kilidi:
  AF,BY,CN,CU,EH,ER,ET,HK,HT,IQ,IR,KH,KP,LY,MM,MO,NI,PK,RU,SO,SY,VE →
  403 `RegionError`; contributor'da eğitim izni kapalıysa 403
  `DataPolicyError` (bölgeyle karıştırma). Diğer tüm hatalar 500 maskeli.
- Exact format (Go + spark):
```bash
curl -sS --max-time 90 https://opencode.ai/zen/go/v1/responses \
  -H "Authorization: Bearer $OPENCODE_GO_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"muse-spark-1.3-contributor",
       "input":[{"role":"user","content":"Reply with exactly: OK"}],
       "stream":false}'
```
`model` kısa id, gövde **`input` dizisi** (`messages` DEĞİL), auth
`Authorization: Bearer`. Chat-şeması `reasoning_effort` alanını `/responses`
gövdesine KOYMA (istemci-SDK katmanına ait); Responses şemasında istenirse
`reasoning: {"effort": "low|medium|high"}`.

## 2) FAZ A — Native tools, loop'a dokunmadan (önerilen ilk adım)

`packages/lokma-ai/src/provider/openai.ts` + `types.ts` + `stream.ts`:
```ts
// types.ts — AdapterStreamOpts + StreamOpts'a ekle:
tools?: { name: string; description: string; parameters: unknown }[];
// openai.ts — responses gövdesine ekle (sadece viaResponses iken):
...(viaResponses && opts.tools?.length ? {
  tools: opts.tools.map((t) => ({
    type: 'function', name: t.name,
    description: t.description ?? '',
    parameters: t.parameters ?? { type: 'object', properties: {} },
  })),
  tool_choice: 'auto',
} : {}),
// stream parser: function_call öğelerini biriktir
// (response.output_item.added + response.function_call_arguments.delta,
//  tamamlanan: output[] içinde type === 'function_call' ->
//  {call_id/callId, name, arguments}) ve turun sonunda MAKİNE-ÜRETİMİ
// kesin blok olarak yay:
//   text_delta: `<tool name="read_file">{"path":"a.ts"}</tool>`
// Mevcut filter → execute → tool_start/tool_result → follow-up zinciri
// aynen çalışır (REQ-074/111/115 kanıtlı). JSON her zaman geçerli
// üretildiği için slop riski YOK.
```
`agent-loop.ts` tarafı: `aiStream(...)` çağrısına registry'den tool şeması
ver (`buildBuiltinTools()` ad + description + zod→JSON-schema; strict
GÖNDERME — gateway toleranssız olabilir). Tool SONUÇLARI bu fazda mevcut
`<tool_result>` metin yoluyla döner (değişiklik yok).

## 3) FAZ B — Uçtan-uca native (temizlik)

- `StreamChunk`'a `{ type:'native_tool_call', tool, input, callId }` ekle;
  agent-loop bunları `runEnd.toolCalls` ile birleştirsin (sentetik metin kalkar).
- Tool sonuçlarını responses-native döndür: sonraki turun `input[]` içine
  `{"type":"function_call_output","call_id","output"}` (mevcut text
  `<tool_result>` yerine — responses modeli için).
- İstenirse `reasoning: {"effort":"medium","summary":"auto"}` gönder
  (gateway zaten basıyor; omit = aynı davranış).

## 4) Kabul kriterleri
- [ ] FAZ A: spark'lı koşuda `POST {base}/responses` gövdesinde `tools[]`
  var (mock-transport probe ile kanıt); model `<tool>` metni yazmadan
  tool çalıştırır (canlı E2E: tool satırı + `tool` rolü + doğru cevap).
- [ ] Thinking akışı korunur (thinking_delta + completed özeti).
- [ ] 500/403 ayrımı honest: 403 → bölge/eğitim-izni mesajı, 429 →
  retry-after'a saygı (mevcut backoff), diğer 500 → honest hata.
- [ ] `bun run build` + `tsc` 0 (core/ai/server/web), parse probe 56 yeşil,
  atomik EN commit + push, canlı doğrulama.
- [ ] Kapsam-dışı: Agent SDK bağımlılığı, MCP istemcisi,
  `dangerously-skip-permissions`, `prompt_cache_key` optimizasyonu.

## 5) Dosya haritası
`packages/lokma-ai/src/provider/types.ts` (opts+chunk),
`packages/lokma-ai/src/provider/openai.ts` (gövde+parser),
`packages/lokma-ai/src/stream.ts` (passthrough),
`packages/lokma-ai/src/provider/adapters.test.ts` (mock probe),
`packages/lokma-web/server/src/agent-loop.ts` (şema besleme; FAZ B'de merge).
