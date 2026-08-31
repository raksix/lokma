# Lokma Harness Mimarisi — CLI + Web Nasıl İnşa Edilir

> **Birebir Claude Code harness'ını sıfırdan kurma kılavuzu.**
> Hedef: CLI ve Web aynı agent loop'u paylaşır, model değişebilir, harness sabittir.
> Tarih: 2026-08-31 · Faz: Araştırma → Tasarım

---

## 0. Harness Nedir? (30 Saniyede)

```
Model (LLM)  →  text + tool_calls  →  Harness  →  tool execution  →  result →  tekrar Model
                                     ^^^^^^^
                                     Lokma burası
```

- **Model:** Reasoning yapar, `tool_calls` üretir (Claude/GPT/DeepSeek fark etmez)
- **Harness:** Döngüyü yönetir — prompt'u hazırlar, tool'ları çalıştırır, context'i yönetir, permission sorar, stream eder
- **Claude Code'da `query.ts`:** Tüm yüzeyler (REPL/SDK/subagent/headless) aynı generator'dan geçer

**Pack'in dediği gibi:** "Ölçüm yoksa loop yoktur, damıtılmış ledger 3-5 satır/iter."

---

## 1. Genel Mimari — Katmanlar

```
┌─────────────────────────────────────────────┐
│  Yüzeyler (Surfaces)                        │
│  CLI (Ink TUI) │ Web (React) │ Desktop (Electron) │ API/SDK │
├─────────────────────────────────────────────┤
│  Harness Core (lokma-core)                  │
│  Agent Loop · Session · Context · Permission│
│  Tool Registry · MCP Manager · Hook Runner  │
├─────────────────────────────────────────────┤
│  Execution Backends                         │
│  Bash (brush) │ Python REPL │ JS Worker     │
│  LSP │ DAP (debug) │ Git │ File System     │
├─────────────────────────────────────────────┤
│  Provider Layer (lokma-ai)                  │
│  Anthropic │ OpenAI │ DeepSeek │ OMP-like   │
│  OpenRouter · Ollama · vLLM · Bedrock       │
└─────────────────────────────────────────────┘
```

**Monorepo yapısı (önerilen):**
```
lokma/
├── packages/
│   ├── lokma-core      # Agent loop, session, tools (ana paket)
│   ├── lokma-ai        # Multi-provider LLM client (streaming)
│   ├── lokma-tui       # Terminal UI (Ink + React)
│   ├── lokma-web       # Web harness (Next.js + WebSocket)
│   ├── lokma-cli       # CLI entry (lokma bin)
│   └── lokma-shared    # Zod schemas, types, utils
├── themes/             # Tema JSON'ları
└── Docs/               # ← burası
```

---

## 2. CLI Harness — Detay

### 2.1 Boot Flow (OMP'den uyarlandı, Claude Code ile uyumlu)

```
process.argv
  │
  ▼
cli.ts (runCli) ── Bun version guard, worker-host dispatch, argv normalize
  │
  ▼
commands/*      ── per-command adapter (launch, mcp, plugin, doctor...)
  │
  ▼
main.ts (runRootCommand) ── theme/settings/model-registry/session-opts yükle
  │
  ▼
createAgentSession(...) ── AgentSession oluştur
  │
  ├── InteractiveMode (TUI event loop, Ink)
  ├── runPrintMode    (one-shot: -p "query" → stdout → exit)
  └── runRpcMode      (JSONL stdin/stdout server, SDK için)
```

### 2.2 Terminal UI (Ink)

- **Lib:** `ink` (React for terminal) + `ink-text-input`, `ink-spinner`, `ink-select-input`
- **Bileşenler:**
  - `<App>` — root, session state'i tutar
  - `<Chat>` — mesaj listesi (user/assistant/tool)
  - `<ToolRenderer>` — her tool için custom renderer (Read → code block, Bash → terminal output, Edit → diff)
  - `<PermissionPrompt>` — allow/deny/ask modal
  - `<StatusBar>` — model, context %, cost, spinner
- **Event loop:** `stdin` raw mode, `keypress` → dispatch, `Esc` → abort, `Shift+Tab` → permission cycle
- **Theme:** `themes/<name>.json` → Chalk + Ink `Box` borderColor

### 2.3 Agent Loop — Kalp

