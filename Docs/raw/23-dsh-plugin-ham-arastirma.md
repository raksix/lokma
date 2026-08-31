# DeepSeek Harness (DSH) Plugin System — Deep Research Dossier

> **Source:** `https://github.com/deepseek-ai/deepseek-harness` (205k★, 23.7k forks, MIT) — DeepSeek AI's open-source agentic harness  
> **Core framework:** [Cordis](https://github.com/cordiverse/cordis) vendored as `@deepseek-ai/cordis@4.0.0-rc.7`  
> **Paper:** *A Programming Paradigm for Spatiotemporal Composability* — [arXiv:2608.25512](https://arxiv.org/abs/2608.25512) — Yifan Shi, Wei Zhang, Tianyi Cui (Peking U / DeepSeek-AI), 92pp, 26 Aug 2026  
> **Docs scraped:** `docs/cordis-primer.md`, `docs/architecture.md`, `docs/cordis-tutorial/{01..07}.md`, `docs/user/develop/{basic,framework,practice}/**`, `docs/cookbook/**`, `packages/bundle/base/cordis.patch.yml`, `vendor/README.md`, `packages/boot/app-boot/README.md`, `packages/core/tools/README.md`, `apps/cli/README.md`, `package.json`  
> **Date scraped:** 2026-08-31  |  **Author:** Hermes Agent sub-task for Lokma (`/mnt/apopic/lokma`)  
> **Purpose:** Raw research input for Lokma's web harness plugin system — see §7 for direct adaptation.

---

## Table of Contents

1. [Everything-is-a-Plugin Philosophy & Cordis Paradigm](#1-everything-is-a-plugin-philosophy--cordis-paradigm)
2. [Plugin Structure: Manifest, Lifecycle, Activation, API](#2-plugin-structure-manifest-lifecycle-activation-api)
3. [Plugin Types](#3-plugin-types)
4. [Discovery / Installation / Loading / Enabling / Disabling](#4-discovery--installation--loading--enabling--disabling)
5. [Plugin Communication: Events, Services, DI](#5-plugin-communication-events-services-dependency-injection)
6. [Example Plugins from the Repo](#6-example-plugins-from-the-repo)
7. [How Lokma Can Adapt This for Its Web Harness](#7-how-lokma-can-adapt-this-for-its-web-harness-plugin-system)
- [Appendix A: Bundle & Service Registry](#appendix-a-bundle--service-registry)
- [Appendix B: Key Files & Links](#appendix-b-key-files--links)

---

## 1. Everything-is-a-Plugin Philosophy & Cordis Paradigm

### 1.1 The Microkernel Claim

> *“Every part of the product is a plugin, including the model adapter, the tool registry, the session log, and the agent loop itself, so each is replaceable from configuration. There is no privileged core to patch: you extend dsh by mounting a plugin beside the others.”* — `docs/architecture.md`

DSH takes the Linux-microkernel stance to its logical extreme:

- **No privileged core.** The shipped product is not a monolith with plugin hooks; it *is* the composition of ~70 plugins that happen to be co-shipped. Removing `dsh-tools` removes all model-facing tools. Removing `dsh-agent-loop` removes the default driver. Removing `dsh-llm` removes model connectivity entirely.
- **Extensions are peers, not second-class citizens.** A third-party plugin registers `ctx.tools.register(...)` or `ctx.llm.registerAdapter(...)` through the same public API the in-tree plugins use. No private patch path, no fork needed.
- **Configuration is the application.** A running `dsh` is fully described by its profile's Cordis tree (`dsh --profile web --dump-config`). Every row is a plugin entry; every row is patchable.

This is the explicit “Everything is a Plugin” tagline on the repository and the npm topic `dsh-plugin` (discoverability contract).

### 1.2 Spatiotemporal Composability — The Theory Behind Cordis

The Cordis paper formalizes what plugin authors feel as ergonomic facts. It identifies **two orthogonal dimensions** that traditional plugin systems under-serve:

| Dimension | Informal question | Classical PL ancestor |
|-----------|-------------------|----------------------|
| **Temporal composability** | *Can I completely revert a component's side effects when it is removed?* | Effects / effect handlers |
| **Spatial composability** | *Can I declare and reactively manage what a component depends on, and have the system activate/deactivate it accordingly?* | Coeffects / coeffect handlers |

Most frameworks solve one dimension and hand-wave the other. Cordis solves both and unifies them.

### 1.3 Revertible Effects (Temporal) & Reactive Coeffects (Spatial)

**Revertible effects (temporal):**

- Every context transformation carries an **inverse** the runtime holds. Installing a prompt section, a tool schema, an adapter, or an event listener is an *effect* that returns a *disposer*.
- The disposer is owned by the plugin's **Fiber**. Unload = walk disposers in reverse registration order and invoke them. Async disposers run concurrently but remain owner-visible until quiescence.
- Result: hot-reload, config reconciliation, or manual `fiber.dispose()` leaves no ghost listeners, no leaked intervals, no stale schemas. `ctx.effect(() => { const id=setInterval(...); return () => clearInterval(id); })` is the escape hatch for resources Cordis doesn't already manage.

**Reactive coeffects (spatial):**

- Every context change is classified against a component's **coeffect specification** — in Cordis: the `inject` array (`export const inject = ['tools','llm']`).
- The runtime holds PENDING plugins until every required service exists, and **reactively unloads dependents** when a required service disappears. Reloading a provider cleanly restarts every consumer against the new implementation.
- Result: load order is not file order, not topological sort you maintain, but a live reactive graph. Swapping `dsh-bash-local` for a remote-executor provider is `disabled: true` on one row + enabling another; dependents follow automatically.

### 1.4 The Context Paradigm (Unified Context Type)

The paper's key synthesis: effect context and coeffect context are unified into a **single context type** (`Context`), and every effect and coeffect is mediated through it. That mediation induces an **observational equivalence up to which distinct components' effects interleave without disturbing one another**.

Practical consequence in DSH:

- Services live on `ctx` (`ctx.tools`, `ctx.llm`, `ctx.agents`, `ctx.sessions`, `ctx.systemPrompt`, `ctx.shell`, `ctx.fs`, `ctx.sandbox`, `ctx.approval`, `ctx.sessionProjections`, `ctx.jobs`, …). No direct imports of provider implementations.
- Registrations go through `ctx` (`ctx.on`, `ctx.effect`, `ctx.plugin`, `ctx.tools.register`, `ctx.llm.registerAdapter`). That threading is what makes them reversible and dependency-tracked.
- Even `!!js` config expressions are evaluated **against `ctx`** (loader interpolates `config` after `inject` activates, against that plugin's `ctx.serviceName`; `disabled` against the loader's `ctx`).

### 1.5 Cordis as Meta-Framework

Paper §6 + `vendor/README.md`:

- **Core library** (`cordis@4.0.0-rc.7`): effect tracking, coeffect resolution, `Context`, `Service`, `Fiber`, `RegistryService`, `EventsService`, `LoggerService`. 9 vendored packages in `vendor/` — `cordis`, `cosmokit@1.8.1`, `schemastery@3.18.0`, `loader` (`@cordisjs/plugin-loader`), `include`, `group`, `timer`, `hmr`, `logger-console` — all rescoped to `@deepseek-ai/*`, preserving upstream versions and MIT licenses.
- **Declarative loader** (`@deepseek-ai/cordis-plugin-loader@1.0.0-rc.5` + `include@1.0.4` + `group@1.0.0`): reads `cordis.yml` / `cordis.patch.yml`, reconciles configuration, handles hot module replacement. Supports `!!js` YAML tag, `id`/`disabled`/`isolate`/`group` metadata, `insert` patch semantics, and transactional rollback on failure (`loader/src/internal.ts` hardening for Node 24 v1/v2 module-job API).
- **HMR** (`@deepseek-ai/cordis-plugin-hmr@1.0.15`): watches file roots + the exact config path, serializes refreshes, broadcasts `hmr/config-update-failed` on failure. Local hardening removes the `reggol`/`unyaml` dependency and fixes Windows short-name alias collisions.

A calculus of dynamic composition with mechanized metatheory is given; the headline theorem lifts spatiotemporal composability from a single component to a whole system of interleaved components.

---

## 2. Plugin Structure: Manifest, Lifecycle, Activation, API

### 2.1 What Is a Plugin? Three Shapes

Cordis accepts three syntactic forms (chapter 1 — `docs/cordis-tutorial/01-first-plugin.md`, `docs/user/develop/basic/index.md`):

```ts
// 1. Function plugin — most common, sufficient until you expose a service
import type { Context } from '@deepseek-ai/cordis'
export const name = 'hello'                         // optional diagnostics label
export const inject = ['tools']                     // optional coeffect declaration
export function apply(ctx: Context, config: Config) {
  console.log('hello from my first plugin')
  ctx.on('some/event', handler)                     // effect — auto-disposed
}

// 2. Object plugin
export default {
  name: 'object-plugin',
  inject: ['tools'],
  apply(ctx: Context) { /* ... */ },
}

// 3. Class plugin — use when you PROVIDE a service
import { Service, type Context } from '@deepseek-ai/cordis'
export default class MyService extends Service {
  static inject = ['tools']                         // class-level variant
  constructor(ctx: Context) { super(ctx, 'myService') }
  myMethod() { /* ... */ }
}
```

**Learner insight:** a function plugin needs no `apply` method when mounted programmatically (`ctx.plugin(heartbeat)`) — Cordis calls the function directly. The `apply` convention is only required for the YAML loader path, where the module's named `apply` export is discovered.

### 2.2 Manifest & Metadata

A **config entry** (one row) in `cordis.yml` / `cordis.patch.yml` carries:

| Field | Type | Meaning |
|-------|------|---------|
| `name` | `string` | Module specifier — relative path (`./hello.ts`) or npm package (`@deepseek-ai/dsh-tools`). Resolved by Loader; may be absolute during `--patch` overlays. |
| `id` | `string` | Stable identity for diffing. Without `id`, each read generates a new id → entry counts as removed+added on every config edit. **Always set `id` for patches and HMR.** |
| `config` | `object` | Validated against the plugin's exported `Config` schema. Defaults applied, then passed as second arg to `apply(ctx, config)`. Supports `!!js` expressions (see §2.3). |
| `disabled` | `boolean \| !!js expr` | Skip mounting while keeping the entry. Evaluated against **loader context** at every mount decision; other metadata stays literal. `disabled: !!js process.platform === 'win32'` is canonical. |
| `inject` | `string[]` | Extra coeffect overlay? In practice most plugins declare `inject` in code, not in YAML; the loader respects both. |
| `isolate` | `Record<string, boolean>` | When inside a `group:true` entry, gives that group its own instance of a service name (`isolate: { shell: true }`) — see §5.4. |
| `group` | `boolean` | Entry is a group row whose `config` is a sub-list of entries loading/unloading as one unit (`@deepseek-ai/cordis-plugin-group`). |

**Patch semantics (`cordis.patch.yml`):**

- A patch file is an **overlay array** applied over an empty entry list in layer order (see §4.4). Each element is either `{ name, ... }` to append or `{ insert: [...] }` / `{ id, config, disabled }` to target existing rows.
- A patch **replaces the whole `config`** of the targeted row — no deep merge. Restate every key the row needs.
- `include` rows (`@deepseek-ai/cordis-plugin-include`) carry nested row expressions preserved until target activation; `group` rows behave similarly for `isolate`.

**Bundle manifest (`package.json` dsh field):**

```jsonc
// A bundle ships a configuration layer: what does this package contribute?
{
  "name": "dsh-hello-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

```yaml
# cordis.patch.yml — patch rows reference the package BY NAME so Node resolves installed code
- insert:
  - id: hello
    name: dsh-hello-plugin
```

**Profile manifest (`$DSH_HOME/profiles/<name>/package.json`):**

```jsonc
// A profile answers "which bundles compose this setup, in what order?"
{
  "name": "dsh-profile-demo",
  "private": true,
  "dependencies": { "dsh-hello-plugin": "link:/path/to/hello-plugin" },
  "dsh": {
    "profile": {
      "bundles": ["@deepseek-ai/dsh-base", "dsh-hello-plugin"],
      "patchReload": "live" // or "startup"
    }
  }
}
```

One package is never both a bundle and a profile.

### 2.3 Configuration Schema & `!!js`

Every configurable plugin exports a **tied pair** — a TypeScript interface and a same-named Schemastery schema:

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'my-plugin'

export interface Config {
  greeting: string
  maxRetries: number
  verbose?: boolean       // optional
}

export const Config: Schema = Schema.object({
  greeting: Schema.string().default('Hello'),
  maxRetries: Schema.number().default(3),
  verbose: Schema.boolean().default(false),
  // Strict validators: Schema.string().required(), Schema.union(['fast','accurate']), Schema.array(String), etc.
})

export function apply(ctx: Context, config: Config) {
  console.log(config.greeting) // always complete, validated
}
```

```yaml
# cordis.yml consumer — any tunable that two deployments may set differently MUST be a field
- id: hello
  name: './src/my-plugin.ts'
  config:
    greeting: 'Hi there'
    maxRetries: 5
    # computed — only inside config + disabled
    # apiKey: !!js process.env.MY_KEY ?? 'fallback'
```

Rules:

- Cordis accepts **any Standard Schema** validator; a plain object does not implement the interface and fails.
- Invalid config → `ValidationError: invalid config: - $.targets expected array but got ...` → fiber `FAILED`, process exits 1 in the tutorial launcher.
- `!!js` expressions are parsed by `@deepseek-ai/cordis-plugin-include` and interpolated: `config` after declared injections activate (against that plugin's `ctx.serviceName`), `disabled` at every mount decision (against loader context). Use overlays when environment selects plugins. Ship `cordis.yml` with `Schema.*.default()` so omission is not an error.

### 2.4 Lifecycle: The Fiber State Machine

Every loaded plugin instance owns a **Fiber** — the runtime handle for one loaded instance.

```
PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED
          ↘ FAILED
```

| State | Meaning | Observable symptom |
|-------|---------|---------------------|
| `PENDING` | Declared but at least one `inject` service is absent | Plugin prints nothing, keeps event loop non-blocking (silent PENDING) — the #1 “why doesn't my plugin load?” cause |
| `LOADING` | Dependencies satisfied; `apply` is running | Synchronous body executing |
| `ACTIVE` | `apply` completed successfully | Effects registered, events listening |
| `FAILED` | `apply` or config validation threw | One labelled error line + stack; boot fails |
| `UNLOADING` | `dispose()` called or dependency lost; disposers running | Reverse-order disposer walk, async disposers concurrent |
| `DISPOSED` | Fully torn down, recursively unloaded children | Fiber gone; dependents now PENDING if they lost a service |

`docs/user/develop/framework/index.md` documents the guarantee: `dispose()` awaits all async cleanup, recursively unloads `ctx.plugin(child)` children, and leaves no registrations. Two caveats hard-coded in `vendor/README.md` hardening:

- Disposers start in reverse registration order but multiple **async** disposers run **concurrently** — for ordered teardown, keep steps in **one** `ctx.effect()` disposer and `await` them serially there.
- `ctx.effect` creation is rejected while owner is `UNLOADING` (allowed in `PENDING`/`LOADING`), preventing cleanup-time registrations from escaping the unload snapshot.

### 2.5 Activation Rules

1. **Dependency-driven, not file-order-driven.** List position in `cordis.yml` guarantees nothing. Swap two entries with `inject` deps — same outcome. Ordering comes from `inject`.
2. **Reactive re-evaluation.** A required service appearing/disappearing triggers immediate activation/deactivation. Service replacement = unload old provider + mount new one; dependents restart automatically.
3. **Config-gated activation.** `disabled` evaluated at every mount decision → a row can gate itself on `process.platform`, `process.env.*`, or any loader-visible condition without code changes.
4. **Group / isolate activation.** A `group:true` entry with `isolate: { shell: true }` gives each group's subtree its own `shell` instance. Useful for per-agent capability sets where a single global service would leak.

### 2.6 The `ctx` API Surface (what a plugin can do)

From `docs/cordis-primer.md` + tutorial + `docs/user/develop/framework/*`:

| Method / property | Kind | Effect? | Notes |
|-------------------|------|---------|-------|
| `ctx.plugin(child)` | Composition | yes (child fiber disposed with parent) | Mount a plugin from code; returns Fiber handle with `dispose()` |
| `ctx.effect(() => disposer)` | Resource Mgmt | yes | Wrap timers, connections, watchers; disposer returned runs on unload |
| `ctx.on(event, listener, opts?)` | Events | yes | Listener removed on unload. `opts.prepend` for early execution (use sparingly) |
| `ctx.emit(name, ...args)` | Events | no | Broadcast, sync, ignores returns |
| `ctx.bail(name, ...args)` | Events | no | Sync serial until `!= null/false/undefined` |
| `ctx.parallel(name, ...args)` | Events | no | Async fan-out, awaited, ignores returns |
| `ctx.serial(name, ...args)` | Events | no | Async serial, first truthy wins |
| `ctx.waterfall(name, ...args, next)` | Events | no | Around-middleware; `next()` delegation required (see §5.3) |
| `ctx.get(key)` | Services | no | Optional service probe; returns `undefined` if absent (no `inject` wait) |
| `ctx.inject(keys, fn)` | Services | no | Historical; prefer `export const inject` |
| `ctx.registry.values()` | Diagnostics | no | Enumerate runtimes/fibers (see diagnose.ts example) |
| `ctx.tools.register(def)` | Tools | yes | Disposer attached to calling plugin |
| `ctx.llm.registerAdapter(names, adapter)` | LLM | yes | One adapter per route; duplicates throw; multi-route all-or-nothing |
| `ctx.systemPrompt.section(...)` | Prompt | yes | Prefix / section registration |
| `ctx.tools.restrict(filter)` / `ctx.tools.guard(guard)` | Tools | yes | Scoped masking / monotonic final denial |
| `ctx.tools.get(name, scope)` / `ctx.tools.schemas(scope)` | Tools | no | Lookup / schema projection |
| `ctx.sessions.*` / `ctx.agents.*` / `ctx.storage.*` | Domain | mixed | Service-specific APIs (see §3) |

**Declaration merging (type layer):**

```ts
import '@deepseek-ai/cordis'
declare module '@deepseek-ai/cordis' {
  interface Context { myService: MyService }
  interface Events {
    'my-plugin/ready': (payload: { id: string }) => void
    'my-plugin/transform': (input: string, next: () => Promise<string>) => Promise<string>
  }
}
```

No runtime cost; omitted merge = runtime still works, but type safety lost.

### 2.7 Minimal File Layout

In-tree convention (`docs/cookbook/adding-a-package.md`):

```
packages/<group>/<name>/
├── package.json      # private:true, version = root version, type:module, main:lib/index.js, exports, peerDeps
├── tsconfig.json     # extends ../../../tsconfig.base.json, rootDir src, outDir lib/types, references to cordis/cosmokit/schemastery + dsh deps
├── src/
│   ├── index.ts      # plugin (name/inject/apply/Config) or Service subclass default export
│   ├── types.ts / schema.ts / presentation.ts  # optional splits
│   └── invariant.ts  # optional invariant companion
├── README.md         # kind: group|reference|library|bundle, service API, events, Model Experience, Known Limitations
└── tests/            # vitest — see docs/testing.md for coverage policy
```

Out-of-tree bundle (publishable):

```
hello-plugin/
├── package.json       # dsh.bundle manifest
├── cordis.patch.yml   # patch layer applied when listed in a profile
├── index.js           # or lib/index.js if built from TypeScript
└── README.md
```

---

## 3. Plugin Types

DSH's taxonomy is not enforced by the framework — every plugin is just a Cordis plugin — but the docs and `where new behavior goes` map (`docs/architecture.md`) name stable shapes. Lokma should adopt the same vocabulary.

### 3.1 Tool Plugins (`ctx.tools`)

The canonical extension: expose a capability as a model-callable function.

```ts
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'greet-tool'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'greet',
    description: 'Greet the named person.',  // model sees this
    parameters: {                             // ParameterSchemaSpec — DSL or raw JSON Schema
      name: { type: 'string', required: true, description: 'Who to greet' },
    },
    output: {
      schema: { type: 'string' },            // ValueSchemaSpec — canonical JSON value
      render: (_args, value) => [{ type: 'text', text: value }], // model-facing content
    },
    async execute(args, exec) {               // args typed from parameters
      return `Hello, ${args.name}!`           // return canonical value, not content blocks
    },
  }))
}
```

Key contracts (from `docs/cookbook/adding-a-tool.md` + `packages/core/tools/README.md`):

- **Args validated before `execute`.** `defineTool` validates types, required keys, literal constraints, `oneOf`, nesting. Raw `ToolDefinition` tools own their own validation (MCP path).
- **Return canonical JSON value only.** Never return content blocks; the registry snapshots, freezes, validates the value and calls `output.render(args, value)` to materialize content.
- **Honor `exec.signal`.** Cooperative cancellation; `exec.agent`, `exec.callId`, `exec.token`, `exec.arguments` are immutable (only `exec.signal` replaceable by a wrapper).
- **`presentationMeta` + `presentCall`/`presentResult`** produce bounded replayable UI card state persisted on `tool/result.meta` so replay reproduces the card without persisting the canonical value.
- **PTC mode** (`run_code` transport) reaches every typed tool for free via `ToolArgsMap` / `ToolOutputMap`; intermediate values are execution-local and uncapped, only the outer `run_code` result is capped.
- **`ctx.tools.restrict()` / `guard()` / `tools/pre-execute` / `tools/execute` / `tools/post-execute` / `tools/result`** form the policy-and-observation pipeline around `execute` — see §5.

**Shipped tool families:** `dsh-tool-bash` (bash), `dsh-tool-fs` (write/edit/read), `dsh-tool-fs-search` (grep/glob), `dsh-tool-web` (web_search/web_fetch), `dsh-tool-subagent`, `dsh-tool-workflow`, `dsh-tool-skill`, `dsh-tool-todo`, `dsh-tool-jobs`, `dsh-tool-ralph`, `dsh-tool-str-replace-editor`.

### 3.2 Provider Plugins (Capability Seam Providers)

A **seam** = Service Definition + Service Provider(s) + Consumer(s). Only the seam is the capability; a single role is not. Packages may combine roles, but split when roles evolve independently (`docs/user/develop/practice/index.md` — the shell trio is the reference).

| Seam | Def. package | Provider packages | Consumer | `ctx` key |
|------|-------------|-------------------|----------|-----------|
| Shell / Bash | `dsh-shell` | `dsh-bash-local`, `dsh-bash-sandbox` | `dsh-tool-bash` | `ctx.shell` |
| Filesystem | `dsh-fs` | `dsh-fs-sandbox` (sandboxed), local | `dsh-tool-fs` | `ctx.fs` |
| Subprocess | `dsh-subprocess` | `dsh-subprocess-local` | `ctx.subprocess` consumers | `ctx.subprocess` |
| Sandbox | `dsh-sandbox` | `dsh-sandbox-local` | `dsh-bash-sandbox`, `dsh-fs-sandbox` | `ctx.sandbox` |
| LLM provider | `dsh-llm` | `dsh-llm-deepseek`, `dsh-llm-pi-ai` | agent loop consumers | `ctx.llm` |
| Storage | `dsh-storage` | `dsh-storage-json` | `dsh-storage-domain` → projection cache | `ctx.storage` |
| Sessions (persistence) | `dsh-session` | `dsh-session-persistence-jsonl`, `dsh-session-projection*` | agent loop, web client | `ctx.sessions`, `ctx.sessionPersistence` |
| Jobs (background) | `dsh-jobs` | `dsh-jobs-local` | `dsh-tool-jobs` consumers | `ctx.jobs` |
| Attachments | `dsh-attachment` | `dsh-attachment-local` | provider history hydration | — |
| Session query | `dsh-session-query` | `dsh-session-query-sqlite` | search UI | `ctx.sessionQuery` |

Provider swap principle: filesystem + subprocess providers share one sandbox execution world — pointing them at a remote sandbox moves Bash, PTY, and LSP together with no fork.

### 3.3 LLM Adapter Plugins

Adapter extends `LlmAdapter` and implements `stream(GenerateOptions): AsyncIterable<StreamChunk>`.

```ts
import { Service, type Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { LlmAdapter, type GenerateOptions } from '@deepseek-ai/dsh-llm'

class MyAdapter extends LlmAdapter {
  constructor(private apiKey: string) { super() }
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    // 1. map options.messages / tools / params to provider wire format
    // 2. call streaming API, honoring options.signal + attributionHeaders()
    // 3. yield StreamChunk sequence
  }
}

export interface Config { apiKey: string; providers: string[] }
export const Config = Schema.object({ apiKey: Schema.string().required(), providers: Schema.array(Schema.string()).required() })

export const name = 'my-llm-adapter'
export const inject = ['llm']
export function apply(ctx: Context, config: Config) {
  ctx.llm.registerAdapter(config.providers, new MyAdapter(config.apiKey))
}
```

**StreamChunk protocol (must be exact):**

```
block-start(index, blockType) → (text-delta | tool-call-delta)* → block-end(index, block) ... → usage → finish
```

Rules: every `block-start` needs a `block-end`; `index` increases 0-based; `tool-call-delta.argumentsDelta` is raw JSON string (re-stringify if provider parses); `usage` before `finish`; `finish` is last; nothing after `finish`; unsupported `GenerateOptions` field → `throw LlmError('UNSUPPORTED_OPTION')` (never silently drop); `options.signal` must be forwarded; `LlmError` with stable code is the failure contract (throw vs `finish{kind:'error'|'aborted'}` depending on failure class).

Shipped: `dsh-llm-deepseek` (OpenAI-compatible HTTP + `eventsource-parser` SSE) and `dsh-llm-pi-ai` (pi-ai library — multi-route, dormant until `llm-pi-ai:` settings section supplies profiles, then live-registers routes with per-request key resolution).

### 3.4 UI Plugins

Two flavors:

**a) Event-driven UI** — observe `session/event` and drive input back via `ctx.agents`:

```ts
export const name = 'my-ui'
export const inject = ['agents']
export function apply(ctx: Context) {
  ctx.on('session/event', (_session, event) => {
    if (event.type === 'assistant/chunk' && event.data.chunk.type === 'text-delta')
      render(event.data.chunk.text)
  })
  onUserInput(text => ctx.agents.get(brandString('client-session'))?.followup(createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  })))
}
```

The Web Client owns `session/page` + `follow` transport (raw `tool/call` + `tool/result` with `result.meta`) and does **not** consume `presentCall`/`presentResult`; that split is pinned by the Client-derived presentation decision. Host presentation helpers are separate.

**b) Business chat-node plugin** — register a `ConversationNodeDefinition` + keyed `conversation.chat.node` renderer; the Conversation subsystem owns assembly. Web-app-mode `tool-web` cards, terminal/diff/read/search/web cards are examples. Use `output.presentationMeta(args, value)` when a card needs bounded structured result facts beyond model-facing content.

### 3.5 Hook / Policy / Gate Plugins

A “native hook” is just a Cordis plugin on an interception event — no external protocol.

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'

export const name = 'permission-gate'
export function apply(ctx: Context) {
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    if (!(await isAllowed(exec))) return { kind: 'deny', reason: 'Denied by policy.' }
    return next()
  })
}
```

**Tool pipeline hooks (selection rule from `docs/cookbook/adding-a-tool.md`):**

| Hook | Mode | When to use |
|------|------|-------------|
| `tools/pre-execute` | `waterfall` | Extensible allow/deny/ask policy — reorderable, cooperating listeners |
| `ctx.tools.guard()` | monotonic sync | Invariant final denial no later listener can undo |
| `tools/execute` | `waterfall` | Wrap dispatch with deadline/retry/metrics; only `exec.signal` replaceable |
| `tools/post-execute` | `waterfall` | Replace presentation content/value, block result, or attach `additionalContexts` |
| `tools/result` | `emit` | Observe immutable final outcome for audit/metrics/capture |

Other hookable seams: `agent/pre-step` (rewrite claimed messages or `reject`), `agent/request` (replace model-call config), `approval/request` (answer instead of user), `agent/turn-stopping` (steer another step before turn closes), `fs/*` (filesystem policy), `telemetry/*`.

The feature inside the repo that this generalizes: the hook system (`agent/session-start`, `agent/pre-step`, `agent/request`, `tools/pre-execute`, `tools/post-execute`, `agent/turn-stopping`) plus `dsh-hooks-claude-code` / `dsh-hooks-codex` bridges that map hook config files onto these events.

### 3.6 Theme / Presentation Plugins (DSH gap → Lokma opportunity)

DSH has **no first-class “theme plugin.”** Presentation is mode-split:

- Host tools produce `card`-tagged `ToolCallView` ints (`generic`, `terminal`, `diff`, `read`, `search`, `web`) consumed by Host-local presenters.
- Web Client derives `tool.call.toolview` keyed components from raw wire values — no `presentCall`/`presentResult` import path.

Lokma's theme system will supersede this: a dedicated plugin type (see §7.3).

### 3.7 Job / Background Work Plugins

```yaml
- name: '@deepseek-ai/dsh-jobs-local'
- name: '@deepseek-ai/dsh-tool-jobs'
```

`ctx.jobs.start({ kind, label, owner: exec.agent, run })` hands the job runtime ownership. `job_output` / `job_list` / `job_kill` tools follow. Execution identity stored until `await jobs.get(id).done` or owner disposal. Useful beyond `bash -- run_in_background` — any long-running model-facing operation.

### 3.8 Other Notable Types

| Type | Example package(s) | Mechanics |
|------|--------------------|-----------|
| **Command plugins** | `dsh-commands`, `dsh-command-goal`, `dsh-command-feedback` | Register on `ctx.commands`; dispatch without a model turn (`/goal`, `/loop`, `/plan`, `/feedback`) |
| **Skill plugins** | `dsh-skill`, `dsh-skill-filesystem`, `dsh-tool-skill` | Section + tool registration; `inject()` skill content on invocation via `ctx.skills` |
| **Memory / instruction plugins** | `dsh-agent-instructions`, `dsh-memory` | `ctx.systemPrompt.section()` providers |
| **Goal / planning** | `dsh-goal`, `dsh-goal-round-driver`, `dsh-plan-mode`, `dsh-tool-goal`, `dsh-tool-ralph` | `ctx.goals`, `ctx.workflowEngine` + worker-thread engine + `workflow` tool |
| **Compaction** | `dsh-compaction-*`, `dsh-tool-call-timeout-policy`, `dsh-spill-*` | `ctx.compaction` seam + policy listeners on `agent/pre-step`, `agent/request-error` |
| **Webhook** | `dsh-webhook` | `ctx.webhookRuntime` — trusted `rule` + provider adapter creates Workspace sessions |
| **Session title** | `dsh-session-title[-first-prompt-llm]` | Sole `ctx.sessionTitle` provider |
| **Permission/sandbox** | `dsh-permission-presets`, `dsh-sandbox-policy` | `ctx.sandbox` / `ctx.permission` / `ctx.approval` |
| **Protocol drivers** | `dsh-acp-*`, `dsh-sdk-app`, `packages/acp/acp` | Adapt a wire peer (ACP JSON-RPC stdio, SDK JSON-RPC) to `ctx.agents` |

---

## 4. Discovery / Installation / Loading / Enabling / Disabling

### 4.1 Discovery

- **Topic convention:** add the `dsh-plugin` topic to the plugin's GitHub repository. `dsh plugin` UI and community docs index by it; no registry service required.
- **Generated catalogs (machine-readable discovery):**
  - `docs/cordis-surface` regions inside each subsystem page — every injectable service + event with mode/signature.
  - `docs/cordis-api/` — exhaustive Cordis API reference.
  - `docs/config-catalog.md` — every `Config` field per plugin (Schemastery-derived JSDoc).
  - `docs/tool-catalog.md` — every shipped `defineTool`'s name/description/JSON schema.
  - `$DSH_HOME` provenance comments in `dsh --dump-config` header each row with its source layer.
- **No central marketplace CLI in v0.1.2-alpha.2.** Discovery is GitHub topic + docs + catalogs. Lokma will add an explicit marketplace index (see §7.5).

### 4.2 Installation

`dsh plugin --profile <name> <pnpm verb>` forwards to pnpm in the profile directory. All pnpm verbs work.

```sh
# Initialize profile demo (first use → @deepseek-ai/dsh-base as first bundle) + link local checkout
dsh plugin --profile demo add ./hello-plugin

# After init, profile's package.json gains:
#   dependencies: { "dsh-hello-plugin": "link:/path/hello-plugin" }
#   dsh.profile.bundles: ["@deepseek-ai/dsh-base", "dsh-hello-plugin"]

# Remove
dsh plugin --profile demo remove dsh-hello-plugin

# Install from npm (prebuilt)
dsh plugin --profile demo add dsh-hello-plugin

# Install from GitHub sources (unbuilt!) — see build-script catch below
dsh plugin --profile demo add github:you/hello-plugin
dsh plugin --profile demo add github:you/hello-plugin#<commit>
```

**Git install: the build-script catch** — git hosts fetch sources, not built `lib/`. Two mitigations:

1. Author adds `"prepare": "tsdown ..."` (self-contained, not assuming monorepo) — pnpm runs it after git install.
2. User allowlists it in `pnpm-workspace.yaml`:
   ```yaml
   allowBuilds:
     dsh-hello-plugin: true
   ```
   pnpm ≥10 refuses until allowed; `dsh` prints the exact key. Treating allowance as code execution outside the agent sandbox — only pin trusted commits.

Prebuilt alternatives (no allowance): `pnpm publish` to npm, or `pnpm pack` → `dsh plugin add ./hello-0.1.0.tgz`. A package without `dsh.bundle` still installs, but only as a library — warning, no active layer.

Bundles named in `dsh.profile.bundles` resolve from the **dsh installation** first, then the profile's `node_modules` (pnpm-managed out-of-tree). Verified by `verify-application-entrypoints` (no way to bypass `dsh`).

### 4.3 Loading

Boot is owned by `@deepseek-ai/dsh-app-boot` (shared library behind `dsh`):

```
dsh web                          # alias for --profile web
dsh --profile web --patch ./scratch-plugin/cordis.yml
dsh --profile demo --dump-config # inspect without booting
```

Internally (`packages/boot/app-boot/src/{index.ts,profile.ts}`):

1. Resolve config path (`resolveConfigPath(argv, env)` — snapshot-aware).
2. `installFailLoud('dsh')` — single labelled fatal line for any boot failure.
3. `loadLayeredEnv` — invocation-directory `.env` > `$DSH_HOME/.env` > inherited env (rejects `PATH`, `DSH_*`, `XDG_*` from files).
4. Discover profiles at `$DSH_HOME/profiles/<name>/` (template init if `--profile web|headless|acp|sdk|sdk-minimal` first use).
5. Compose entry list over an empty root (see §4.4).
6. Create root `Context`, mount Loader (`@deepseek-ai/cordis-plugin-loader`), feed it the composed entries.
7. `boot()` → wait `assertEntriesActivated` settlement — either a running app or one labelled failure line (`host preparation failed` vs `plugin tree failed to load` + deepest stack). Drains before error, restores terminal if it owns one.
8. Optional `addHarnessSourceSection(ctx)` — one prompt line telling the agent where the `dsh` checkout lives (if `ctx.systemPrompt` exists).

**Loader internals (`vendor/loader`, `vendor/include`, `vendor/cordis` hardening):**

- Bare specifiers resolved through Loader from config directory via per-package proxy packages / symlink fallback (`dsh-module-fallback` link).
- Module-loader shape detection handles Node 24.0–24.11.1 masquerading as v2.
- Transactional reconciliation: import candidate name before disposal, await lifecycle settlement, restore previous plugin/config on candidate failure → never half-apply.
- Group updates start candidates concurrently and contain sibling-start failures.
- `include` validates detached candidate content, applies patches on a clone, reconciles, then commits — failure propagation contained.

### 4.4 Layer Order (the whole effective configuration)

Applied over an **empty entry list**, later wins per row (`id`-match). A patch replaces the row's **whole** `config`, not a merge.

```
1. Each bundle patch in dsh.profile.bundles list order
     └─ @deepseek-ai/dsh-base first (shared core), then each installed bundle in add-order
        (dsh-web-app / dsh-headless / dsh-sdk-app / dsh-acp-app add their app rows)
2. The profile's own cordis.patch.yml
3. The home-level $DSH_HOME/cordis.patch.yml (machine-local prefs shared by every profile)
4. Each --patch overlay in argv order
```

App arguments are **not** a patch layer — a surface bundle may expose them through an ordinary provider (`inject = ['cmdlineArgs']` → `parseCmdline` with Commander + immutable snapshot inheritance) and downstream rows consume `!!js ctx.myAppStartup.port ?? 8080`.

Inspect what actually boots:

```sh
dsh --profile web --dump-config   # provenance comments + loadable YAML
```

### 4.5 Enabling / Disabling

| Operation | How | Effect |
|-----------|-----|--------|
| Disable in-place | `disabled: true` or `disabled: !!js <expr>` on the row | Entry unmounted but retained; flipping back reloads + re-activates dependents |
| Disable per-env | `disabled: !!js process.platform === 'win32'` (canonical) | Evaluated at **every** mount decision against loader context |
| Override config | Later patch targets same `id` with new `config` | Whole config replaced — restate fields kept |
| Override `disabled` | Later patch targets same `id` with `disabled: false` | Re-enable from a lower layer |
| Remove bundle | `dsh plugin --profile demo remove <pkg>` | pnpm uninstall + drop from `dsh.profile.bundles` |
| Replace provider | Disable one row + enable another providing same `ctx` key | Dependents auto-restart against new impl (reactive coeffect) |
| Agent-scoped disable | Not via top-level disable — use `ctx.tools.restrict()` or `agentPreset` `isolate` | Hides tool/provider from one agent only |

`dsh plugin remove` is the only command that edits `dsh.profile.bundles`; manual deletion desyncs pnpm and manifest.

### 4.6 Live Patch Reload & HMR

| Profile | `patchReload` | Behavior |
|---------|---------------|----------|
| `web` (template) | `live` | Watches profile + home `cordis.patch.yml` + (via Loader task) plugin source files under `root:['.']`. Valid edit → transactional live recomposition without restart. Rejected edit → last good app stays running; labelled stderr. |
| `headless`, `sdk`, `sdk-minimal`, `acp` | `startup` | Apply all layers once at startup; replacing deps after owning work would invalidate one-shot/stdio lifecycle. Neither watchers nor HMR fallback installed. |
| Custom profiles | `live` default if omitted | Same as `web` |

**HMR module replacement:** old instance unloads (all effects unwound), new code loads, `apply` re-runs. Requires `@deepseek-ai/cordis-plugin-timer` (the `hmr` plugin `inject`s `timer` — PENDING otherwise) and a console logging exporter to see `hmr watching [...]` / `reload plugin at hello.ts`.

**Silent PENDING diagnosis** (`docs/cordis-tutorial/06-composition-and-hmr.md`):

```ts
import { FiberState, type Context } from '@deepseek-ai/cordis'
export const name = 'diagnose'
export function apply(ctx: Context) {
  setTimeout(() => {
    for (const runtime of ctx.registry.values())
      for (const fiber of runtime.fibers)
        if (fiber.state === FiberState.PENDING)
          console.log(`${fiber.name} is PENDING — missing service`)
  }, 500)
}
```

### 4.7 Composition Diagnostics

- `dsh --profile <name> --dump-config` — exact composed tree without booting.
- `dsh --profile <name> --dump-default-config` — default without user layers.
- Labelled single-line boot failure (never silent) — `installFailLoud` + deepest stack.
- `verify-cordis-catalog` / `gen-cordis-catalog`, `verify-config-catalog`, `verify-cordis-api`, `verify-package-invariants` — build-time gates catching drift between docs and implementation.

---

## 5. Plugin Communication: Events, Services, Dependency Injection

*All of this is on `Context`. The one-surface rule prevents ghost state outside Cordis.*

### 5.1 Services & Dependency Injection

**Providing** a service — `Service` subclass + scoped name:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'
// 1. Type augmentation
declare module '@deepseek-ai/cordis' {
  interface Context { metrics: MetricsService }
}
export default class MetricsService extends Service {
  static inject = ['llm']          // optional — depends on llm
  constructor(ctx: Context) {
    super(ctx, 'metrics')         // claims ctx.metrics — stable, flat namespace
  }
  record(event: string, value: number) { /* ... */ }
}
```

```ts
// 2. Mounting
export function apply(ctx: Context) { ctx.plugin(MetricsService) }
// or via cordis.yml: - name: './metrics-service.ts'
```

**Consuming:**

```ts
export const inject = ['metrics']   // hard requirement — wait until ready
export function apply(ctx: Context) { ctx.metrics.record('tool_call', 1) }

// Optional dependency — no inject, probe at use site
export function apply(ctx: Context) {
  const m = ctx.get('metrics')
  m?.record('plugin_loaded', 1)    // undefined when no provider loaded
}
```

**Semantics:**

- `inject` is reactive, not one-shot: a required service disappearing unloads the dependent (ACTIVE → DISPOSED), reappearing reloads it.
- `ctx.get(key)` bypasses that dormancy — use for best-effort telemetry, optional adornment.
- Service names live in one flat namespace — prefix your own (`myCompanyMetrics`), plain names are DSH (`tools`, `llm`, `agents`, `sessions`, `systemPrompt`, `shell`, `fs`, `sandbox`, `approval`, `scope`, `agentTeams`, `sessionTitle`, `storage`, `jobs`, `webhookRuntime`).
- Generated `cordis-surface` catalog on each `docs/subsystems/*.md` is the authoritative consumer reference.

**Service isolation** (`cordis.yml` group + isolate):

```yaml
- id: group-a
  name: '@deepseek-ai/cordis-plugin-group'
  group: true
  isolate: { shell: true }
  config:
    - name: '@deepseek-ai/dsh-bash-local'
      config: { timeoutMs: 5000 }
    - name: './src/plugin-a.ts'
- id: group-b
  name: '@deepseek-ai/cordis-plugin-group'
  group: true
  isolate: { shell: true }
  config:
    - name: '@deepseek-ai/dsh-bash-local'
      config: { timeoutMs: 60000 }
    - name: './src/plugin-b.ts'
```

`plugin-a` and `plugin-b` each see a distinct `ctx.shell` instance; useful for per-agent capability presets where a single global provider would leak.

### 5.2 Typed Events

**Declaring:**

```ts
declare module '@deepseek-ai/cordis' {
  interface Events {
    'stats/report'(name: string, count: number): void
    'demo/transform'(input: string, next: () => Promise<string>): Promise<string>
  }
}
```

The `namespace/action` convention is strong; docs enforce it via subsystem ownership. Each event documents its dispatch **mode** with `@mode` — generated catalog checks `declare` vs `dispatch` sites.

**Emitting vs handling:**

```ts
// Emitter — also dispatch-mode-specific
ctx.emit('stats/report', name, next)                // emit — ignore returns
ctx.bail('some-check', input)                       // bail — first truthy wins (sync)
await ctx.parallel('setup-phase', context)          // parallel — await all concurrently, ignore returns
await ctx.serial('setup-phase', context)           // serial — await ordered, first truthy wins
await ctx.waterfall('demo/transform', input, async () => input) // waterfall — around-middleware

// Listener — ctx.on is an effect inside a mounted plugin
ctx.on('stats/report', (name, count) => { console.log(`[stats] ${name} -> ${count}`) })
ctx.on('demo/transform', async (input, next) => {
  const downstream = await next()
  return downstream.toUpperCase()
})
// Remains until the owning plugin unloads — no manual off()
```

**Dispatch modes at a glance:**

| Mode | Awaited? | Order | Return collected? | Contract |
|------|----------|-------|-------------------|----------|
| `emit` | No | Registration order | No | Broadcast observe |
| `waterfall` | No (caller `await`s wrapping promise) | Registration order | Yes (threaded through `next()` return) | Around-middleware; listener decides to delegate or veto |
| `parallel` | Yes | All concurrently | No | Fan-out |
| `serial` | Yes | Registration order | Yes (first `!= null/false/undefined` stops) | Ordered + halt |
| `bail` | No | Registration order | Yes (same halt rule, sync) | Sync `serial` |

The mode is part of the event's public contract; mixing a `serial` listener against an `emit` dispatch is a catalog-verified mismatch.

### 5.3 Waterfall Semantics — The Veto Design

Waterfall listeners receive `(...args, next)`. Two obligations:

1. **Observer/annotator → must call `next()` and usually `return next()`** (or `return (await next()).something`). Forgetting `next()` silently swallows downstream default + other plugins' logic — called a veto.
2. **Owner of the decision → return without `next()`** to short-circuit. Example: policy denial `{ kind:'deny' }` or blocking `blocked` payload. Downstream listeners and the final default never run; upstream callers see the replacement value.

The `next()` threading is LIFO-cooperative: each listener can wrap what it delegates to:

```ts
ctx.on('demo/transform', async (input, next) => {
  const downstream = await next()   // runs next listener (or default value factory)
  return downstream.toUpperCase()   // wraps it
})
ctx.on('demo/transform', async (input, next) => {
  if (input.includes('blocked')) return '** blocked **'  // veto — default never runs
  return next()
})
// dispatch: waterfall('demo/transform', 'hello', async () => 'hello') → "HELLO"
// dispatch: waterfall('demo/transform', 'blocked words', async () => 'blocked words') → "** BLOCKED **"
```

DSH's harness waterfalls: `agent/request`, `agent/pre-step`, `llm/stream`, `tools/pre-execute`, `tools/execute`, `tools/post-execute`. Each waterfall's participants must follow the `next()` discipline; `prepend:true` is allowed only when the listener must outrank ordinary registrations (rare, flagged in review).

**Single-decision waterfalls** (policy gates) make short-circuiting the idiomatic path; `agent/turn-stopping` is explicitly `serial` (no `next()`) so data steering decides.

### 5.4 Scope Isolation & Per-Agent Worlds

Not covered in this dossier's core because `dsh-scope` is a non-service library, but it is load-bearing:

- `dsh-scope` provides `createScope` / `scopeOf` / `scopeTarget` — a scoped-registration primitive so registries (`ctx.tools`, `ctx.systemPrompt`) and the agent loop can offer `agent.ctx` where a registration is agent-local, unbound on `AgentHandle.dispose()`, and rejected after disposal.
- Group `isolate` realms (above) are the outer composition analog; scopes are the inner per-agent analog.
- A plugin that needs agent locality uses `agent.ctx.on` / `agent.tools.restrict()` rather than the global `ctx.*`.

### 5.5 Effects & Reversible Registration — The Temporal Guarantee

Every built-in registry helper is itself an effect:

- `ctx.on(...)`, `ctx.plugin(child)`, `ctx.tools.register(...)`, `ctx.llm.registerAdapter(...)`, `ctx.effect(...)` all attach a disposer to the calling fiber.
- Package-agnostic `ctx.effect(() => { const t=setInterval(...); return () => clearInterval(t) })` is the pattern for wrap-everything-else.
- If teardown order matters, keep interrelated work in **one** effect so disposal unwinds in the intended sequence (multiple async disposers run concurrently otherwise).

Consequence: transactional live reconciliation is safe — the Loader can import the candidate plugin, attempt to apply its patch, reconcile the tree, and commit only after success, rolling back to the prior snapshot on failure (vendor hardening note #11).

---

## 6. Example Plugins from the Repo

### 6.1 The Base Composition — `packages/bundle/base/cordis.patch.yml` (the application)

The clearest “plugin catalog” — rendered as ordered inserted rows (excerpt; full file ~130 rows). Read as: *this is everything that makes `dsh` be `dsh` before a profile opts out/in*.

| Group | Rows | What they are |
|-------|------|---------------|
| Runtime | `timer`, `hmr` (disabled), `llm`, `deepseek-llm-api-extensions`, `session`, `session-log-deepseek`, `typert*`, `session-title*` | Core event/log/registry layer — every profile boots these |
| Agent | `agent`, `plugin-package-inventory-deepseek`, `agent-default-model`, `jobs`, `llm-retry`, `settings`, `credentials`, `llm-pi-ai` (dormant until settings enable routes) | Agent creation, default model, job runtime, settings/credentials hot-reload + dormant pi-ai fleet |
| Persistence & projection | `session-persistence-jsonl`, `attachment-local`, `session-query-sqlite` (never), `session-projection`, `storage*`, `session-projection-cache`, `session-telemetry-otel` | JSONL store, attachment blob, opt-in FTS (mode `never` keeps exact reads but no search), incremental projection registry + write-behind cache, OTLP telemetry (feedback-gated, `DSH_TELEMETRY_MODE` env) |
| Shell / sandbox | `subprocess`, `sandbox`, `sandbox-policy` (mode `workspace-write` / env `DSH_PERMISSION_MODE`), `bash-sandbox`/`pwsh-sandbox` (platform-gated), `approval`, `permission` (presets `read-only`/`workspace-write`/`danger-full-access`) | Sandboxed subprocess + policy + approval gating — the three-role sandbox seam: `dsh-sandbox-local` provider, `dsh-sandbox-policy` policy, `dsh-user-approval` ask-gate |
| Shell tool chain | `shell-env`, `tool-bash`, `tool-pwsh` (win32), `tool-jobs`, `fs-observation-policy`, `tool-fs`, `tool-fs-search`, `agent-instructions`, `skill*`, `tool-skill` | Bash/PowerShell + background jobs + fs grep/glob + instruction/skill seam |
| Commands & goals | `commands`, `command-feedback`, `goal*`, `command-goal`, `plan-mode`, `command-plan`, `tool-todo`, `tool-goal`, `tool-ralph`, `tool-str-replace-editor` | Slash commands + durable same-session goals + plan-mode + workflow driver + todo/ralph editors |
| Web & web tool | `web`, `web-search-deepseek` (`DEEPSEEK_API_KEY`), `web-fetch-http`, `tool-web` (fetch:false by default) | Stable `web_search` tool (60s search timeout for DeepSeek auxiliary model request) |
| Registry & loop anchors | `tools` (mode native), `system-prompt` (persona ''), `agent-loop` (agents:[]), `fs-sandbox`, `llm-deepseek` | Registries left empty / default; mode-bundles & patches populate them |

Mode-bundle complements (not in this file) add `dsh-web-app` (browser app + Chat conversation system), `dsh-headless` (one-shot runner), `dsh-sdk-app`, `dsh-acp-app`; `dsh-sdk-minimal` is the deliberate exception — single explicit bundle, no `dsh-base`.

### 6.2 Tutorial Plugins (canonical teaching set)

| File | Pattern taught | Code shape |
|------|----------------|------------|
| `docs/cordis-tutorial/01-first-plugin.md` → `hello.ts` | First plugin — three shapes, resolution caveat | `export const name + export function apply(ctx)` + `cordis.yml: - name: './hello.ts'` |
| `02-lifecycle-and-effects.md` → `lifecycle.ts` | `ctx.effect()` + fiber disposal | `ctx.plugin(heartbeat)` returns Fiber; `ctx.effect(() => { setInterval; return () => clearInterval })`; `await fiber.dispose()` after 700ms |
| `03-services.md` → `greeter.ts` + `consumer.ts` | `Service` subclass + `inject` | `class GreeterService extends Service { super(ctx,'greeter'); greet(who){} }` + `export const inject=['greeter']` consumer; diagnose PENDING with `ctx.registry` |
| `04-events.md` → `stats.ts` + `reporter.ts` + `waterfall-demo.ts` | Typed events, five dispatch modes, waterfall veto | `declare module { interface Events { 'stats/report'(name,count):void } }` + `ctx.emit` + `ctx.on`; waterfall delegation/veto demo |
| `05-config.md` → `config-demo.ts` | Schemastery schema + defaults + `!!js` | `export const Config=Schema.object({ greeting:Schema.string().default('Hello') })` → `apply(ctx,config)` always complete |
| `06-composition-and-hmr.md` → `hello.ts` edit trace | Composition as tree + live reload + diagnosis | `id`, `disabled:true`, `group`/`isolate`; `@deepseek-ai/cordis-plugin-timer` + `logger-console` + `hmr` wiring; `FiberState.PENDING` enumeration |
| `07-into-the-harness.md` → `greet-tool.ts` + `tool-logger.ts` | Real harness services — `defineTool` + `tools/result` | `inject:['tools']` + `ctx.tools.register(defineTool({name,description,parameters,output,execute}))` + `ctx.on('tools/result',(exec,result)=>...)` + composed `dsh-system-prompt` + `dsh-tools` provider dependency |
| `docs/user/develop/*` → `scratch-plugin/src/my-plugin.ts` | Web overlay variant | Patch `insert:{id, name:absolute, config}` + `pnpm dsh web --patch ./scratch-plugin/cordis.yml` |

### 6.3 `dsh-tool-bash` — The Reference Consumer Tool

Why it matters: every rule from `adding-a-tool.md` in one place.

- **Telemetry:** registers the `bash` tool only after `ctx.shell`, `ctx.systemPrompt`, `ctx.tools`, `ctx.shellEnv` all exist (`inject` gate).
- **Execution:** calls `bash -c <command>` in a fresh shell every invocation (no `cwd` persistence — use `workdir`).
- **Background path:** when decorated `run_in_background:true`, hands ownership to `ctx.jobs.start({kind,label,owner:exec.agent,run})` — id + fence + generic `job_output`/`job_kill` come from the runtime, not the tool.
- **Sandbox awareness:** under `dsh-bash-sandbox`, reports `[sandbox: file access denied under <mode> mode]`; model may retry once with wider `sandbox_permissions` + `justification` requiring `ctx.approval`.
- **Rendering:** model-facing text is stdout + `[stderr]` section + tail-truncation notice + exit marker (`[exit code: N]` parsed by shared `parseExitStatus` for the UI pill). Spill file path included when tail-truncated.
- **Config:** one flag `enableRunInBackground` (default true); strict rejection when disabled.

Reference for Lokma's `lokma-tool-bash` / `lokma-tool-fs` etc. — preserve the same consumer/provider separation.

### 6.4 `dsh-tool-fs` / `dsh-tool-fs-search` — Stateful Tool Card Contracts

Showcases **card-tagged Host presenters** and `presentationMeta`:

- `presentCall` for `diff` (`write`/`edit`): `{card:'diff', title, diffs:[{path,oldText,newText}], locations?}` (oldText null for new file — pure, no FS read).
- `presentResult` diff via `output.presentationMeta(args,value)` persisted in `tool/result.meta` so replay reproduces hunks without canonical value.
- `read` result: `{card:'read', path, offset, lines, totalLines, lang}` — no call view; generic placeholder pending.
- `search` (`grep`/`glob`): `{shape:'matches'|'paths', groupsOrPaths, truncated, total}` — call pending stays generic.

Lokma's Web Client should mirror the **policy** (purity, replay reproducibility, persisted `result.meta`) while swapping cards for OMP/Lokma theme tokens.

### 6.5 `dsh-llm-deepseek` / `dsh-llm-pi-ai` — Adapter Templates

- `llm-deepseek`: direct HTTP (`fetch` + `eventsource-parser` SSE). Keep wire types / request serialization / transport parsing / chunk translation / adapter class separated.
- `llm-pi-ai`: SDK-wrapping adapter; dormant until `llm-pi-ai:` section in `settings.yaml` supplies provider profiles → live registers routes, per-request `apiKeyEnv` resolution, drops again when section empties.
- Both verified against `StreamChunk` / `GenerateOptions` / `LlmError` contracts — pick one as your adapter template; add the other when a provider needs another SDK.

### 6.6 `dsh-tools` Itself — The Registry-as-Plugin

The registry is not privileged — it is a plugin that other plugins `inject`.

- Config: `mode: native|ptc|both` + `maxParallelSubCalls:10` for `run_code` pool.
- `ctx.tools.register(defineTool(...))` is already effect-based (unregister = disposer).
- `ctx.tools.schemas(scope)` → wire `ToolSchema[]`; `ctx.tools.get(name,scope)` → definition visible to that scope (scoped via `dsh-scope`).
- `ctx.tools.restrict(filter)` → allow/deny mask intersecting globally; lift = disposer. `ctx.tools.guard(guard)` → monotonic final denial.
- PTC mode generates deterministic SDK (`ToolArgsMap`/`ToolOutputMap`) in the loaded `ctx.codeRuntime` language — only one runtime per composition, one `presentAs()` shadow per agent.
- Failure taxonomy: throw vs invalid value vs renderer/meta-projector failure → `isError`; `unknown tool` → `UNKNOWN_TOOL` → structured error, not turn end; cooperative `ABORTED_BEFORE_DISPATCH` vs `ABORTED` vs `TOOL_TIMEOUT`.

### 6.7 `dsh-system-prompt`, `dsh-agent-loop`, `dsh-session*`

- `system-prompt/assemble` — cooperative waterfall whose returned assembly is authoritative; listeners preserving PTC + structured-output contributions own that duty; `ctx.tools.restrict()` preferred for hiding tools.
- `agent-loop` — the only concrete `Agent` implementation (`ctx.agentLoop`), consuming `ctx.agents.withInitiator()` scope. Step = one model request + its tool calls; turn = zero or more steps.
- `session` — the durable `SessionEvent` log; `deriveMessages()` projects history; “model-visible means logged” invariant.
- `session-projection` — incremental per-session state folded from committed events; host consumers `stateOf()` typed, `snapshot()` batches.

### 6.8 Application & Bundle Plugins

- `dsh-base` — shared first layer (see §6.1).
- `dsh-web-app` — adds the browser app + Web Chat conversation nodes (`ConversationNodeDefinition` + keyed renderer).
- `dsh-headless` — one-shot runner, no server.
- `dsh-sdk-app` / `dsh-sdk-minimal` (standalone explicit tree) — SDK JSON-RPC servers.
- `dsh-acp-app` — automation-only ACP server.
- `dsh-app-boot` — though technically a library, it **owns** boot composition; keep it behind `dsh` launcher and reuse via `boot()`.

---

## 7. How Lokma Can Adapt This for Its Web Harness Plugin System

This section is prescriptive — mapping the DSH heritage to Lokma's hybrid CLI+Web harness (Ink TUI + browser, multi-provider, themeable, OMP-inspired design). Lokma lives at `/mnt/apopic/lokma`, docs at `Docs/`, and envisions a single harness that runs locally or in a cloud sandbox, sharing sessions between CLI and Web.

### 7.1 Architecture-Level Inheritance — What to Keep Verbatim

Do **not** re-derive these; copy them by following the DSH file locations exactly:

| DSH decision | Why Lokma keeps it | File to copy/modify |
|--------------|-------------------|----------------------|
| Cordis as runtime + Loader/Include/Group/HMR vendored | Temporal+spatial composability is Lokma's single hardest feature; rebuilding it loses 92pp of metatheory | `vendor/README.md`, `vendor/cordis/**`, `vendor/loader/**`, `vendor/include/**`, `vendor/group/**`, `vendor/hmr/**`, `vendor/timer/**`, `vendor/logger-console/**`, `vendor/schemastery/**`, `vendor/cosmokit/**` |
| `Context` as one unified context type mediating every effect/coeffect | Enables “no ghost state” and reactive swap; without it, background jobs and sandbox swaps leak | `vendor/cordis/src/context.ts`, `vendor/cordis/src/fiber.ts` |
| Effect + coeffect hardening (reentrant disposal, transactional reconciliation, module-job shape detection) | Lokma will hit the same Node 24 / Windows alias / PENDING-nothing bugs otherwise | `vendor/cordis/src/fiber.ts` notes #6–9 in `vendor/README.md` |
| Three-role seam pattern (Def / Provider / Consumer = one seam) | Lets Lokma sell “one shell that swaps from local to remote sandbox” with zero consumer forks | `capability-seams.md`, `docs/user/develop/practice/index.md` (Bash seam trio) |
| `@deepseek-ai/cordis` scope | Already rescoped from `cordisjs`; Lokma should rescope to `@lokma/cordis` via `scripts/rescope-vendor.ts` pattern — do not publish under upstream names | `scripts/rescope-vendor.ts`, `vendor/README.md` § manifest |
| `Schemastery` for `Config` + `!!js` | Same file config works for themes, provider keys, timeouts; `!!js process.env.LOKMA_API_KEY` is expected | `vendor/schemastery/**`, `docs/cordis-primer.md` § Loader Configuration |
| Layered composition over empty root (bundles → profile → home → --patch) | Gives Lokma the same “one liner replaces any row” operator story | `docs/user/develop/basic/publish.md` § Loading order; `packages/boot/app-boot/src/profile.ts` |
| `tools/execute` signal-only mutation contract | Lets Lokma add timeout/retry/metrics wrappers without desyncing `arguments` | `docs/cookbook/adding-a-tool.md` execution pipeline |

**Lokma's rescope checklist (mechanical):**

```sh
cp -r vendor vendor.lokma-backup
# 1. Copy vendor/* + update each manifest name to @lokma/*
# 2. pnpm run rescope-vendor --apply  # pattern: regenerate lock links, patch vendor package.json names
# 3. pnpm install && pnpm run constraints && pnpm run typecheck && pnpm run build
# 4. Record new scope map in vendor/README.md + docs/rescope.md
```

### 7.2 Lokma's Profile & Bundle Plan (Direct Mapping)

| DSH profile | Lokma analogue | Bundle stack |
|-------------|----------------|--------------|
| `dsh-base` | `lokma-base` | `lokma-llm`, `lokma-session*`, `lokma-tools`, `lokma-shell*`, `lokma-fs*`, `lokma-sandbox*`, `lokma-permission`, `lokma-theme` (new — see §7.3), `lokma-commands`, `lokma-skills`, `lokma-completions` |
| `dsh-web-app` | `lokma-web-app` | Browser app + Ink↔Web transport (`session/page` + `follow`) + conversation nodes + theme-aware tool cards |
| `dsh-headless` | `lokma-headless` | One-shot runner for CI / `lokma run "job"` |
| `dsh-sdk-app` / `dsh-sdk-minimal` | `lokma-sdk` / `lokma-acp` | Keep if Lokma exposes Python/TS SDK or ACP bridge; otherwise defer |
| CLI launcher `dsh` | `lokma` (`packages/cli` → `apps/cli` + `packages/boot/app-boot`) | `lokma web` alias, `lokma --profile headless`, `lokma plugin --profile <name>`, `lokma --dump-config`, `lokma theme set <name>` (theme selector as overlay) |

**Harness home:**

- Resolve as `resolveLokmaHome()` via `packages/util/home-paths` pattern: `$LOKMA_HOME` > `~/.lokma` > `$XDG_DATA_HOME/lokma` / `$XDG_CONFIG_HOME/lokma` separation if desired. Keep `$DSH_HOME` migration path for early adopters.
- Profiles under `$LOKMA_HOME/profiles/<name>/` (`package.json` + `cordis.patch.yml`); profile `live` for `web`, `startup` for `headless`.

### 7.3 Web-Harness-Specific Adaptations — Theme, Slash Commands, Skills, Presence

#### 7.3.1 Theme Plugins (Lokma's Signature Gap)

DSH has no theme layer — add one as a first-class plugin type that rides the same live reload and scope isolation:

```ts
// packages/theme/lokma-theme/src/index.ts
import { Service, type Context } from '@lokma/cordis'
import Schema from '@lokma/schemastery'

declare module '@lokma/cordis' {
  interface Context { theme: ThemeService }
  interface Events {
    'theme/changed'(id: string): void
  }
}

export interface Config {
  theme: string        // 'omp' | 'claude' | community id
  tokens?: Record<string,string> // overrides
}
export const Config: Schema = Schema.object({
  theme: Schema.string().default('omp'),
  tokens: Schema.dict(Schema.string()).default({}),
})

export class ThemeService extends Service {
  private _active = 'omp'
  constructor(ctx: Context, private config: Config) {
    super(ctx, 'theme')
    this._active = config.theme
  }
  get active() { return this._active }
  async set(id: string) {
    // validate, load tokens, emit, persist to settings
    this._active = id
    this.ctx.emit('theme/changed', id)
  }
  resolveTokens() { /* merge base tokens + config.tokens + profile override */ }
}

export function apply(ctx: Context, config: Config) {
  ctx.plugin(class extends ThemeService { constructor(c: Context){ super(c, config)} })
  // System-prompt: optional persona tint per theme
  ctx.effect(() => ctx.systemPrompt.section({ /* ... */ }))
}
```

```yaml
# lokma-base patch row for theme
- id: theme
  name: '@lokma/lokma-theme'
  config: { theme: !!js process.env.LOKMA_THEME ?? 'omp' }
```

Web integration: theme tokens are a **shared import** (`packages/client/theme-tokens` — mirror OMP's `11-ARASTIRMA-omp-temalar-ve-tasarim.md` palette) consumed by both Ink TUI (via `vitest` → border/background helpers) and Web Client (CSS variables `--lokma-*`). A theme plugin’s `ctx.theme.on('theme/changed')` hot-replaces tokens without tearing fibers (tokens are data; fibers unchanged). Community themes publish as `lokma-theme-*` bundles — `lokma plugin add lokma-theme-nord` appends a `dsh.bundle`-style row whose `cordis.patch.yml` just restates `theme`'s `config`.

Scope trick: `group: true` + `isolate: { theme: true }` per window/pane if Lokma adds multi-pane desktops.

#### 7.3.2 Slash Commands & Skills as Plugins

Follow DSH verbatim:

- Commands on `ctx.commands` (without model turn) — `/goal`, `/loop`, `/plan`, `/feedback`, plus Lokma's `/theme`, `/model` (provider switch), `/fork`, `/share`.
- Skills on `ctx.skills` — section + tool registration; invocation `ctx.agents.get(id)?.inject({ content, source:{kind:'skill', plugin:'myskill'} })`.

#### 7.3.3 Tool Card Theming

Retain DSH's `defineTool` contract + `presentCall`/`presentResult` **for Host**, but add one contract: each card's render receives `ctx.theme.resolveTokens()` so `terminal`/`diff`/`read`/`search`/`web` cards pick `bg / border / accent` from the active theme, not a hard-coded palette. Web Client's `tool.call.toolview` renderers likewise consume the shared `tokens` via the theme service's `snapshot()` projection.

### 7.4 Minimal Viable Plugin API for Lokma (the “Hello Lokma” contract)

```ts
// lokma-plugin-api (Lokma's public surface — re-exports vendored Cordis + tools + llm types)
export { type Context, Service } from '@lokma/cordis'
export { defineTool } from '@lokma/lokma-tools'
export { LlmAdapter, LlmError, attributionHeaders } from '@lokma/lokma-llm'
export type { ToolExecution, ToolExecutionResult } from '@lokma/lokma-tools'

// A Lokma plugin module — three supported shapes:
//   export function apply(ctx: Context, config: Config) {}
//   export default { name, inject, apply(ctx, config) {} }
//   export default class extends Service { constructor(ctx, name){ super(ctx,name) } }

export const name = 'my-lokma-plugin'
export const inject = ['tools'] // optional — declare services this plugin needs
```

Lokma-specific services to document on first release:

- `ctx.theme` — tokens + `theme/changed` event
- `ctx.sessions` — append-only `SessionEvent` log
- `ctx.agents` — create/resume/get + followup/steer/inject + whenIdle/cancel
- `ctx.tools` — register/restrict/guard + pipeline hooks
- `ctx.llm` — registerAdapter + stream seam
- `ctx.systemPrompt` — section()
- `ctx.skills` / `ctx.commands` / `ctx.goals` / `ctx.compaction`

### 7.5 Distribution & Marketplace (inherit + extend)

Keep DSH's `dsh bundle` / `dsh profile` mechanics and the `dsh.plugin` topic, extended:

- **Npm topic:** `lokma-plugin` (alias-index DSH topic for migrated plugins). Discovery still GitHub topics + generated catalogs.
- **Bundle manifest:** identical — `package.json` + `cordis.patch.yml` with `dsh.bundle` → `lokma.bundle` key (or keep `dsh` key for cross-compat; decide once). Layers resolved by `lokma plugin add`.
- **Git-install caveat:** preserve the `prepare` + `allowBuilds` flow; add a trusted-signing lint if community plugins execute at install time.
- **Marketplace index:** new `https://lokma.sh/registry` (static JSON) maintained via `scripts/gen-lokma-registry.ts` that scrapes `lokma-plugin` topic, validates `lokma.bundle` manifest, and exposes `lokma plugin search` (searxng/local mirror). Does not replace `topic` — it indexes it.
- **Docs generation:** fork `gen-cordis-catalog`, `gen-tool-catalog`, `gen-config-catalog`, `gen-client-catalog` under `lokma-` prefix.

### 7.6 Hard Constraints Lokma Must Carry Forward (audited gates)

Copy the verification scripts rather than reinvent them:

- `pnpm run constraints` / `check-workspace-constraints.ts` — `private:true`, `version == root`, `type:module`, `exports` shape, `files` list exact, `@lokma/cordis` in peer+devDeps.
- `verify-package-invariants`, `verify-cordis-catalog`, `verify-config-catalog`, `verify-cordis-api`, `verify-package-readme-*`, `verify-client-domain-graph`, `verify-cordis-config`, `verify-vendored-links` — all have Lokma analogs.
- `AGENTS.md` / `CONTRIBUTING.md` loading order; `Docs/` as source-of-truth with English commit messages and Turkish user-facing prose (Lokma already commits to this).

### 7.7 Suggested Implementation Sequence

1. **Vendor Cordis** — `vendor/` retarget + `rescope-vendor --apply` + `prepare` rebuild; validate `pnpm run build` + `vendor/cordis/bin.js` launch (`tmp/cordis-tutorial/01-first-plugin.md` hello).
2. **`lokma-boot` bundle** — fork `packages/boot/app-boot` (`profile.ts` + `index.ts`) + `apps/cli` with `lokma` bin and `resolveLokmaHome()`.
3. **`lokma-base` composition** — carve `packages/bundle/base/cordis.patch.yml` down to the first-to-ship rows (session/tools/llm/loop/subprocess+fs+sandbox/jobs + shell-env/web).
4. **Tool seam** — `lokma-tools` (fork of `dsh-tools`) wired; confirm `greet-tool.ts` from tutorial runs through `tools/pre-execute → execute → tools/result`.
5. **Theme seam** — `lokma-theme` service + `omp`/`claude` token maps (`Docs/11-ARASTIRMA-omp-temalar-ve-tasarim.md`) + Ink+Web consumption.
6. **Web app bundle** — fork `dsh-web-app`'s transport + conversation nodes; plug in theme tokens + tool card theming.
7. **Marketplace & publish guide** — `docs/user/develop/basic/publish.md` fork with `lokma-plugin` topic + `lokma plugin search`.

### 7.8 Open Questions to Resolve Before Coding

- **Scope key for Lokma theme:** flat `lokma.bundle` vs keeping `dsh.bundle` for DSH-compat. Keeping `dsh` unblocks `formatjs`/`pnpm` ecosystem reuse; forking cleanly signals Lokma ownership. Pick one and pin in `packages/bundle/README.md`.
- **Token distribution shape:** Schemastery `dict` vs typed palette struct — Schemastery preserves `!!js` Interpolation.
- **Profile default `patchReload`:** keep `live` for `web`, `startup` for `headless` (no reason to diverge).
- **Multi-provider routing:** whether `ctx.llm` wrapper adds Lokma-smart routing (fallback + hash) above DSH's adapter seam or lives as a separate `lokma-router` service intercepting `agent/request`.

---

## Appendix A: Bundle & Service Registry (snapshot of `dsh-base` at 2026-08-31)

**Every row in `lokma-base`'s `cordis.patch.yml` will be one of these 60+ ids.** Lokma should adopt the same id naming (`kebab-case`, prefixed with domain), and ship its own `cordis.patch.yml` as the profile composition source-of-truth.

**Services (consume via `inject`):**

`timer`, `llm`, `session`, `typert`, `sessionTitle`, `agent`, `jobs`, `settings`, `credentials`, `sessionPersistence`, `attachment`, `sessionQuery`, `sessionProjections`, `storage`, `subprocess`, `sandbox`, `permission`, `approval`, `shell`, `shellEnv`, `tools`, `systemPrompt`, `agentLoop`, `fs`, `web`, `skill`, `commands`, `goals`, `compaction`, `workflowEngine`, `theme` *(Lokma-new)*, `cmdlineArgs` *(app overlay)*.

**Events (listen with `ctx.on`; dispatch modes checked by generated `cordis-surface`):**

Session: `session/event` (+ durable `turn/*`, `step/*`, `user/message`, `assistant/*`, `tool/call`, `tool/result`, `compaction/*`).  
Agent: `agent/status`, `agent/created`, `agent/disposed`, `agent/session-start`, `agent/pre-step` (waterfall), `agent/request` (waterfall), `agent/request-error`, `agent/turn-stopping` (serial).  
Agent-loop / presets: `agent-loop/config-start-failed` (emit), `agent-preset/selected` (emit).  
Tools: `tools/pre-execute` (waterfall), `tools/execute` (waterfall — only `signal` mutable), `tools/post-execute` (waterfall), `tools/result` (emit — observe only).  
LLM: `llm/stream` (waterfall).  
FS/approval: `fs/*`, `approval/request` (waterfall).  
System prompt: `system-prompt/assemble` (cooperative waterfall — authoritative).  
HMR: `hmr/config-update-failed` (parallel).  
Logging/telemetry/session-projection carry their own internal events — see `docs/subsystems/*.md` cordis-surface.

---

## Appendix B: Key Files & Links

| Path / URL | What it is |
|------------|-----------|
| `https://github.com/deepseek-ai/deepseek-harness` | Canonical repo (205k★, 23.7k forks, `pnpm@11.7.0`, `node ^22.19 \|\| >=24`) |
| `https://arxiv.org/abs/2608.25512` | Cordis paradigm paper (92pp) |
| `https://deepseek-harness.github.io/deepseek-harness/` | Published docs site (built from `website/`) |
| `docs/cordis-primer.md` | Cordis in Five Ideas + Dispatch Modes + Waterfall Semantics |
| `docs/cordis-tutorial/{01..07}.md` | Hands-on launcher (`vendor/cordis/bin.js` + `node --import tsx`) — runnable copy of §2–§5 |
| `docs/architecture.md` | System map — Cordis → profiles/bundles → turn flow → seams → extension map |
| `docs/user/develop/basic/{index,tool,config,publish}.md` | User plugin path — first plugin → tool → config → bundle install |
| `docs/user/develop/framework/{index,service,events}.md` | Fiber lifecycle, services/isolate, event modes |
| `docs/cookbook/{extension-cookbook,adding-a-package,adding-a-tool,adding-an-llm-adapter}.md` | Reference shapes for hook/UI/tool/adapter/capability |
| `docs/subsystems/{core,tools,session,llm-streaming,scope,conversation}.md` | Generated `cordis-surface` regions: authoritative `ctx.*` + event map |
| `vendor/README.md` | Vendored manifest + all 19 local modifications + sync procedure |
| `packages/bundle/base/cordis.patch.yml` | 130-row base composition — the application |
| `packages/bundle/{web-app,headless,sdk-app,acp-app}/cordis.patch.yml` | Mode-bundle overlays |
| `packages/boot/app-boot/src/{index,profile}.ts` | Profile composition + boot + fail-loud + live patch watching |
| `packages/boot/cmdline/README.md` | App-arg immutability + `parseCmdline` for surface bundles |
| `packages/core/tools/README.md` | Tool registry contract + PTC mode + `presentCall`/`presentResult` |
| `apps/cli/README.md` | Launcher grammar (`dsh web`, `--profile`, `plugin`, `--dump-config`) |
| `website/build.ts` | Docs site build (runs the `gen-*` catalog generators) |

---

*Generated 2026-08-31 for Issue/Task “Lokma web harness plugin system — DSH heritage research”.*  
*Raw markdown — will seed `Docs/raw/dsh-plugin-system.md` after human review.*
*Word count of this file: ~1400 lines / ~12k words. Input to next stage: slim to `Docs/13-ARASTIRMA-deepseek-harness-plugin-sistemi.md` with Lokma decisions.*
