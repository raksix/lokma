# Claude Code'u Başka Bir Harness'in İçinden Çalıştırma — Araştırma Notu

Kaynak repo: https://github.com/anthropics/claude-code (CLI + docs monorepo;
SDK'lar ayrı: `anthropics/claude-agent-sdk-typescript`, `anthropics/claude-agent-sdk-python`).
Resmi doküman: https://code.claude.com/docs (bu not `llms.txt` indeksindeki
`agent-sdk/*`, `headless`, `sessions`, `authentication`, `costs`, `cli-reference`
sayfalarından derlendi; npm'de TS SDK son sürüm **0.3.268**, gömülü
Claude Code **v2.1.268** — SDK sürümü gömülü CLI sürümünü takip eder).
Hedef: Lokma gibi kendi UI/queue/WS'i olan bir harness'in içinden Claude Code'u
sürülebilir bir "motor" olarak kullanmak (`agent-loop.ts` ↔ `query()`,
`session-runs.ts` kuyruğu ↔ SDK/CLI session, WS broadcast ↔ stream eventleri).

## 1. Claude Agent SDK (TypeScript + Python)

### 1.1. Kurulum ve `query()` örneği (TypeScript)

```bash
npm init -y && npm pkg set type=module
npm install @anthropic-ai/claude-agent-sdk
npm install --save-dev tsx   # TS'yi doğrudan çalıştırmak için
```

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// Agentic loop: Claude çalıştıkça mesajlar stream edilir
for await (const message of query({
  prompt: "utils.py'deki crash'e yol açan bug'ları bul ve düzelt.",
  options: {
    allowedTools: ["Read", "Edit", "Glob"], // bunlar onaysız çalışır
    permissionMode: "acceptEdits",           // dosya yazmayı otomatik onayla
    cwd: "/srv/projeler/musteri-a",          // agent'in çalışma dizini
    model: "sonnet",
    maxTurns: 15,
    maxBudgetUsd: 2.0,
  }
})) {
  if (message.type === "assistant" && message.message?.content) {
    for (const block of message.message.content) {
      if ("text" in block) console.log(block.text);       // akıl yürütme
      else if ("name" in block) console.log(`Tool: ${block.name}`);
    }
  } else if (message.type === "result") {
    console.log(`Bitti: ${message.subtype}, maliyet: $${message.total_cost_usd}`);
  }
}
```

Python karşılığı (`pip install claude-agent-sdk`, Python 3.10+ gerekir):

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions, AssistantMessage, ResultMessage

async def main():
    async for message in query(
        prompt="utils.py'deki crash'e yol açan bug'ları bul ve düzelt.",
        options=ClaudeAgentOptions(
            allowed_tools=["Read", "Edit", "Glob"],
            permission_mode="acceptEdits",
            cwd="/srv/projeler/musteri-a",
            model="sonnet",
            max_turns=15,
            max_budget_usd=2.0,
        ),
    ):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if hasattr(block, "text"): print(block.text)
                elif hasattr(block, "name"): print(f"Tool: {block.name}")
        elif isinstance(message, ResultMessage):
            print(f"Bitti: {message.subtype} maliyet: ${message.total_cost_usd or 0}")

asyncio.run(main())
```

Çok turlu (stateful) kullanım: TS'de `query()` zaten dahili bir client tutar;
Python'da `ClaudeSDKClient` (`async with ClaudeSDKClient() as client:` +
`await client.query(...)` + `client.receive_response()`) aynı işi yapar.
Tek seferlik `query()` her çağrıda yeni session açar; devam için `resume` /
`continue_conversation` gerekir (bkz. §2.4).

### 1.2. Stream event tipleri