```ts
// lokma-core/src/agent/loop.ts (özet)
async function* queryLoop(opts: QueryOpts): AsyncGenerator<AgentEvent, AgentResult> {
  let messages: Message[] = buildInitialMessages(opts) // system + CLAUDE.md + memory + user
  let turn = 0
  while (true) {
    if (isContextFull(messages)) {
      messages = await compact(messages) // özetle, eskiyi at
    }

    // 1. Model'i çağır (streaming)
    const stream = await provider.stream({ messages, tools: registry.definitions, model: opts.model })
    let toolCalls: ToolCall[] = []
    for await (const chunk of stream) {
      yield { type: 'text_delta', text: chunk.text }
      if (chunk.tool_calls) toolCalls.push(...chunk.tool_calls)
    }

    if (toolCalls.length === 0) {
      // Model bitti, text response döndü → loop bitir
      return { status: 'done', messages }
    }

    // 2. Permission check
    for (const tc of toolCalls) {
      const decision = await permissionManager.check(tc, opts.mode) // auto/manual/plan
      if (decision === 'deny') { yield { type: 'tool_denied', tool: tc }; continue }
      if (decision === 'ask') { const ans = yield { type: 'permission_prompt', tool: tc }; /* kullanıcı onayı */ }
    }

    // 3. Tool'ları çalıştır (paralel, ama Write/Edit sıralı)
    const results = await Promise.all(toolCalls.map(tc => toolRegistry.execute(tc, { cwd: opts.cwd })))

    // 4. Hook'lar
    await hookRunner.run('PostToolUse', results)

    // 5. Sonuçları messages'a ekle, tekrar loop
    messages.push({ role: 'assistant', tool_calls: toolCalls })
    messages.push(...results.map(r => ({ role: 'tool', tool_call_id: r.id, content: r.output })))

    // 6. Subagent'lar? Task tool'u burada yeni loop spawn eder
    turn++
    if (turn > MAX_TURNS) return { status: 'max_turns', messages }
  }
}
```

**Kritik detaylar:**
- **Generator (`yield*`):** Backpressure — TUI render busy ise loop durur, buffer taşmaz. OMP ve Claude Code ikisi de generator kullanır.
- **Compaction:** Context %80 dolunca eski mesajlar LLM ile özetlenir, tool result'lar kırpılır. `compaction.md`'ye göre branch summary eklenir.
- **Permission:** `auto` modda classifier (küçük model) her tool call'u risk skorlar, riskli ise `deny`, değilse `allow`.

### 2.4 Tool Registry

```ts
// lokma-core/src/tools/registry.ts
interface ToolDef {
  name: string // "Read" | "Bash" | "Edit" ...
  description: string
  inputSchema: ZodSchema
  handler: (input, ctx) => Promise<ToolResult>
  permission: 'read' | 'write' | 'execute'
}

registry.register({
  name: 'Read',
  description: 'Read file contents',
  inputSchema: z.object({ path: z.string(), offset: z.number().optional() }),
  handler: async ({ path }) => fs.readFile(path, 'utf-8'),
})
// + Edit, Write, Bash, Grep (ripgrep), Glob, WebFetch, WebSearch, AskUserQuestion, Agent (subagent), TodoWrite...
```

- **Hashline Edit:** OMP'nin patch formatı — content hash ile anchor, whitespace-safe
- **Bash:** `brush` veya `node:child_process` ile, session persistent (aynı cwd/env)
- **MCP tools:** Remote'dan gelenler runtime'da `registry.register()` ile eklenir, `tool_search` ile lazy

### 2.5 Session & Storage

```
~/.lokma/
├── settings.json         # global settings (theme, default model)
├── projects/
│   └── <hash(cwd)>/
│       ├── sessions/
│       │   └── <session-id>.jsonl  # JSONL transcript (her message bir satır)
│       ├── checkpoints/            # file snapshot'lar (edit öncesi)
│       └── memory.md               # auto memory (200 satır/25KB)
├── plugins/
├── history.jsonl         # cross-project command history
└── mcp.json              # global MCP servers
```

- **Session ID:** `nanoid` veya `uuid`, `LOKMA.md` yoksa cwd hash'i ile isimlenir
- **Resume:** `lokma --continue` → son session'ı bul, `lokma --resume <id>` → spesifik
- **Fork:** Transcript'i kopyala → yeni ID

---

## 3. Web Harness — Detay

### 3.1 Mimari Seçenekler

| Yaklaşım | Açıklama | Lokma Seçimi |
|----------|----------|--------------|
| **Remote Control** | Web UI local harness'ı kontrol eder (Claude Code Remote Control gibi) | Faz 1: bu |
| **Cloud VM** | Kod cloud'da koşar (claude.ai/code gibi, Docker sandbox) | Faz 2 |
| **Hybrid** | Local veya cloud seçilebilir | Hedef |

**Faz 1 (MVP): Remote Control benzeri**
```
Browser (React)  ←WebSocket/SSE→  lokma web-server (local, :3456)  →  lokma-core (aynı loop)
                                      │
                                      └→ File System (local)
```

**Faz 2: Cloud**
```
Browser  →  lokma-cloud-api (Fastify :4401)  →  Docker sandbox (per-session)
                                              →  lokma-core (sandbox içinde)
```

### 3.2 Web Server (lokma-web)

