# REQ-116 — Claude-Code-tarzı motor: native tool_use döngüsü + headless çalıştırma

- **Status:** in-progress (FAZ A shipped 2026-09-11 — stop_reason discipline + max_turns transcript marker; FAZ B-engine shipped 2026-09-11 — `server/src/engines/claude-print.ts` translator + spawn path, 29-assert probe green; FAZ B-wiring shipped 2026-09-11 — `claude-code/*` dispatch in ws.ts pump + runClaudeEngineTurn persist/account, 41-assert probe green; FAZ C-bridge shipped 2026-09-11 — `resolveClaudePermissions` config-driven allow/deny (deny-wins, Bash(rm *) inviolable), 52-assert probe green; FAZ D-continuity shipped 2026-09-11 — meta claudeSessionId persist+resume, store probe +4; FAZ D-compact-window shipped 2026-09-11 — pre-turn auto-compact (hygiene/full) + [compact] marker + LOKMA_DISABLE_AUTO_COMPACT kill-switch, warn-only; FAZ C-ask-gate shipped 2026-09-11 — pre-spawn permission cards for ask-fated mutation surface via decideToolCall + shared gate path, 59-assert probe green; FAZ D-clear shipped 2026-09-11 — harness-side `/clear` drops the resume handle (fresh next run, no spawn, [cleared] marker + done), 66-assert probe green)
- **Asked:** "Harness boktan çalışıyor, Claude'un harness'i nasıl çalışıyor incele,
  entegrasyon için req yaz, sonra loopla yap."
- **Kaynaklar:** `Docs/claude-code-harness-arastirma.md` (263 satır, SDK/CLI/auth/maliyet),
  task-0 loop-mimarisi notu, task-1 tool/MCP/permission notu (transcriptler:
  `/root/.hermes/cache/delegation/live/deleg_b11ad76b/task-{0,1,2}.log`).

## 1) Bugünkü Lokma döngüsü (mevcut durum)

`packages/lokma-web/server/src/agent-loop.ts`: model metin üretir, `<tool>`
text-blokları `packages/lokma-core/src/tools/parse.ts` (`createBlockFilter`)
ile ayrıştırılır, `executeToolCall` çalıştırır, sonuç `<tool_result>` olarak
geri verilir, WS `broadcast` ile `text_delta/thinking_delta/tool_start/
tool_result/done` kareleri yayınlanır. REQ-115'te sloppy-modeller için
salvage eklendi (`</tool_result>` closer, XML argüman, `<tool_call>` şekli,
sahte-sonuç filtresi). Zayıf nokta: her şey modelin **metin disiplinine**
bağlı — native function-calling yok.

## 2) Claude Code döngüsü (araştırma özeti)

```
1. user mesajı + tools şeması -> POST /v1/messages
2. assistant: content[] = text* + tool_use*; stop_reason kontrol et
3. stop_reason == "tool_use" -> assistant turn'ü VERBATIM ekle, her tool_use'u
   çalıştır, TEK user turn'ünde tool_result[] (aynı tool_use_id) ekle, başa dön
4. stop_reason == "end_turn"  -> bitir
5. stop_reason == "pause_turn" -> aynen tekrar gönder (tool_result ÜRETME)
6. stop_reason == "max_tokens" + yarım tool_use -> limiti büyüt, tekrar dene
```

- `max_turns` SADECE tool-use turn'lerini sayar. Limit aşımı `ResultMessage`
  subtype'ı: `error_max_turns` / `error_max_budget_usd` (bu varyantlarda
  `result` YOKTUR — önce subtype kontrol edilir).
- Native bloklar (ham API):
```json
{"role":"assistant","content":[
  {"type":"text","text":"Bakıyorum"},
  {"type":"tool_use","id":"toolu_01","name":"Read","input":{"file_path":"/repo/src/auth.ts"}}]}
{"role":"user","content":[
  {"type":"tool_result","tool_use_id":"toolu_01","content":"...dosya içeriği..."}]}
```
- İzin önceliği: `deny > defer > ask > allow`; `PreToolUse` kancası
  `bypassPermissions`'ı bile ezer; `allow` deny'i delemez.
- Compaction: limit yaklaşınca otomatik özet (`/compact`, `/clear`, `/context`);
  pencere `autoCompactWindow` (100K–1M), kapatma `DISABLE_AUTO_COMPACT=1`.
- Headless: `claude -p "iş" --output-format stream-json --verbose
  --permission-mode dontAsk --allowedTools "Read,Glob,Grep,Bash"
  --max-turns 15 --max-budget-usd 2` → NDJSON eventler
  (`system/init`, `assistant`, `stream_event`, `result`); exit `0` başarı.
