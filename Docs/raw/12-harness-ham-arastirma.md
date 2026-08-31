# Coding Agent Harness Mimarisi — Teknik Döküman

> **Proje:** Lokma — Claude Code birebir klonu (CLI + Web Harness + Desktop App)
> **Tarih:** 2026-08-31
> **Kaynaklar:** Anthropic Claude Code docs, Vercel AI SDK Harness, OpenHands, Aider, Continue.dev, Ink/React, SSE/WebSocket streaming literatürü
> **Satır hedefi:** 250+ | Gerçek: ~450 satır

---

## İçindekiler

1. [Harness Nedir](#1-harness-nedir)
2. [CLI Harness Mimarisi](#2-cli-harness-mimarisi)
3. [Web Harness Mimarisi](#3-web-harness-mimarisi)
4. [Agent Loop Detayları](#4-agent-loop-detayları)
5. [Sandbox / Güvenlik](#5-sandbox--güvenlik)
6. [Session Yönetimi](#6-session-yönetimi)
7. [Streaming ve Real-Time UI](#7-streaming-ve-real-time-ui)
8. [Açık Kaynak Harness Örnekleri](#8-açık-kaynak-harness-örnekleri)
9. [Lokma için Önerilen Mimari](#9-lokma-için-önerilen-mimari)
10. [Kaynakça](#10-kaynakça)

---

## 1) Harness Nedir

### 1.1 Tanım

Bir **harness**, LLM'i otonom bir ajana dönüştüren altyapı katmanıdır. Model yalnızca metin üretir; harness o metnin dosya sistemine, shell'e, git'e, browser'a dokunmasını sağlar. Anthropic'in tanımıyla: *"Claude Code, Claude modelini yetenekli bir kodlama ajanına dönüştüren araçları, bağlam yönetimini ve yürütme ortamını sağlar — model akıl yürütür, harness hareket eder."* [code.claude.com/docs/en/how-claude-code-works]

Kabaca ayrım:

```
Model  → Akıl yürütür (reasoning, planning)
Agent Loop → Karar verir ve eylem seçer (tool calling)
Harness → Operasyonu kontrollü, gözlemlenebilir ve güvenli tutar (permission, sandbox, session, streaming)
```

Güçlü bir model zayıf bir harness içinde başarısız olur: yanlış tool çağrısı, state kaybı, veri sızıntısı, sonsuz döngü, onaysız aksiyon. Zayıf bir model güçlü bir harness içinde faydalı iş çıkarabilir. [dev.to/mike_anderson — Agent Loop and Harness]

### 1.2 Harness'in 9 Temel Bileşeni

MindStudio'nun sınıflandırmasına göre modern bir harness'in bileşenleri:

| # | Bileşen | Görev |
|---|---------|-------|
| 1 | **Model Interface** | LLM provider soyutlaması (OpenAI/Anthropic/Ollama) |
| 2 | **Tool Registry** | Tool şemaları, kayıt, keşif, dispatch |
| 3 | **Execution Engine** | Tool'ları güvenli ortamda çalıştırma |
| 4 | **Memory System** | Context window, episodic/semantic memory, compaction |
| 5 | **Feedback Loop** | stdout/stderr/return code → modele geri besleme |
| 6 | **Safety Layer** | Permission gate, allow/ask/deny, sandbox |
| 7 | **Session Manager** | Persist, resume, fork, checkpoint |
| 8 | **Streaming Layer** | Token & event streaming (SSE/WS), backpressure |
| 9 | **Orchestration** | Multi-agent, sub-agent spawn, paralel yürütme |

Harness; *computation* (gereksiz model çağrısını kesme), *development* (kod/test/dokümana güvenli erişim), *security* (yetki doğrulama), *DevOps* (CI/CD entegrasyonu) boyutlarında mühendislik gerektirir.

### 1.3 Tool Calling — Eylem Köprüsü

Modern tool calling JSON-şemalı fonksiyon çağrılarıdır. Model şunu üretir:

```json
{"tool": "read_file", "arguments": {"path": "/src/app.ts"}}
```

Harness bunu yakalar, permission check uygular, sandbox içinde çalıştırır, çıktıyı `tool_result` olarak modele geri verir. Tool tanımı (name, description, JSON Schema) prompt'a enjekte edilir; kalitesi doğrudan modelin doğru tool seçmesini etkiler. Yetersiz açıklama → yanlış tool, iyi açıklama → deterministik başarı.

### 1.4 Streaming

Token-level streaming, tool-call streaming (partial JSON delta), reasoning streaming ve lifecycle event'leri (run_started/finished) olmak üzere katmanlıdır. Detay §7'de.

---

## 2) CLI Harness Mimarisi

### 2.1 Genel Katmanlar

```
┌─────────────────────────────────────────┐
│  Terminal (PTY)                         │
│  ┌─────────────────────────────────┐    │
│  │  Ink / React Renderer (Yoga)    │    │
│  │  <Box> <Text> <Spinner> ...     │    │
│  └──────────────┬──────────────────┘    │
│  ┌──────────────▼──────────────────┐    │
│  │  App State (useReducer/Zustand) │    │
│  │  session, messages, toolStates  │    │
│  └──────────────┬──────────────────┘    │
│  ┌──────────────▼──────────────────┐    │
│  │  Prompt Handling & Input        │    │
│  │  readline / ink-text-input      │    │
│  └──────────────┬──────────────────┘    │
│  ┌──────────────▼──────────────────┐    │
│  │  Agent Loop (async generator)   │    │
│  └──────────────┬──────────────────┘    │
│  ┌──────────────▼──────────────────┐    │
│  │  Tool Execution (bash, fs, git) │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### 2.2 Ink / React ile Terminal UI

**Ink** (vadimdemedes/ink, MIT), React renderer'ını terminale taşıyan kütüphanedir. Yoga (Flexbox) layout engine ile çalışır — `<Box flexDirection="column">`, `<Text color="green">` gibi CSS-benzeri prop'lar ANSI escape sequence'e dönüşür. Virtual DOM diffing her frame'de sadece değişen bölgeyi yeniden çizer (60 fps hedef). [Ink GitHub, martinuke0 — Revolutionizing CLI with Ink]

Claude Code, Gemini CLI, Qwen Code, LiteAgent gibi üretim harness'ları Ink kullanır. Avantajları:

- Deklaratif UI: state → render, imperative `process.stdout.write` yerine.
- Hooks & state: `useReducer` ile karmaşık akış (tool approval, streaming token, spinner) yönetimi.
- Ekosistem: `ink-text-input`, `ink-spinner`, `ink-big-text`, `ink-testing-library`.

Alternatifler: Blessed (imperative canvas), Inquirer.js (prompt-only), oclif (komut framework'ü). Ink, React bilen ekipler için en verimli seçimdir.

**Minimal Ink app:**

```tsx
import React from 'react';
import {render, Box, Text, useInput} from 'ink';
const App = () => {
  const [msgs, setMsgs] = React.useState<string[]>([]);
  useInput((input, key) => { if (key.return) setMsgs(m => [...m, input]); });
  return <Box flexDirection="column">{msgs.map(m => <Text key={m}>{m}</Text>)}</Box>;
};
render(<App/>);
```

### 2.3 Prompt Handling

CLI harness'te prompt üç kaynaktan gelir:

1. **Interaktif REPL** — `ink-text-input` veya `readline` ile satır editörü, history (↑/↓), autocomplete (`/help`, `/model`, `/clear` gibi slash-command'lar).
2. **Headless / `--prompt` modu** — `echo "fix bug" | lokma --prompt` veya `lokma --prompt "refactor X" --non-interactive` ile CI/pipeline kullanımı. Blackbox/Gemini CLI bu modu ` --prompt` flag'i ile sağlar.
3. **Stdin pipe** — `cat PRD.md | lokma` gibi dosya içeriklerinin prompt'a eklenmesi.

Prompt handling katmanı:

- **Preprocessing:** Prompt'u `CLAUDE.md` / `AGENT.md` proje yönergeleri, git status, file map ile zenginleştirme.
- **Injection:** System prompt + tool definitions + conversation history + yeni user message'i tek bir messages dizisine derleme.
- **Validation:** Prompt injection tespiti, token sayımı, context window kontrolü.

### 2.4 Tool Execution Loop (CLI)

```
while (!done && steps < maxSteps) {
  stream = await llm.streamChat(messages, tools)
  for await (delta of stream) render(delta)   // Ink streaming
  if (delta.tool_calls) {
    for (toolCall of delta.tool_calls) {
      permission = checkPermission(toolCall) // deny > ask > allow
      if (permission === 'ask') await promptUserApproval(toolCall)
      result = await executeInSandbox(toolCall)
      messages.push({role: 'tool', tool_call_id, content: result})
    }
  } else {
    done = true
  }
}
```

CLI'de `executeInSandbox` doğrudan `child_process.spawn('bash', ['-c', command])` veya `just-bash`/`@vercel/sandbox` üzerinden çalışır. Her tool çıktısı truncation ile sınırlandırılır (Claude Code: MCP tool output max 25k token, 10k'da uyarı).

### 2.5 LiteAgent Örneği — Async Generator Engine

LiteAgent (sqfcyily/LiteAgent, TS + Ink + Bun) minimal harness mimarisini gösterir:

- **Async Generator REPL** — `async function* agentLoop()` ağır soyutlama olmadan stream, tool call ve result concatenation'u yönetir.
- **Virtual DOM CLI** — Her token delta React state'i günceller, Ink diff'ler.
- **Dynamic Skill Injection** — System prompt'u temiz tutmak için skill'ler on-demand enjekte edilir.

Bu pattern Lokma CLI için referans alınabilir: `bun` runtime + `ink` + `async generator` üçlüsü ~500 LOC içinde çalışan harness verir.

---

## 3) Web Harness Mimarisi

### 3.1 Genel Mimari

```
 Browser                     Backend (Node/Python/Go)              Sandbox
┌──────────┐               ┌────────────────────┐               ┌────────────┐
│ React UI │◄── SSE/WS ──►│ API Server         │◄── REST/gRPC ─►│ Container  │
│ xterm.js │◄── WS ──────►│ Session Manager    │               │ /workspace │
│ File Tree│◄── REST ────►│ File Sync Service  │◄── volume ───►│ Bash/Tools │
│ Monaco   │               │ Auth & Permissions │               │ LSP Server │
└──────────┘               └────────────────────┘               └────────────┘
                                    │
                             ┌──────▼──────┐
                             │ Redis/KV    │  task_id → stream_id, event buffer
                             │ Postgres    │  session persist
                             └─────────────┘
```

### 3.2 Transport: SSE vs WebSocket

**SSE (Server-Sent Events)** LLM token streaming için endüstri standardıdır — OpenAI, Anthropic, Google hepsi SSE seçmiştir. Nedenleri [tianpan.co — Streaming Infrastructure, learnbackend — SSE vs WebSockets]:

| Özellik | SSE | WebSocket |
|---------|-----|-----------|
| Yön | Server → client (tek yön) | Çift yön |
| Protokol | Düz HTTP (`text/event-stream`) | HTTP Upgrade |
| Proxy/CDN | Şeffaf geçer | Özel konfigürasyon ister |
| Ölçekleme | Stateless, yatay ölçek kolay | Sticky session / socket broker gerekir |
| Reconnection | `Last-Event-ID` ile otomatik | Manuel |
| En iyi kullanım | Token streaming, progress event'leri | Ses, mid-stream steering, collaboratif edit |

**Önerilen hibrit:** SSE = data plane (token delivery), ayrı `POST /approve` veya WebSocket = control plane (cancellation, tool approval). Vercel AI SDK `useChat` + `streamText` bu pattern'i uygular.

**Kritik altyapı detayları:**

- **Proxy buffering kapalı:** `X-Accel-Buffering: no`, `proxy_buffering off` (nginx), Cloudflare buffering disable. Yoksa token'lar 20sn burst halinde gelir. Debug: `curl -N` ile hop-by-hop test.
- **Keepalive:** Uzun düşünme/tool execution sırasında idle TCP 60sn'de ölür. Her 15-20sn'de SSE comment (`: ping\n\n`) gönder.
- **Abort propagation:** Browser `EventSource.close()` → backend `AbortController.abort()` → upstream LLM `cancel()`. Tek bir halka kopsa orphaned generation faturaya yansır.
- **Backpressure:** `ws.bufferedAmount > 64KB` ise upstream generator'ı duraklat (WS için); SSE için Node `res.write()` return değeri ve `drain` eventi.

### 3.3 Sandbox Soyutlaması (Web)

Web harness'te agent kodu asla browser'da çalışmaz — backend'deki sandbox'ta çalışır. Soyutlama katmanı:

```ts
interface Sandbox {
  executeCommand(cmd: string, opts?: {cwd, env, timeout}): Promise<{stdout, stderr, exitCode}>;
  readFile(path: string): Promise<string>;
  writeFiles(files: {path:string, content:string}[]): Promise<void>;
  // Opsiyonel
  runWithApproval?(cmd: string): Promise<Result>; // human-in-the-loop
}
```

Vercel ekosisteminde üç implementasyon:

- **`just-bash`** — in-memory JS bash emülatörü, test ve lightweight local için.
- **`@vercel/sandbox`** — tam VM (Firecracker microVM) bulut sandbox.
- **Custom** — Docker/Kata/E2B wrapper (kendi `Sandbox` interface'ini implemente eder).

Lokma web harness'te `Sandbox` interface'i soyut tutulmalı; development'ta `just-bash`/Docker, production'da E2B/Daytona/microVM takılabilmeli.

### 3.4 File System

- **Workspace mount:** Sandbox içinde `/workspace` (veya `/home/user/workspace`) proje kökü. Host ↔ sandbox arasında file sync (OpenHands `workdir` sync, Vercel `destination` param).
- **File tree:** Backend `listFiles()` → frontend tree render (React). Poll veya FS watch + WS push ile canlı güncelleme.
- **Editor:** Monaco (VS Code editörü) veya CodeMirror. Dosya açma → `readFile` → editör, kaydetme → `writeFiles` → sandbox.
- **Diff view:** Agent edit sonrası `git diff` alıp frontend'de split-view göster (OpenHands, Aider ` /diff` gibi).

### 3.5 Terminal Emulator

Browser'da gerçek terminal için **xterm.js** (Microsoft, VS Code'un terminali) standardıdır. Mimari:

```
xterm.js (frontend) ◄── WebSocket (PTY) ──► node-pty / pty.js (backend) ◄──► Sandbox shell
```

- Frontend: `new Terminal()` + `FitAddon` + `WebLinksAddon`, `socket.on('data', d => term.write(d))`, `term.onData(d => socket.send(d))`.
- Backend: `pty.spawn('bash', [], {cwd: workspace, env})`, `pty.onData(data => ws.send(data))`, `ws.on('message', msg => pty.write(msg))`.
- Alternatif: `xterm-headless` veya `hterm`. Ağır olmayan için `concurrently` + SSE terminal output da yeterli (Claude Code web `claude.ai/code` terminali bu yaklaşımda).

### 3.6 API Tasarımı (Örnek)

```
POST   /api/sessions              → {sessionId, workspacePath}
GET    /api/sessions/:id          → session state
POST   /api/sessions/:id/prompt   → {messageId} (agent loop tetikle)
GET    /api/sessions/:id/stream   → SSE (text/event-stream) — token + tool event'leri
POST   /api/sessions/:id/approve  → {toolCallId, approved}  (human-in-the-loop)
POST   /api/sessions/:id/cancel   → abort running turn
GET    /api/sessions/:id/files?path=/src  → file listing
GET    /api/sessions/:id/file?path=/src/app.ts → content
WS     /api/sessions/:id/pty      → raw terminal
```

---

## 4) Agent Loop Detayları

### 4.1 System Prompt

System prompt harness'in en kritik dosyasıdır. Claude Code'un `CLAUDE.md` + yerleşik system prompt'u binlerce token tutar; tipik yapı:

```
1. Identity: "You are Lokma, an AI coding assistant..."
2. Capabilities: "You help with code, docs, builds, git..."
3. Workflow: "Read → Hypothesize → Edit → Verify → Repeat"
4. Tool usage rules: "Prefer Read over Bash cat; always run tests after edit"
5. Safety: "Never run rm -rf /, never exfiltrate secrets"
6. Project context: <CLAUDE.md contents> + git status + file map
7. Style: "Concise, Turkish when user speaks Turkish"
```

**Dinamik enjeksiyon:** Lokma'da system prompt statik değil — çalışma anında proje dosyaları (`AGENT.md`, `lokma.md`), git log, repository map eklenir. Vercel `extraInstructions` param ve `bash-tool` `Skill` mekanizması bu işi yapar.

### 4.2 Tool Definitions

Tool tanımı JSON Schema ile LLM'e sunulur:

```ts
{
  name: "bash",
  description: "Execute bash commands in the sandbox. Use for builds, tests, git ops. Never use for file reads — prefer read_file.",
  inputSchema: {
    type: "object",
    properties: {
      command: {type: "string", description: "Bash command to execute"},
      timeout: {type: "number", description: "Timeout in ms, default 120000"},
      description: {type: "string", description: "Human-readable purpose (for approval UI)"}
    },
    required: ["command"]
  }
}
```

**İyi tool description yazma kuralları** [Vercel — Descriptions that Work]:

- Fiil ile başla ("Execute...", "Read...", "Search...").
- Ne zaman KULLANILACAĞINI ve KULLANILMAYACAĞINI belirt.
- Örnek girdi/çıktı ekle.
- Yan etkiyi açıkla (read-only mi, destructive mi).

Claude Code'da ~19 permission-gated core tool vardır (analizlere göre MCP/subagent dahil 40'a yakın): `Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`, `TodoWrite`, `Task`, `WebFetch`, `NotebookEdit`, `Agent` (sub-agent spawn). Her biri bağımsız permission gate'ten geçer. Lokma'da başlangıç için 8-10 core tool yeterli: `read`, `write`, `edit`, `bash`, `grep`, `glob`, `todo`, `web_fetch`.

### 4.3 Iteration (Agent Loop)

Kanonical loop (Anthropic docs, Vercel Harness):

```ts
async function* agentLoop(messages: Message[], tools: Tool[], opts: {maxSteps = 25}) {
  for (let step = 0; step < opts.maxSteps; step++) {
    // 1. LLM call — streaming
    const stream = await llm.stream({messages, tools, model: 'claude-sonnet-4'});
    let fullContent = '';
    let toolCalls: ToolCall[] = [];
    for await (const chunk of stream) {
      if (chunk.type === 'text_delta') { fullContent += chunk.text; yield {type: 'text', text: chunk.text}; }
      if (chunk.type === 'tool_call_delta') accumulate(toolCalls, chunk);
    }
    messages.push({role: 'assistant', content: fullContent, tool_calls: toolCalls});
    if (toolCalls.length === 0) { yield {type: 'done'}; break; } // Model bitti dedi

    // 2. Tool execution (paralel, permission-gated)
    const results = await Promise.all(toolCalls.map(async tc => {
      const perm = await checkPermission(tc);
      if (perm === 'deny') return {tool_call_id: tc.id, is_error: true, content: 'Permission denied'};
      if (perm === 'ask') await waitForApproval(tc); // WS/SSE üzerinden UI'a sor
      try { return await executeTool(tc); }
      catch (e) { return {tool_call_id: tc.id, is_error: true, content: String(e)}; }
    }));
    for (const r of results) {
      messages.push({role: 'tool', tool_call_id: r.tool_call_id, content: r.content});
      yield {type: 'tool_result', result: r};
    }
    // 3. Compaction check → gerekirse history'yi özetle (§4.4)
    if (estimateTokens(messages) > opts.maxTokens * 0.8) {
      messages = await compact(messages);
    }
  }
}
```

**Vercel AI SDK kısayolu:**

```ts
import {ToolLoopAgent, isStepCount} from 'ai';
import {createBashTool} from 'bash-tool';
const {tools} = await createBashTool({sandbox});
const agent = new ToolLoopAgent({model: anthropic('claude-sonnet-4'), tools, stopWhen: isStepCount(25)});
const result = await agent.generate({prompt: 'Fix the failing tests'});
```

### 4.4 Compaction (Context Window Yönetimi)

Uzun görevlerde context window dolar. Üç strateji:

1. **Summarization / Compaction:** Eski mesajları LLM'e özetlet, orijinal yerine özet koy. Claude Code `session compaction` yapar; Anthropic araştırması full context reset + handoff artifact'in bazen daha iyi olduğunu gösteriyor.
2. **Sliding window:** En eski tool result'ları at (riskli — model bağlamı kaybeder).
3. **External memory / RAG:** Eski context'i vector DB'ye yaz, ihtiyaç olunca retrieve et.

**Compaction prompt örneği:** `"Summarize the conversation so far, preserving: files modified, test results, remaining TODOs, key decisions. Keep it under 2000 tokens."`

Lokma'da: token sayacı her iterasyonda çalışmalı; %80 dolulukta otomatik compaction tetiklenmeli. Kullanıcıya ` /compress` komutu da sunulabilir (Blackbox CLI pattern).

### 4.5 Error Handling & Loop Failure

Yaygın başarısızlık modları [dev.to — Agent Loop]:

- Aynı tool'u tekrar tekrar çağırma (loop detection → "try something different" enjekte et).
- Başarısız tool sonucunu görmezden gelme (harness `is_error: true` ile LLM'e geri bildirmeli, exception fırlatmamalı).
- Erken durma / geç durma (stop condition + `stopWhen` predicate).
- Bağlam kayması (compaction sonrası kaybolan dosya yolları → repo map'i tekrar enjekte et).

**Pattern:** Her tool error'u LLM'e `tool_result` olarak dön, abort etme — model kendi hatasını düzeltme şansı bulur. Sadece sandbox crash / LLM API error loop'u kırmalı.

---

## 5) Sandbox / Güvenlik

### 5.1 Neden Sandbox?

LLM-üretilmiş kodu host'ta doğrudan çalıştırmak: `rm -rf /`, secret exfiltration, fork bomb, ağ saldırısı riski taşır. Tüm üretim harness'ları sandbox kullanır. [OpenHands Runtime Architecture, tianpan.co — Agent Sandboxing]

### 5.2 İzolasyon Seviyeleri

| Seviye | Teknoloji | İzolasyon | Başlangıç | Kullanım |
|--------|-----------|-----------|-----------|----------|
| 1 | `child_process` + `seccomp` | Zayıf (kernel paylaşılır) | ~10 ms | Single-tenant, güvenilir kod |
| 2 | Docker container (`runc`) | Orta (namespace/cgroup) | ~500 ms | Dev, single-user |
| 3 | gVisor (`runsc`) | Güçlü (user-space kernel) | ~200 ms | Multi-tenant SaaS, Modal |
| 4 | Kata Containers | Çok güçlü (guest kernel, QEMU) | ~200 ms | Multi-tenant, K8s native |
| 5 | Firecracker microVM | En güçlü (5 cihaz, minimal) | <125 ms | AWS Lambda, E2B, Northflank |
| 6 | E2B / Daytona (managed) | Seviye 4-5 üzerine API | <200 ms | Hızlı entegrasyon |

**Karar matrisi** [tianpan.co, manveerc — Sandboxing Guide 2026]:

- İç araç, tek tenant, güvenilir dev → Docker + hardened seccomp.
- LLM-üretilmiş kod, tek tenant → gVisor veya `no-new-privileges`.
- Çok kiracılı (multi-tenant) LLM kod yürütme → Firecracker veya Kata.
- GPU gerekli → Firecracker hariç (PCIe passthrough yok), gVisor (2024/25'te GPU desteği eklendi).

### 5.3 Permission Model (Claude Code Referansı)

Claude Code 6 permission modu + `allow/ask/deny` kural pipeline'ı kullanır (deny her zaman kazanır). Üç kademeli mental model:

- **Tier 1 — Auto-approved:** Read-only (file read, grep, glob).
- **Tier 2 — Ask:** Edit, write, non-destructive bash.
- **Tier 3 — Deny / block:** `rm -rf`, secret file access, dış ağ (varsayılan deny).

Lokma'da `lokma.json` / `.lokma/permissions.json`:

```json
{
  "permissions": {
    "allow": ["Read(**)", "Grep(**)", "Bash(git status:*)", "Bash(npm test:*)"],
    "ask": ["Write(**)", "Edit(**)", "Bash(npm install:*)"],
    "deny": ["Bash(rm -rf:*)", "Read(.env)", "Bash(curl * | bash:*)"]
  },
  "mode": "default"
}
```

Her tool call `checkPermission(tool, rules)` → `allow | ask | deny`. `ask` durumunda CLI Ink confirmation prompt, web'de WS üzerinden frontend approval dialog gösterir.

### 5.4 Diğer Güvenlik Katmanları

- **Fallback olarak `just-bash` değil gerçek sandbox:** `just-bash` JS emülasyonudur, güvenlik sınırı değildir; production'da gerçek izolasyon gerekir.
- **Secret injection:** Secret'lar env var olarak değil, secret manager / file mount ile verilir (env var dump ile sızar).
- **Network egress allowlist:** Varsayılan `deny all`, sadece `api.anthropic.com`, `registry.npmjs.org` gibi allowlist.
- **Resource limits:** CPU/memory/timeout per tool call (bash default 120s, file read max 50KB).
- **Stop hooks / classifiers:** Şüpheli destructive command öncesi LLM classifier ile ikinci kontrol (Claude Code classifier).

### 5.5 OpenHands Runtime Detayı

OpenHands Docker Runtime, client-server mimarisi ile çalışır: backend `RuntimeClient` → REST API → container içindeki `ActionExecutor` (Bash, Browser, Jupyter, Plugin). Host port allocation file-lock ile stabilize edilir; VS Code portu token ile expose edilir. [docs.openhands.dev — Runtime Architecture]

---

## 6) Session Yönetimi

### 6.1 Claude Code Session Modeli

Claude Code her mesajı, tool kullanımını ve sonucu `~/.claude/projects/<project>/sessions/<id>.jsonl` içine plaintext JSONL olarak yazar. Avantajlar:

- **Rewind:** İstenen mesaja kadar geri sarma, dosya snapshot'larından restore.
- **Resume:** `claude --resume <id>` ile kaldığı yerden devam.
- **Fork:** Mevcut session'dan dallanma (branch).
- **Checkpoint:** Kod değişikliği öncesi etkilenen dosyaların snapshot'ı.

### 6.2 Lokma Session Modeli (Öneri)

```
~/.lokma/
  projects/
    <project-hash>/
      sessions/
        <sessionId>.jsonl      # Full conversation log (JSONL)
        <sessionId>.meta.json  # title, model, createdAt, tokenUsage
      checkpoints/
        <sessionId>/<step>/    # File snapshots before each edit
      workspaces/
        <sessionId>/           # Sandbox workspace (web harness'te de aynı)
```

**Web harness'te persist:** Aynı JSONL Postgres `sessions` tablosuna da yazılır; SSE üç katmanlı buffer mimarisi ile reconnect desteklenir:

- **Tier 1 (KV/Redis):** `task_id → {active_stream_id, status: pending|ongoing|complete}`
- **Tier 2 (Redis Streams):** `task_id:stream_id → [event chunks]` — sıralı, kalıcı, subscribe edilebilir.
- **Tier 3 (SSE relay):** `GET /stream?task_id=...&last_event_id=...` ile buffered replay + live tail.

Bu mimari ile kullanıcı sayfayı yenilese, tab'ı kapatsa bile task sunucuda çalışmaya devam eder; reconnect ile kaldığı yerden izler. [tianpan.co — Streaming Infrastructure]

### 6.3 Context Penceresi ve Kalıcılık

- Her session'ın context window'u model limitine (200k) kadar birikir; aşınca compaction.
- Session JSONL'i compaction sonrası bile tam history'yi korur; sadece LLM'e giden messages dizisi compact edilir.
- `lokma --continue` son session'ı otomatik resume eder; `lokma --resume <id>` belirli session'ı açar.

---

## 7) Streaming ve Real-Time UI

### 7.1 Event Hiyerarşisi

Modern agent harness'lar üç katmanlı event üretir [tianpan.co, Zylos Research]:

| Katman | Event Örnekleri | Tüketici |
|--------|----------------|----------|
| **1 — Raw** | `text_delta`, `input_json_delta` | Chat bubble |
| **2 — Semantic** | `tool_called`, `tool_result`, `message_complete`, `agent_handoff` | Agent dashboard, tool card |
| **3 — Lifecycle** | `run_started`, `run_finished`, `run_error`, `checkpoint_saved` | Monitoring, orchestrator |

UI katmanına göre abone olunur: basit chat sadece Layer 1, agent dashboard Layer 2+.

### 7.2 SSE Wire Format

```
: ping\n
\n
event: text_delta\n
data: {"delta":"Hello"}\n
\n
event: tool_called\n
data: {"tool":"bash","id":"call_123","input":{"command":"npm test"}}\n
\n
event: tool_result\n
data: {"tool_call_id":"call_123","stdout":"PASS 3 tests","exitCode":0}\n
\n
event: done\n
data: [DONE]\n
\n
```

Header'lar: `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`, `Transfer-Encoding: chunked`.

### 7.3 Tool Call Streaming Zorlukları

- **Partial JSON accumulation:** `input_json_delta` parçaları biriktirilir, sadece `content_block_stop` sonrası `JSON.parse()` yapılır. `max_tokens` ile kesilen tool call bozuk JSON üretir — `stop_reason === 'max_tokens'` ise parse denemeden recovery path.
- **Boş tool_use:** `stop_reason: "tool_use"` ama zero content block → loop/idle. Validate: her tool_use mesajı en az bir complete block içermeli.
- **Orphaned tool_result:** Tool call emit edildi ama crash sonrası result yok → LLM API hard error. Çözüm: assistant message + tool result atomik persist (tek transaction).
- **Sessizlik gap'i:** Tool execution sırasında token akmaz — UI'da "Running npm test..." progress indicator göster.

### 7.4 Frontend Rendering

**CLI (Ink):**

```tsx
function StreamingMessage({stream}: {stream: AsyncIterable<Delta>}) {
  const [text, setText] = useState('');
  const [toolState, setToolState] = useState<ToolState[]>([]);
  useEffect(() => { (async () => {
    for await (const d of stream) {
      if (d.type === 'text_delta') setText(t => t + d.text);
      if (d.type === 'tool_called') setToolState(s => [...s, {name: d.tool, status: 'running'}]);
      if (d.type === 'tool_result') setToolState(s => s.map(t => t.id===d.id? {...t, status:'done', result:d.result}: t));
    }
  })(); }, []);
  return <Box flexDirection="column"><Text>{text}</Text>{toolState.map(t => <ToolCard key={t.id} {...t}/>)}</Box>;
}
```

**Web (React + SSE):**

```ts
const es = new EventSource(`/api/sessions/${id}/stream`);
es.addEventListener('text_delta', e => appendToken(JSON.parse(e.data).delta));
es.addEventListener('tool_called', e => showToolCard(JSON.parse(e.data)));
es.addEventListener('tool_result', e => updateToolCard(JSON.parse(e.data)));
es.addEventListener('done', () => es.close());
// Alternatif: fetch + ReadableStream (POST + header gerekiyorsa)
const res = await fetch('/api/stream', {method:'POST', body: JSON.stringify({prompt}), headers:{'Accept':'text/event-stream'}});
const reader = res.body!.getReader(); // chunk-by-chunk parse
```

**Backpressure:** Node `res.write()` false dönerse `await once(res, 'drain')`; WS `bufferedAmount` izle.

---

## 8) Açık Kaynak Harness Örnekleri

### 8.1 OpenHands (eski OpenDevin) — 60k+ ⭐

**Repo:** `github.com/All-Hands-AI/OpenHands` | **Docs:** `docs.openhands.dev` | **Dil:** Python + TypeScript

Mimari özeti:

- **Runtime:** Docker Runtime (client-server, REST). `openhands/runtime/impl/docker/` — her agent action'ı container içindeki `ActionExecutor`'a gider. Alternatif `local_runtime` (host'ta doğrudan).
- **Event Stream:** `EventStream` + `Agent` (`openhands/agenthub/`) — CodeAct, Planner gibi ajanlar event üretir/tüketir.
- **Browser + Bash + Jupyter:** Runtime içinde browser (Playwright), bash shell, Jupyter server plugin olarak ayağa kalkar.
- **VS Code entegrasyonu:** Sandbox içindeki VS Code server token ile expose edilir (`/vscode/connection_token`).
- **Güçlü yan:** En kapsamlı sandbox soyutlaması, cloud/self-hosted, en aktif topluluk.
- **Zayıf yan:** Python-heavy, kurulumu ağır, resource tüketimi yüksek.

Lokma için ders: `Sandbox` interface'inin `executeCommand`/`readFile`/`writeFiles` üçlüsü OpenHands'in `ActionExecutor`'ından ilham alabilir; `RuntimeClient` pattern'i web harness'te doğrudan uygulanabilir.

### 8.2 Claude Code — Kapalı kaynak, en referans harness

**Docs:** `code.claude.com/docs` | **Mimari makale:** `wavespeed.ai — Claude Code Agent Harness Breakdown` (2026-04)

Öne çıkanlar:

- **19 permission-gated core tool** (+ MCP/subagent ile ~40). Her tool bağımsız permission gate.
- **6 permission modu:** `default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions`.
- **Session:** `~/.claude/projects/*.jsonl` + file snapshot + rewind/resume/fork.
- **Context:** Sürekli biriken working memory; 25k token MCP output limiti; compaction ile uzun görevler.
- **MCP:** `claude mcp add <server> --transport http|stdio|sse` — 3 transport, tool discovery lazy (tüm şemalar upfront yüklenmez).
- **Sub-agent:** `Task` tool ile paralel sub-agent spawn, orchestrator pattern.
- **Ink TUI:** Terminal UI Ink/React ile, streaming token + tool card + diff view.
- **3 execution environment:** Local, remote, cloud (web `claude.ai/code`).

Lokma birebir klon hedefi olduğu için en detaylı referans. Özellikle permission pipeline (deny > ask > allow), compaction stratejisi ve slash-command sistemi doğrudan kopyalanabilir.

### 8.3 Aider — 30k+ ⭐, Git-native, en eski

**Repo:** `github.com/Aider-AI/aider` | **Dil:** Python | **Site:** `aider.chat`

Mimari:

```
User Goal → Aider Agent → LLM (Claude/GPT/ollama) → Code Change Proposal
    → Edit Files → Git Commit → /diff Review → Verify (tests/lint) → /undo if fail
```

- **Git-native:** Her değişiklik otomatik commit → tam audit trail, `/undo` ile geri alma.
- **Repository Map:** Repo yapısının sıkıştırılmış haritası (2048 token bütçe önerilir) — tüm dosyaları context'e tıkmak yerine akıllı özet.
- **Model switching:** Oturum içinde cheap/expensive model değişimi (verification için `gpt-4o-mini`, generation için `sonnet`).
- **Sınırlamalar:** Sub-agent yok, worktree izolasyonu yok, built-in hook yok, state persistence zayıf, `/run` shell'i kısıtlı.
- **Loop engineering için ideal:** Git = loop memory; her iterasyon bir commit.

Lokma için ders: Git auto-commit + `/undo` + repo map fikirleri CLI harness'e eklenmeli; özellikle `map-tokens` benzeri bütçe kontrolü faydalı.

### 8.4 Continue — 20k+ ⭐, IDE-native, en geniş provider desteği

**Repo:** `github.com/continuedev/continue` | **Dil:** TypeScript | **Destek:** VS Code + IntelliJ

Katmanlı mimari:

```
IDE Layer (VsCodeExtension, IntelliJ) 
  ↕ VsCodeMessenger (pass-through routing)
Core Layer (Core class, ConfigHandler, CodebaseIndexer, CompletionProvider)
  ↕ ILLM / BaseLLM
LLM Layer (40+ provider: OpenAI, Anthropic, Ollama, Gemini, Bedrock...)
  ↕ openai-adapters (AnthropicApi, GeminiApi, etc. → OpenAI-compatible)
GUI Layer (React + Redux webview)
```

- **ILLM interface:** `streamChat`, `streamComplete`, `streamFim`, `compileChatMessages`, `countTokens`, `supportsImages` — provider farkları `BaseLLM` + adapter ile gizlenir.
- **Pass-through messaging:** Webview → Core mesajları IDE'yi atlayarak direkt gider (latency düşük).
- **Config:** YAML (`config.yaml`) + profile management + autodetect (`modelSupportsImages`, `modelSupportsReasoning`).
- **Avantaj:** En iyi LLM abstraction, en kolay yeni provider ekleme.
- **Dezavantaj:** IDE'ye bağımlı, standalone harness değil.

Lokma için ders: `ILLM` / `BaseLLM` soyutlaması Lokma'nın model katmanına doğrudan örnek olabilir; adapter pattern ile 40+ provider desteği hedeflenebilir (başlangıçta Anthropic + OpenAI + Ollama yeterli).

### 8.5 Karşılaştırma Tablosu

| Özellik | OpenHands | Claude Code | Aider | Continue |
|---------|-----------|-------------|-------|----------|
| Dil | Python+TS | TS (Ink) | Python | TS |
| Sandbox | Docker/K8s | Local + Cloud VM | Yok (host) | Yok (IDE) |
| TUI | Web + VS Code | Ink terminal | Terminal (curses) | IDE sidebar |
| Git entegrasyonu | Orta | Güçlü (worktree) | Çok güçlü | Zayıf |
| Multi-agent | Var | Var (Task tool) | Yok | Yok |
| Provider sayısı | ~10 | Anthropic (+MCP) | Çoklu | 40+ |
| Session persist | Var | JSONL + snapshot | Yok | History |
| İzolasyon | En güçlü | Orta-güçlü | Yok | Yok |
| Kurulum zorluğu | Yüksek | Kolay (`npm i -g`) | Kolay (`pip`) | Kolay (extension) |
| Lisans | MIT | Proprietary | Apache-2.0 | Apache-2.0 |

### 8.6 Diğer Not Edilesi Projeler

- **Vercel AI SDK Harness** (`ai` + `bash-tool` + `@vercel/sandbox`): `ToolLoopAgent` + `createBashTool` ile 20 satırda harness; Lokma'nın en hızlı prototip yolu.
- **LiteAgent** (`sqfcyily/LiteAgent`): TS + Ink + Bun, async generator, ~500 LOC — minimal harness öğreticisi.
- **E2B** (`e2b-dev/E2B`), **Daytona** (`daytonaio/daytona`), **Modal** (`modal.com`): Managed sandbox provider'ları; Lokma web harness bunlardan birini backend olarak kullanabilir.
- **OpenHands Cloud / Daytona / Northflank**: Self-host vs managed karşılaştırması §5.2'de.

---

## 9) Lokma için Önerilen Mimari

### 9.1 Monorepo Yapısı

```
lokma/
  packages/
    core/               # LLM abstraction (ILLM/BaseLLM), agent loop, compaction
    harness-cli/        # Ink TUI, prompt handling, tool registry, permission gate
    harness-web/        # Next.js API + React UI (xterm.js, Monaco, SSE)
    sandbox/            # Sandbox interface + just-bash, docker, e2b implementasyonları
    shared/             # Tipler, tool şemaları, session JSONL utils
  apps/
    cli/                # `lokma` binary (commander + ink entry)
    web/                # `lokma web` dev server
  docs/
```

### 9.2 Teknoloji Seçimi

| Katman | Seçim | Neden |
|--------|-------|-------|
| Runtime | **Bun** (veya Node 20+) | Hız, ESM native, `bun install` |
| TUI | **Ink 5** + React 18 | Claude Code ile aynı, ekosistem geniş |
| LLM SDK | **Vercel AI SDK (`ai`)** + `bash-tool` | ToolLoopAgent, streaming, provider agnostic |
| Sandbox (dev) | `just-bash` | Hafif, test hızlı |
| Sandbox (prod) | **Docker** (local) + **E2B** (cloud) | Güçlü izolasyon, managed fallback |
| Web framework | **Next.js 15** (standalone) + **PM2** | SSR/SSG, API routes, nginx reverse proxy |
| Terminal | **xterm.js** + `node-pty` | VS Code kalitesi |
| Editor | **Monaco** | VS Code editörü |
| Streaming | **SSE** (data) + **WS** (PTY) | Endüstri standardı |
| State (web) | Zustand veya Redux Toolkit | Basit, typed |
| Session store | **JSONL** (local) + **Postgres** (web) + **Redis Streams** (buffer) | Reconnect + persist |

### 9.3 Geliştirme Fazları

1. **Faz 1 — CLI harness (Ink):** `core` + `sandbox/just-bash` + `harness-cli` → `lokma` komutu çalışır, `read/bash/edit` tool'ları, permission gate, JSONL session.
2. **Faz 2 — Web harness:** `harness-web` Next.js, SSE streaming, file tree, xterm.js PTY, Docker sandbox.
3. **Faz 3 — Hardening:** Firecracker/E2B sandbox, compaction, sub-agent (Task tool), MCP, ` /compress`/`/resume`.
4. **Faz 4 — Desktop app:** Tauri/Electron wrapper (ileride).

### 9.4 Kritik Kararlar (ADR)

- **SSE default, WS sadece PTY için.** Token streaming'de WS'ye geçme; operational cost yüksek.
- **Sandbox interface soyut.** `just-bash` → Docker → E2B geçişi tek satır config değişimi olmalı.
- **Permission deny-first.** `deny > ask > allow` sırası asla değişmemeli; compromised model safety'yi atlayamamalı.
- **Session JSONL hem CLI hem web'de aynı format.** Web Postgres'e mirror eder ama source of truth JSONL.
- **Tool error'u asla exception değil `tool_result(is_error:true)`.** Model kendi hatasını düzeltir.

---

## 10) Kaynakça

- Anthropic — How Claude Code works (agentic loop, tools, sessions): https://code.claude.com/docs/en/how-claude-code-works
- Anthropic Engineering — Effective harnesses for long-running agents: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Vercel Academy — Build Your Own AI Coding Agent Harness (TeensyCode, 38 lessons): https://vercel.com/academy/build-ai-agent-harness
- Vercel Labs — bash-tool (generic bash tool for AI agents): https://github.com/vercel-labs/bash-tool
- Vercel AI SDK — @vercel/sandbox, just-bash, HarnessAgent: https://vercel.com/docs/vercel-sandbox
- MindStudio — What Is an Agent Harness? (9 components, Claude Code/Codex/Cursor breakdown): https://www.mindstudio.ai/blog/what-is-agent-harness-architecture-explained
- DEV — Agent Loop and Harness: A Practical Engineering View: https://dev.to/mike_anderson_d01f52129fb/agent-loop-and-harness-a-practical-engineering-view-of-ai-operations-49o7
- WaveSpeedAI — Claude Code Agent Harness: Architecture Breakdown (19 tools, permission tiers, MCP): https://wavespeed.ai/blog/posts/claude-code-agent-harness-architecture/
- LiteAgent — Lightweight Agent Harness (TS, Ink, Bun, async generator): https://sqfcyily.github.io/LiteAgent / https://github.com/sqfcyily/LiteAgent
- OpenHands Docs — Runtime Architecture (Docker sandbox, ActionExecutor): https://docs.openhands.dev/openhands/usage/architecture/runtime.md
- OpenHands GitHub (60k+ stars): https://github.com/All-Hands-AI/OpenHands
- Aider — AI Pair Programming (Git-native loop, repo map): https://aider.chat/docs + https://loopengineering.wiki/tutorials/agent-loop-foundations/aider-loop-engineering
- Continue Docs — Architecture (ILLM/BaseLLM, Core, VsCodeExtension, 40+ providers): https://deepwiki.com/continuedev/continue/2-architecture
- Continue — LLM Abstraction Layer: https://deepwiki.com/continuedev/continue/4-llm-integration
- Ink — React for CLIs (Yoga/Flexbox, virtual DOM): https://github.com/vadimdemedes/ink + https://martinuke0.github.io/posts/2026-03-31-revolutionizing-cli-development-harness-react
- Tian Pan — The Streaming Infrastructure Behind Real-Time Agent UIs (SSE vs WS, 3-tier buffer, backpressure): https://tianpan.co/blog/2026-04-10-streaming-real-time-agent-uis-sse-backpressure-reconnection
- Tian Pan — Agent Sandboxing and Secure Code Execution (Docker/gVisor/Firecracker matrix): https://tianpan.co/blog/2026-03-09-agent-sandboxing-secure-code-execution
- Zylos Research — LLM Output Streaming and Real-Time Token Delivery Architectures: https://zylos.ai/research/2026-03-28-llm-output-streaming-token-delivery-architectures/
- Manveer C. — How to sandbox AI agents in 2026 (Firecracker, gVisor, E2B, Modal, Daytona): https://manveerc.substack.com/p/ai-agent-sandboxing-guide
- News.skrew.ai — Inside AI Coding Agents: Architecture, Tools, and Agentic Loops: https://news.skrew.ai/inside-ai-coding-agents-architecture-tools-agentic-loops/
- Firecracker microVM (AWS, KVM, <125ms boot): https://firecracker-microvm.github.io/ + https://github.com/firecracker-microvm/firecracker
- Gist — Safe Autonomous Agent Deployment (State of the Art, April 2026, Docker sandbox, Firecracker, E2B): https://gist.github.com/detrin/08c49b666ca73e918dd640a0dbaeae0a

---

*Döküman Lokma harness implementasyonu için teknik referans olarak hazırlanmıştır. Her bölümdeki kod snippet'leri doğrudan `packages/core` ve `packages/harness-cli` içine taşınabilir niteliktedir.*
