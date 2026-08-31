# Plugin System — DeepSeek Cordis-Inspired, Adapted for Lokma

> **Inspiration:** DeepSeek Harness (`deepseek-ai/deepseek-harness`) — *Everything is a Plugin*, powered by **Cordis** (*A Programming Paradigm for Spatiotemporal Composability*).
> **Lokma take:** Same philosophy, lighter implementation. No vendored Cordis fork — we adapt the ideas with our own small kernel.

## 1. Why Everything Is a Plugin

DeepSeek Harness proved: if every capability is a plugin, every capability is replaceable without patching a privileged core.

In Lokma:

- The model adapter is a plugin (`@lokma/plugin-llm-anthropic`).
- The tool registry is a plugin (`@lokma/plugin-tools`).
- The session store is a plugin (`@lokma/plugin-sessions`).
- The pane layout is a plugin (`@lokma/plugin-pane`).
- A theme is a plugin (`@lokma/theme-omp`).

No `if (provider === 'anthropic')` in core. No `switch (tool)` in the loop. Just services and events.

## 2. Cordis in Five Ideas (Primer)

From `deepseek-ai/deepseek-harness/docs/cordis-primer.md`:

1. **A plugin is an object that implements `Service`.** Either a function with `inject` + `apply(ctx)` or a `Service` subclass. Cordis mounts its lifecycle into the context.
2. **A context is a repository of services.** A service claims `ctx.tools`, `ctx.llm`, `ctx.sessions` — others find it by key, not by import.
3. **`inject` declares dependencies.** `inject: ['llm', 'tools']` → Cordis waits until `ctx.llm` and `ctx.tools` exist before mounting. Load order = dependency graph, not manual sequencing.
4. **Typed events for communication.** `ctx.on('tools/pre-execute', handler)` with dispatch modes: `emit` (observe), `waterfall` (middleware, `next()`), `parallel` (fan-out), `serial` (ordered), `bail` (first winner).
5. **Registrations are reversible effects.** `ctx.effect(() => { ... return dispose })` — reload/teardown unwinds them predictably. No leaked listeners.

Dispatch modes:

| Mode | Awaited | Order | Return | Use |
|------|---------|-------|--------|-----|
| `emit` | No | registration | No | Observe (logging, telemetry) |
| `waterfall` | No | registration | Yes | Middleware (`agent/pre-step`: rewrite messages or `next()`) |
| `parallel` | Yes | parallel | No | Fan-out (notify all) |
| `serial` | Yes | registration | Yes | Ordered pipeline |
| `bail` | No | until bail | Yes | First decision wins (permission) |

`waterfall` is the key: `ctx.waterfall('agent/pre-step', (msgs, next) => { if (bad) return without next(); return next(modified) })` — cooperative, composable.

## 3. Lokma Plugin Kernel (Lightweight Cordis)

We do **not** vendor Cordis. We build a ~300-line kernel with the same semantics:

```ts
// packages/lokma-core/src/plugin/kernel.ts
type ServiceKey = string // "llm" | "tools" | "sessions" | "pane" | ...

interface Plugin {
  id: string // "@lokma/plugin-llm-anthropic"
  inject?: ServiceKey[] // dependencies
  apply(ctx: Context): void | (() => void) // return disposer
}

class Context {
  private services = new Map<ServiceKey, unknown>()
  private listeners = new Map<string, Function[]>()
  private effects: (() => void)[] = []

  provide<K>(key: ServiceKey, service: K) { this.services.set(key, service) }
  get<K>(key: ServiceKey): K { return this.services.get(key) as K }

  on(event: string, handler: Function) { /* register */ return () => off() }
  emit(event: string, ...args: unknown[]) { /* emit */ }
  waterfall(event: string, ...args: unknown[]) { /* waterfall with next() */ }

  effect(fn: () => (() => void)) { const d = fn(); this.effects.push(d); return d }

  mount(plugin: Plugin) {
    // wait for inject, then apply, collect disposer
  }
  unmount(id: string) { /* reverse effects */ }
}
```

Profiles & bundles (from DeepSeek Harness `architecture.md`):

- **Bundle:** a distribution unit — `package.json` has `"lokma": { "bundle": "pane" }` or `"profile": ["base"]`. A bundle's `lokma.plugin.yml` lists the plugins it contributes.
- **Profile:** a named composition — `web`, `cli`, `headless`. Lists which bundles it stacks. `web` = `base` + `web-app`. Stored in `~/.lokma/profiles/<name>/`.
- **Patch:** `cordis.patch.yml` (or `lokma.patch.yml`) — override any plugin's config/disabled without forking the bundle. Layers: bundle order → profile patch → home patch → `--patch` CLI flag. `dsh --dump-config` equivalent: `lokma --dump-config`.

## 4. Plugin Types in Lokma

| Type | Example | Provides | Events |
|------|---------|----------|--------|
| **LLM Provider** | `@lokma/plugin-llm-anthropic`, `-openai`, `-ollama` | `ctx.llm` (stream, models) | `llm/stream` (waterfall) |
| **Tool** | `@lokma/plugin-tools` (Read, Edit, Bash…), `@lokma/plugin-mcp` | `ctx.tools` (registry) | `tools/pre-execute`, `tools/execute`, `tools/post-execute` |
| **Session** | `@lokma/plugin-sessions` | `ctx.sessions` (CRUD, JSONL) | `session/event`, `session/fork` |
| **Pane / UI** | `@lokma/plugin-pane`, `@lokma/plugin-file-tree`, `@lokma/plugin-terminal` | `ctx.pane` (layout, border) | `pane/drop`, `pane/resize` |
| **Theme** | `@lokma/theme-omp`, `-claude`, `-midnight` | `ctx.theme` (tokens) | `theme/change` |
| **Command** | `@lokma/plugin-commands` (`/clear`, `/model`) | `ctx.commands` | `command/dispatch` |
| **Hook runner** | `@lokma/plugin-hooks` | `ctx.hooks` | `hook/*` |
| **Git** | `@lokma/plugin-git` | `ctx.git` | `git/*` |