- Auth: SDK/headless için `ANTHROPIC_API_KEY` (claude.ai login'i üçüncü
  parti üründe YASAK — API key/gateway şart).
- Maliyet: `total_cost_usd` istemci-tahmini; subagent dahil muhasebe için
  `modelUsage` okunur.

## 3) Entegrasyon planı (fazlı)

### FAZ A — Lokma loop'unu stop_reason disiplinine çek (kod değişikliği yok, protokol)
`agent-loop.ts` turn sonu kararını Claude gibi ver:
```ts
// pseudo — mevcut finish()/runEnd yapısına uyarlanır
if (runEnd.toolCalls.length > 0) continue;        // tool_use -> devam
if (runEnd.asks.length > 0) await waitAnswer();   // ask -> bekle, devam
if (!clean.trim()) retryAsEmpty();                // boş turn -> empty-retry (REQ-071 var)
else break;                                       // end_turn -> bitir
```
Kabul: `<tool>` metni artık ham sohbete SIZMAZ (filter garantisi +
`stripModelBlocks`), yarım blok + `max_tokens` benzeri kesilme büyütülmüş
bütçeyle tekrar denenir, `maxTurns`/`maxBudget` aşımı transcript'e
`[run stopped: max_turns=N]` / `[run stopped: max_budget_usd=M]` yazar.

### FAZ B — Headless `claude -p` motoru (sıfır npm bağımlılığı)
Yeni `server/src/engines/claude-print.ts`: subprocess ile koşu, NDJSON →
mevcut WS karelerine çeviri:
```ts
import { spawn } from 'node:child_process';
export function runClaudePrint(opts: {
  prompt: string; cwd: string; model: string;
  allowedTools: string[]; maxTurns: number; maxBudgetUsd: number;
  sessionId: string; signal: AbortSignal;
  send: (frame: ServerFrame) => void;
}): Promise<{ result: string; costUsd: number; numTurns: number }> {
  const child = spawn('claude', [
    '-p', opts.prompt,
    '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--permission-mode', 'dontAsk',
    '--allowedTools', opts.allowedTools.join(','),
    '--max-turns', String(opts.maxTurns),
    '--max-budget-usd', String(opts.maxBudgetUsd),
  ], { cwd: opts.cwd, env: { ...process.env } /* ANTHROPIC_API_KEY host'tan */ });
  opts.signal.addEventListener('abort', () => child.kill('SIGTERM')); // 143 sözleşmesi
  // NDJSON satırları:
  // system/init -> session notu (log only)
  // stream_event[text_delta] -> send({ type:'text_delta', delta })
  // assistant[tool_use]     -> send({ type:'tool_start', tool, input, callId })
  // user[tool_result]       -> send({ type:'tool_result', callId, result })
  // result                  -> { subtype, total_cost_usd, num_turns, session_id }
}
```
`session-runs.ts` kuyruğu korunur: Claude `session_id` ↔ Lokma `sessionId`
eşlemesi run kaydına yazılır; `--resume <id>` ile devam. Env:
`ANTHROPIC_API_KEY` (asla repoya/log'a yazılmaz), `CLAUDE_CONFIG_DIR`
ile kiracı başına transkript izolasyonu. `claude` binary yoksa honest
`[run failed: claude binary not found]` (mock YOK).

### FAZ C — İzin köprüsü
`waitApproval` → `canUseTool` karşılığı: `permissionMode: dontAsk` +
minimal `allowedTools` varsayılan; `ask` listesi Lokma permission kartına
düşer (`PermissionRequest` → WS `permission_request`, cevap
`permission_response`). `--disallowedTools "Bash(rm *)"` her modda red.

### FAZ D — Compaction kavramı
Transcript'e özet-satırı + `/compact` (odaklı), `/clear`, kategori dökümü;
pencere ayarı + kapatma env'i; skill/kural yeniden-enjeksiyon kotası.

## 4) Kabul kriterleri
- [ ] FAZ A: 6 tool'lu senaryoda ham `<tool>` metni sohbette görünmez; E2E kanıt.
- [ ] FAZ B: `Docs/35-BOTS` üzerinden `claude -p` koşusu uçtan uca (send →
  canlı kareler → transcript → cost kaydı); binary yokken honest hata.
- [ ] FAZ C: `ask` kuralı permission kartını açar, cevap akışı çalışır.
- [ ] FAZ D: uzun koşuda compact tetiklenir, transcript tutarlı kalır.
- [ ] Hepsinde: `tsc` 0, build green, atomik EN commit + push, canlı doğrulama.

## 5) Bilinçli kapsam-dışı
Agent SDK npm bağımlılığı (FAZ B subprocess yeterli olana dek yok),
MCP istemcisi (Lokma tool registry yeterli), `dangerously-skip-permissions`.