```
packages/lokma-web/
├── server/              # Fastify + WebSocket
│   ├── routes/
│   │   ├── sessions.ts  # CRUD, list, resume, fork
│   │   ├── chat.ts      # POST /chat → SSE stream, WS /ws/:sessionId
│   │   ├── files.ts     # GET /files, read/write
│   │   └── mcp.ts       # MCP config
│   └── ws.ts            # WebSocket handler (agent loop → client)
├── web/                 # Next.js 15 frontend
│   ├── app/
│   │   ├── (chat)/      # Chat UI (Claude Code web benzeri)
│   │   ├── sessions/    # Session list
│   │   └── settings/    # Theme/model/MCP ayarları
│   └── components/
│       ├── Chat.tsx     # Message list + streaming
│       ├── ToolRenderer.tsx # Her tool için renderer (diff, terminal, file)
│       ├── FileTree.tsx # File explorer
│       └── Terminal.tsx # xterm.js embed (Bash output)
└── shared/              # WS protocol types (lokma-shared)
```

### 3.3 Streaming Protokolü

**SSE (Server-Sent Events) veya WebSocket:**

```ts
// Server → Client event'leri (Claude Code SDK stream-json benzeri)
type AgentEvent =
  | { type: 'text_delta', text: string }
  | { type: 'tool_start', tool: string, input: unknown }
  | { type: 'tool_result', tool: string, output: string, isError: boolean }
  | { type: 'permission_prompt', tool: string, id: string }
  | { type: 'ask_question', questions: Question[] }
  | { type: 'done', result: AgentResult }
  | { type: 'error', message: string }

// Client → Server
type ClientEvent =
  | { type: 'prompt', text: string }
  | { type: 'permission_response', id: string, decision: 'allow'|'deny'|'always' }
  | { type: 'answer', answers: string[] }
  | { type: 'abort' } // Esc
```

- **WebSocket:** `ws://localhost:3456/ws/:sessionId`
- **Auth:** `Authorization: Bearer <token>` (local) veya session cookie (cloud)
- **Reconnect:** Client disconnect → session server'da yaşamaya devam eder, reconnect'te transcript replay

### 3.4 Web UI — Claude Code Web + OMP Karışımı

**Layout (Figma/pen.dev için):**
```
┌─────────────────────────────────────────────────┐
│ Header: Lokma · Session: auth-refactor · [● live] │
├──────────────┬──────────────────────────────────┤
│ FileTree     │ Chat (streaming)                 │
│ src/         │  User: "fix login bug"           │
│  auth.ts     │  Assistant: "I'll investigate..."│
│  login.tsx   │  [Tool: Read src/auth.ts]        │
│              │  [Tool: Grep "login" ]           │
│              │  [Edit: src/auth.ts +12 -3]      │
│              │  [Bash: npm test ✓]              │
│              │  Input: [________________] [Send] │
├──────────────┴──────────────────────────────────┤
│ Terminal (xterm.js) · Preview (diff) · Logs     │
└─────────────────────────────────────────────────┘
```

- **Tool renderers:** Aynı CLI'daki gibi, her tool için React component (diff viewer, terminal output, file preview)
- **Theme:** `themes/*.json` → CSS vars, `data-theme` attribute
- **FileTree:** WebSocket üzerinden `Glob` ile doldurulur, click → `Read` tool tetikler
- **Diff:** `Edit` tool result'ını `monaco-diff-editor` veya custom ile göster

---

## 4. Provider Katmanı (lokma-ai)

**Multi-provider — OMP gibi 60+ değil, başta 6-8:**

```ts
// packages/lokma-ai/src/providers/index.ts
interface Provider {
  id: string // "anthropic" | "openai" | "deepseek" | "google" | "ollama"
  stream(opts: { messages, tools, model }): AsyncIterable<Chunk>
  models: ModelDef[]
}

// Kullanım
const provider = registry.get(settings.defaultProvider) // "anthropic"
const stream = provider.stream({ messages, tools, model: "claude-sonnet-4-5" })
```

**Model catalog:** `models.json` — her provider'ın model listesi, context window, pricing, capabilities
**Auth:** `~/.lokma/credentials.json` (API keys, OAuth tokens) — asla commit'lenmez
**Fallback:** `provider.stream()` 401/429 → sıradaki provider'a fallback (opencode-go pattern)

**Başlangıç provider'ları:**
1. Anthropic (Claude Sonnet/Opus/Haiku) — birincil
2. OpenAI (GPT-4o, o1)
3. DeepSeek (V3, R1)
4. Google (Gemini 2.0)
5. Ollama (local, llama.cpp)
6. OpenRouter (proxy, 100+ model)

---

## 5. Ortak Sistemler (CLI + Web paylaşır)