`query()` bir `AsyncIterator<SDKMessage>` döndürür. `SDKMessage` union'ının
önemli üyeleri: `assistant`, `user`, `result`, `system` (subtype `init` ilk
event'tir: model, tool listesi, MCP durumu, `session_id` buradadır),
`stream_event` (sadece `includePartialMessages: true` ile), compact sınırı,
hook yaşam döngüsü eventleri, `permission_denied`, `api_retry`, subagent
bildirimleri. `result` mesajı finaldir: `subtype` (`success` |
`error_max_turns` | `error_during_execution` | `error_max_budget_usd` …),
`session_id`, `num_turns`, `usage`, `modelUsage`, `total_cost_usd`,
`permission_denials`, `terminal_reason`.

Canlı token akışı için (`--bare` benzeri hız + WS'e basmak için ideal):

```typescript
for await (const message of query({
  prompt: "Projeyi listele",
  options: { includePartialMessages: true, allowedTools: ["Bash", "Read"] }
})) {
  if (message.type === "stream_event") {           // ham Claude API event'i
    const e = message.event;
    if (e.type === "content_block_delta" && e.delta.type === "text_delta")
      process.stdout.write(e.delta.text);          // token parçası
    // tool input akışı: content_block_start(tool_use) → input_json_delta → stop
  }
}
```

Mesaj akış sırası: `message_start → content_block_start → content_block_delta*
→ AssistantMessage → content_block_stop → … → ResultMessage`. Parsiyel eventler
sadece ana session içindir (`parent_tool_use_id` null); subagent metni için
`forwardSubagentText: true` açılır, atıf için complete mesajlardaki
`parent_tool_use_id` kullanılır.

### 1.3. VS Code dışında kullanım (Lokma gibi headless host)

- VS Code eklentisi şart değil; SDK saf Node.js 18+ / Python 3.10+ kütüphanesidir.
- İkili (binary) sorunu yok: her iki SDK da platforma özel Claude Code binary'sini
  gömülü getirir. `npm ci --omit=optional` veya kaynaktan pip kurulumunda binary
  gelmezse ayrı `claude` kurup `pathToClaudeCodeExecutable` / `cli_path` verilir.
- İzolasyon: `settingSources: []` (TS) kullanıcı/proje ayarlarını, hook'ları,
  skill'leri, MCP'yi okumaz — paylaşımlı host'ta kiracılar arası sızıntıyı önler.
  `cwd` ile çalışma dizini, `env` ile ortam değişkenleri per-run verilir.
- Onay köprüsü: `canUseTool` callback'i, izin akışı "prompt" noktasına düşünce
  çağrılır — Lokma'daki `waitApproval`'ın birebir karşılığıdır. Her tool çağrısını
  kayıtsız şartsız kapıdan geçirmek için `PreToolUse` hook'u kullanılır.
- Uzun ömürlü process'te `Query` nesnesinin `interrupt()`, `setPermissionMode()`,
  `setModel()`, `close()` metotları WS `abort` / model değişimine bağlanır.

## 2. CLI Headless Kullanım (`claude -p`)

Başka dilden (Go, Rust, PHP…) sürmek için en basit yol: CLI'yi subprocess olarak
çalıştırmak. `-p`/`--print` etkileşimsiz moddur; çıkış kodu 0 başarı demektir.

### 2.1. Çıktı formatları

```bash
claude -p "auth modülü ne yapıyor?"                        # text (varsayılan)
claude -p "Projeyi özetle" --output-format json | jq -r '.result'
claude -p "Şiir yaz" --output-format stream-json --verbose --include-partial-messages \
  | jq -rj 'select(.type == "stream_event" and .event.delta.type? == "text_delta") | .event.delta.text'
```

- `json`: tek obje — `result`, `session_id`, `usage`, `total_cost_usd` + model
  bazında maliyet dökümü içerir; harcama takibi için faturaya değil buna bakılır
  (istemci-tahmini, bkz. §4).
- `stream-json`: satır başına bir JSON event (WS broadcast'e birebir uyar).
  Kısmi token'lar için `--verbose --include-partial-messages` şarttır.
- Şema zorlamak için: `--output-format json --json-schema '{"type":"object",…}'`
  → sonuç `structured_output` alanına düşer.
- `system/init` event'i session metadata'sını (model, tool'lar, MCP, plugin) verir;
  `plugin_errors` / `mcp_server_errors` doluysa CI kapısı fail etmelidir.
- stdin okunur (`cat build-error.txt | claude -p '…'`), üst sınır **10 MB**;
  stdout'a yavaş tüketici varsa CLI en fazla ~30 sn drenaj bekler.

### 2.2. İzin bayrakları

```bash
claude -p "Testleri çalıştır, hataları düzelt" --allowedTools "Bash,Read,Edit"
claude -p "Lint düzeltmelerini uygula" --permission-mode acceptEdits
claude -p "Sadece denetle" --permission-mode dontAsk --max-turns 5 --max-budget-usd 1
```

- `--allowedTools` izin-kuralı sözdizimi kullanır: `Bash(git diff *)` (sondaki
  boşluk+`*` prefix eşleşmedir; `Bash(git diff*)` `git diff-index`'i de tutardı).
- `--permission-mode`: `default | acceptEdits | plan | auto | dontAsk |
  bypassPermissions`. `-p`'de yerleşik başlangıç **Manual**'dir, istenen mod
  açıkça verilir. `dontAsk` kilitli CI için (izin verilmeyen reddedilir),
  `acceptEdits` dosya yazma + `mkdir/cp/mv`'yi otomatik onaylar.
- `--disallowedTools "Bash(rm *)"` her modda reddeder (`bypassPermissions` dahil).
- `--dangerously-skip-permissions` (= `bypassPermissions`) yalnızca tam BLOCKQUOTE
  güvenilir, izole ortamda; SDK'da karşılığı `allowDangerouslySkipPermissions: true`.
- Katılımsız koşularda `--permission-prompts none`: cevaplayacak host yoksa
  prompt'a düşen istek beklemeden reddedilir, Claude tekrar denemez.
- `--bare`: hook/skill/plugin/MCP/CLAUDE.md otomatik keşfini atlar → her makinede
  aynı sonuç + hızlı başlama. Gelecekte `-p` varsayılanı olacak; script/SDK için
  önerilen moddur. Bare modda OAuth/keychain okunmaz (auth için API key gerekir),
  tool seti Bash + dosya okuma/yazma ile sınırlıdır.

### 2.3. Session resume (`--resume` / `--continue`)

```bash
session_id=$(claude -p "İncelemeyi başlat" --output-format json | jq -r '.session_id')
claude -p "Devam et" --resume "$session_id"                 # dizinden bağımsız bulur
claude -p "Şimdi DB sorgularına odaklan" --continue         # en son konuşma
claude --resume <ad> / claude -n auth-refactor              # adlandırılmış session
claude -p --resume "$session_id" --fork-session             # dal aç, orijinali koru
```

- `-p`/SDK ile açılan session'lar seçiciye ve `--continue`'ya girmez; ancak
  ID ile resume edilir. `claude -p --continue` ise `-p`/SDK session'larını kapsar.
- Resume; konuşma geçmişi + model + agent + izin modunu geri yükler, fakat
  `--mcp-config`, `--settings`, `--add-dir` gibi launch bayrakları tekrar verilmelidir.
- Transkriptler: `~/.claude/projects/<proje>/<session-id>.jsonl` (30 gün saklanır).
  Doğrudan JSONL parse'lamak sürümler arası kırılgandır; script arayüzü olarak
  `claude -p --resume … --output-format json` veya SDK tercih edilir.
- Multi-tenant ipucu: `CLAUDE_CONFIG_DIR=/srv/kiraci-a` +
  `CLAUDE_CODE_PROJECT_DIR_NAME=work` ile her kiracının transkript/hafızası ayrı
  dizine yazılır (v2.1.234+).
- `--no-session-persistence`: diske yazmadan tek atımlık koşu. SIGTERM ile
  durdurulan `-p` koşusu 143 ile çıkar, `SessionEnd` hook'ları çalışır, resume'de
  yarım kalan turn'e devam edilir.

## 3. Kimlik / Auth Seçenekleri

| Yöntem | Ne zaman | Ortam değişkeni / komut |
|---|---|---|
| Abonelik (Pro/Max/Team/Enterprise) | Etkileşimli dev makinesi | `claude` → tarayıcı login (`/login`, `/logout`) |
| Uzun ömürlü token (abonelik, 1 yıl) | CI/script, tarayıcısız | `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN` |
| API key (Console) | **SDK + `--bare` + headless için önerilen** | `ANTHROPIC_API_KEY` (`X-Api-Key` başlığı) |
| Bearer gateway/proxy | Kurumsal LLM gateway | `ANTHROPIC_AUTH_TOKEN` (`Authorization:` başlığı) |
| Dinamik/rotatif kimlik | Vault, kısa ömürlü token | `apiKeyHelper` ayarı (+ `CLAUDE_CODE_API_KEY_HELPER_TTL_MS`) |
| Bulut sağlayıcı | Bedrock / Vertex / Foundry | `CLAUDE_CODE_USE_BEDROCK=1` / `_VERTEX` / `_FOUNDRY` + bulut kimliği |

- Öncelik sırası: bulut sağlayıcı → `ANTHROPIC_AUTH_TOKEN` → `ANTHROPIC_API_KEY`
  → `apiKeyHelper` → `CLAUDE_CODE_OAUTH_TOKEN` → profil/federasyon → abonelik OAuth.
  `ANTHROPIC_API_KEY` set iken abonelik görmezden gelinir (çakışmada `unset` edilir).
- Kritik kısıt: **üçüncü parti geliştiriciler, Anthropic onayı olmadan
  ürünlerinde claude.ai login'i veya abonelik kotası sunamaz** — Lokma
  entegrasyonu API key / gateway modeliyle kurulmalıdır.
- `--bare` OAuth/keychain okumaz: API key veya `apiKeyHelper` gerekir.
  `claude auth status --text` ile aktif kimlik doğrulanır.

## 4. Maliyet / Gecikme Karakteristikleri + Hafif Alternatifler

- Faturalama token üzerinden: kurumsal ortalamalar **~$13/geliştirici/aktif-gün**,
  **$150–250/ay**; kullanıcıların %90'ı $30/gün altındadır. Abonelikte `/usage`
  ile plan kotası, API'de Console usage sayfası takip edilir.
- `total_cost_usd` / `costUSD` **istemci-tahminidir** (fiyat tablosu build anına
  aittir) — son kullanıcıya fatura kesilmez, yaklaşık bütçe için kullanılır.
  `usage` yalnızca ana loop'u sayar; subagent dahil bütün-ağaç muhasebesi için
  `modelUsage`/`model_usage` okunur. Paralel tool çağrıları aynı mesaj ID'yi
  paylaşır → toplarken ID'ye göre dedupe edilir. Per-step `output_tokens`
  placeholder'dır; gerçek değer `result.usage`'tadır.
- Maliyet sürücüleri: uzun context (her istek tüm geçmişi taşır + prompt cache),
  Opus varsayılanı, hiç `/clear` yapılmayan session'lar, MCP tool şişkinliği,
  agent-team (7 kata kadar token). Azaltma: `/clear`+`/compact`, işe göre model
  (`haiku` alt görevlere), skill'e taşıma, hook ile ön-filtreleme,
  `--max-budget-usd` tavanı, cache TTL (`ENABLE_PROMPT_CACHING_1H`, 5 dk→1 sa).
- Gecikme: ilk token süresi `result.ttft_ms` (stream açılışı `ttft_stream_ms`);
  ana maliyetler model kuyruğu + büyük context + subprocess başlatma. Hızlandırma:
  `--bare`, `startup()` ile ısıtma, kısa context, `sonnet/haiku`, artımlı stream'i
  WS'e basıp algılanan gecikmeyi düşürme.
- Hafif alternatifler (iki uç): (a) **doğrudan Anthropic API + Client SDK** —
  tool loop'u kendin yazarsın (Lokma'nın mevcut `<tool>` loop'u zaten bu), en
  düşük ek yük; (b) **tek-atımlık `claude -p --bare --max-turns N`** — SDK
  bağımlılığı yok, her dilde subprocess. Arada: dar `allowedTools` + `dontAsk` +
  `haiku` ile ucuz ön-tarama, pahalı derin işi `sonnet`'e paslama.

## 5. Lokma'ya Bağlantı (REQ taslağına girdi)

- `AgentLoopOpts.waitApproval` → SDK `canUseTool`; `send()` → `stream_event` +
  `assistant`/`result` mesajlarının WS frame'lerine çevrilmesi; `signal` →
  `abortController`/`interrupt()`.
- `session-runs.ts` kuyruğu korunur: SDK/CLI session ID, Lokma `sessionId`'ye
  eşlenir; transcript JSONL kaynak kalır, Claude transkripti
  `CLAUDE_CONFIG_DIR` ile kiracı başına ayrılır.
- Varsayılan profil: `permissionMode: "dontAsk"` +最小 `allowedTools`,
  `maxTurns`≈15 (mevcut `LOOP_DEFAULT_MAX_TURNS` ile aynı), `maxBudgetUsd` tavanı,
  `settingSources: []` + `--bare` ile deterministik koşu; maliyet
  `total_cost_usd`'dan run kaydına işlenir.