## 5. Plugin Lifecycle

```
Install → Enable → Mount → Apply → (effects, events) → Unmount → Disable → Uninstall
```

- **Install:** `lokma plugin install @lokma/theme-omp` or `lokma plugin add https://github.com/user/my-lokma-plugin` — downloads to `~/.lokma/plugins/<id>/`, or `npm i @lokma/theme-omp`.
- **Enable/Disable:** `lokma plugin enable @lokma/theme-omp` / `disable` — toggles `disabled: true` in `lokma.patch.yml`, no reinstall. Web: toggle switch in `Settings → Plugins`.
- **Mount:** At boot, kernel reads the profile's bundle list + patches, topologically sorts by `inject`, mounts in order. `inject` missing → wait (or error if cycle).
- **Apply:** Plugin's `apply(ctx)` runs, calls `ctx.provide()`, `ctx.on()`, `ctx.effect()`. Returns disposer for cleanup.
- **Hot reload:** `lokma plugin reload` or file watcher on `lokma.patch.yml` — unmount + remount without restart (web profile is live; headless is not, same as DSH).

## 6. Plugin Manifest

```yaml
# lokma.plugin.yml (in plugin package root)
id: "@lokma/theme-omp"
version: "0.1.0"
displayName: "OMP Theme"
description: "Near-black + indigo theme inspired by OMP"
type: "theme"
inject: ["theme"]          # wait for theme service
contributes:
  themes:
    - path: "./themes/omp.json"
  commands:
    - id: "theme.setOmp"
      title: "Set OMP theme"
```

```json
// package.json
{
  "name": "@lokma/theme-omp",
  "lokma": { "bundle": "theme" }
}
```

## 7. Example: A Tool Plugin

```ts
// packages/plugin-tools/src/index.ts
export const plugin: Plugin = {
  id: "@lokma/plugin-tools",
  apply(ctx) {
    const registry = new ToolRegistry()
    ctx.provide("tools", registry)

    // Register built-ins as effects (reversible)
    ctx.effect(() => {
      registry.register({ name: "Read", handler: readHandler, schema: ReadSchema })
      registry.register({ name: "Bash", handler: bashHandler, schema: BashSchema })
      return () => { registry.unregister("Read"); registry.unregister("Bash") }
    })

    // Intercept every tool call (waterfall)
    ctx.on("tools/pre-execute", async (call, next) => {
      if (call.name === "Bash" && call.input.command.includes("rm -rf /")) {
        return { error: "Blocked: destructive command" } // short-circuit, no next()
      }
      return next(call)
    })
  }
}
```

## 8. Example: A Theme Plugin

```ts
export const plugin: Plugin = {
  id: "@lokma/theme-omp",
  inject: ["theme"],
  apply(ctx) {
    const themeService = ctx.get<ThemeService>("theme")
    return ctx.effect(() => {
      themeService.register("omp", {
        colors: { background: "#0a0a0f", foreground: "#e4e4e7", accent: "#6366f1" },
        tui: { prompt: "#6366f1", diff: { add: "#10b98122" } }
      })
      return () => themeService.unregister("omp")
    })
  }
}
```

## 9. Web Plugin Manager UI

**Location:** `Settings → Plugins`

- **Installed list:** Card per plugin — `id`, `version`, `type` pill, `enabled` toggle, `description`, `Open` (if UI plugin) / `Remove`.
- **Marketplace:** `Browse Plugins` → fetch from `https://plugins.lokma.sh/api/plugins` (or GitHub `lokma-plugin` topic), `Install` button.
- **Add from URL:** `+ Add from URL` → input `https://github.com/user/my-plugin` → `Install`.
- **Patch viewer:** `Advanced → View effective config` → `lokma --dump-config` output, copyable.

## 10. Lokma vs DeepSeek Harness — Adaptations

| DSH | Lokma |
|-----|-------|
| Vendored Cordis (full) | Lightweight kernel (~300 lines), same semantics, no vendor fork |
| `pnpm` + `dsh` CLI + `dsh-base` bundles | `bun` + `lokma` CLI + `lokma-base` bundles |
| `cordis.patch.yml` + `dsh --dump-config` | `lokma.patch.yml` + `lokma --dump-config` |
| Profiles: `web`, `headless`, `sdk`, `acp` | Profiles: `web`, `cli`, `headless` (desktop later) |
| Python SDK via `dsh --profile sdk` | Same idea later (Python harness via `lokma --profile sdk`) |
| 205k stars, 14k commits | Starting fresh, MIT, community plugins via `lokma-plugin` GitHub topic |

The key takeaway from DSH: **if everything is a plugin, the core is just a context**. Forks become patches, not forks.

---

*Next: `24-WEB-PANE-SYSTEM-and-orchestration.md` — panes, sidebars, drag-drop, orchestration.*