### 5.1 Permission
```ts
// lokma-core/src/permissions/index.ts
type PermissionMode = 'auto' | 'manual' | 'acceptEdits' | 'plan' | 'bypass'
type Rule = { pattern: string, action: 'allow'|'deny'|'ask' }
// settings.json → { permissions: { allow: ["Bash(npm *)"], deny: ["Bash(rm -rf *)"] } }
```

### 5.2 Hooks
```ts
// .lokma/settings.json
{ "hooks": { "PostToolUse": [{ "matcher": "Edit|Write", "command": "prettier --write $FILE" }] } }
// hookRunner.run(event, context) → child_process.spawn
```

### 5.3 Memory
- `LOKMA.md` (proje kökü) → her session başında system prompt'a eklenir
- `~/.lokma/projects/<hash>/memory.md` → auto memory, 200 satır/25KB
- `lsp` ve `skill` ile genişletilebilir

### 5.4 Context & Compaction
- `contextWindow = 200k` (model'e göre)
- Her tool result token sayılır, %80 dolunca `compact()` → LLM özet
- `prompt caching` → system + LOKMA.md cache'lenir

---

## 6. Güvenlik & Sandbox

| Katman | Yöntem |
|--------|--------|
| **Permission** | allow/deny/ask rules, classifier (auto mode) |
| **Sandbox (Faz 1)** | Local FS, user'ın kendi makinesi (güvenli sayılır) |
| **Sandbox (Faz 2)** | Docker per-session, `gVisor`/`Firecracker` opsiyonel |
| **Tool isolation** | Write/Edit sadece cwd + allowed dirs, `Read` workdir dışı sorar |
| **MCP** | Her server için ayrı permission, OAuth scoped |

---

## 7. Build & Deploy

### CLI
```bash
# packages/lokma-cli
bun run build        # → dist/lokma (binary, bun build --compile)
bun run check        # typecheck + lint
npm publish          # veya curl install script
```

**Install script:** `https://lokma.fermag.com.tr/install.sh` → binary indir, `~/.local/bin/lokma`'a koy, PATH ekle

### Web
```bash
# packages/lokma-web
bun run build        # Next.js standalone
pm2: lokma-web :3456 (local), lokma-cloud :4401 (cloud)
nginx: lokma.fermag.com.tr → :3456, /api → :4401
```

---

## 8. Faz Planı

| Faz | Kapsam | Süre (tahmini) |
|-----|--------|----------------|
| **Faz 0** | Araştırma (bu doküman) + repo scaffold + `lokma-core` iskelet | 1 hafta |
| **Faz 1** | CLI MVP: `lokma` + `lokma -p` + Read/Write/Edit/Bash/Grep/Glob + permission (manual) + session (JSONL) | 2-3 hafta |
| **Faz 2** | CLI Full: hooks, MCP, AskUserQuestion, Agent (subagent), TodoWrite, WebFetch, themes | 2 hafta |
| **Faz 3** | Web Harness MVP: Fastify WS + Next.js chat + streaming + file tree + terminal | 2-3 hafta |
| **Faz 4** | Provider genişletme + cloud sandbox + Desktop (Electron) | Sonra |

**İlk commit:** `lokma-core` + `lokma-ai` + `lokma-cli` iskelet, `lokma --help` çalışır, `lokma -p "hello"` mock response döner.

---

## 9. Referans Implementasyonlar

| Proje | Dil | Öne Çıkan | Link |
|-------|-----|-----------|------|
| **Claude Code** | TS/JS (closed core) | query.ts generator, 200k context | `github.com/anthropics/claude-code` |
| **OMP (oh-my-pi)** | TS + Rust 80k | 60+ provider, brush shell, hashline | `github.com/can1357/oh-my-pi` |
| **OpenHands** | Python + Docker | Cloud sandbox, event stream | `github.com/All-Hands-AI/OpenHands` |
| **Aider** | Python | Git-aware, architect/editor model | `github.com/Aider-AI/aider` |
| **Continue** | TS + VS Code | IDE-first, local LLM | `github.com/continuedev/continue` |
| **Cursor** | Electron | Fork VS Code, agent + autocomplete | — |

---

## 10. Karar Bekleyenler (Furkan'a Sorulacak)

- [ ] **İsim:** Lokma kesin mi? Domain `lokma.fermag.com.tr` / `lokma.sh`?
- [ ] **İlk provider:** Sadece Anthropic mi, yoksa OMP gibi multi-provider mı (öneri: multi, Anthropic default)?
- [ ] **Lisans:** MIT mi, private mı?
- [ ] **Install:** `curl https://lokma.sh/install \| sh` mi, `npm` mi?
- [ ] **Web hosting:** 67 makinesi (77.90.41.67) uygun mu, yoksa ayrı?
- [ ] **Desktop:** Electron mu, Tauri mi (Rust)?

---

*Sonraki adım: Faz 0 scaffold — `packages/lokma-*` monorepo kurulumu.*
