# Web Stack Alternatives — Decision Matrix

> **Purpose:** Present concrete stack options for the Lokma Web Harness so you can decide. No implementation — just analysis and a recommendation.
> **How to use:** Read the matrix, pick a row, tell me. I scaffold that stack.

## 1. Frontend Framework

| Option | Pros | Cons | Bundle (est.) | SSE/WS | DX | Verdict |
|--------|------|------|---------------|--------|----|---------|
| **Next.js 15 (App Router) + Tailwind + React 19** | Largest ecosystem, best docs, Vercel deploy, built-in API routes, Turbopack, `next/font`, shadcn/ui ready. Closest to `claude.ai/code`. | Heavier, RSC complexity if overused. | ~180kb JS | ✅ native (Route Handlers + WS via custom server) | ⭐⭐⭐⭐⭐ | **Recommended** |
| **SvelteKit 2 + Tailwind** | Smallest bundle, fastest runtime, simplest reactivity, great for pane-heavy UIs. | Smaller plugin ecosystem, fewer hiring pool, shadcn-svelte less mature. | ~90kb | ✅ via `+server.ts` + `ws` | ⭐⭐⭐⭐ | Strong alt if you want minimal JS |
| **Remix (React Router v7)** | Excellent data loading (loader/action), nested routes fit pane system well, SSR by default. | Smaller community than Next.js, fewer UI libs, Vercel bias less. | ~160kb | ✅ | ⭐⭐⭐⭐ | Good if you dislike Next.js RSC |
| **Astro 4 + React islands** | Minimal JS by default (islands), great for docs/marketing + app hybrid. | Overkill for app-heavy harness, interactivity islands add complexity. | ~60kb (docs) / ~180kb (app islands) | ⚠️ needs custom WS | ⭐⭐⭐ | Best for marketing, not harness |

**Recommendation:** **Next.js 15** — you already run Next.js on 67 (Randevona, notes.fermag, Sunumly), PM2 + nginx pattern proven, shadcn/ui + Tailwind v4 ready, and the harness needs rich interactivity (chat, panes, terminal) where React 19 shines.

## 2. Backend API Server

| Option | Pros | Cons | WS/SSE | Ecosystem | Verdict |
|--------|------|------|--------|-----------|---------|
| **Fastify 5 + @fastify/websocket** | Fastest Node HTTP (2x Express), schema validation (Zod/Ajv), great WS/SSE plugins, used by Sunumly & notes.fermag on 67. | More boilerplate than Hono for simple routes. | ✅ `@fastify/websocket`, `@fastify/sse` | ⭐⭐⭐⭐⭐ | **Recommended** |
| **Hono (Bun) + Bun.serve WS** | Ultra-fast on Bun, tiny, great DX, works on edge. | Bun-only for best perf, fewer Fastify plugins, newer. | ✅ `Bun.serve` WS | ⭐⭐⭐⭐ | Choose if you go all-in on Bun |
| **NestJS 11** | Enterprise, decorators, great for plugin system (modules). | Heavy, over-engineered for harness MVP, slower. | ✅ via `@nestjs/websockets` | ⭐⭐⭐ | Only if you want Nest modules for plugins |
| **Next.js Route Handlers only** | No separate server, deploy anywhere. | WS needs custom server anyway, API logic bloats `app/`. | ⚠️ WS needs `server.js` | ⭐⭐⭐ | Avoid — harness needs dedicated WS server |

**Recommendation:** **Fastify 5** — proven on your infra (67), Zod schemas shared via `lokma-shared`, WS per session, SSE fallback, same pattern as Sunumly (`4401`) and notes.fermag (`3008`).

If you want Bun-native speed, Hono is the alternative — say the word.

## 3. Pane / Layout System

This is the most opinionated choice. Your spec: draggable, resizable, left/right sidebars (collapsible, reorderable), file browser + live terminal + browser preview, drag session into session.

| Option | What it is | Drag | Resize | Sidebar | Nested | Bundle | Verdict |
|--------|------------|------|--------|---------|--------|--------|---------|
| **flexlayout-react** | Dock-style IDE layout (VS Code-like), JSON model, tabsets, drag-drop, border tabs. | ✅ | ✅ | ✅ (borders) | ✅ | ~80kb | **Recommended** |
| **rc-dock** | Similar to flexlayout, lighter, tab & panel dock. | ✅ | ✅ | ✅ | ✅ | ~60kb | Strong alt, less mature |
| **react-mosaic** | Tiling window manager (like i3), binary tree, great for 2-4 panes. | ✅ | ✅ | ❌ (needs custom) | ✅ | ~40kb | Great for chat+code split, weak for IDE-style |
| **allotment** | Simple split panes (VS Code's splitter), no drag tabs. | ❌ | ✅ | ❌ | ✅ | ~15kb | Too simple for your spec |
| **shadcn Resizable + dnd-kit** | Custom: `ResizablePanelGroup` + `dnd-kit` for drag, you build the rest. | ✅ (dnd-kit) | ✅ | ✅ (custom) | ✅ | ~30kb + custom | Max control, max work |
| **Golden Layout** | Classic IDE layout, mature, but jQuery-era DNA, React wrapper laggy. | ✅ | ✅ | ✅ | ✅ | ~100kb | Avoid — legacy |

**Recommendation:** **flexlayout-react** — it is literally what VS Code / JetBrains web IDEs use conceptually. Model-driven (`{ layout: { type: "row", children: [...] } }`), supports:
- Left border: Sessions / Projects / Chats (reorderable, collapsible)
- Center: Chat + Code panes (tabsets, drag session into session = tab drop)
- Right border: File Browser / Terminal Logs / Browser Preview (tabsets)
- Drag any tab to any zone, pop-out, maximize, save/restore layout to `localStorage`

If you want minimal custom, `flexlayout-react` is the answer. If you want max control, say "custom with dnd-kit" and I build it from `ResizablePanelGroup`.

## 4. State Management

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Zustand 5** | Minimal (1kb), no boilerplate, great for session/chat state, devtools. | No built-in selectors like Redux. | **Recommended** |
| **Jotai** | Atomic, great for pane layout atoms, fine-grained. | More atoms to manage, less conventional. | Alt if you love atoms |
| **Redux Toolkit** | Proven, time-travel, but verbose. | Overkill for harness MVP. | Avoid unless you need RTK Query |
| **Valtio** | Proxy, mutable DX, simple. | Less ecosystem. | Niche |

**Recommendation:** **Zustand** — one store per domain (`useSessionStore`, `usePaneStore`, `useProviderStore`), persist layout to `localStorage`, no ceremony.

## 5. Real-Time: WebSocket vs SSE vs tRPC

| Option | Direction | Reconnect | Throughput | Complexity | Verdict |
|--------|-----------|-----------|------------|------------|---------|
| **WebSocket (ws)** | Bidirectional | Manual (or `reconnecting-websocket`) | High (binary, multiplex) | Medium | **Recommended for agent events** |
| **SSE (EventSource)** | Server → client | Auto (browser) | Medium (text) | Low | Good fallback / for `GET /api/chat` streaming |
| **tRPC + WS** | Bidirectional (typed) | Via adapter | High | Medium (needs tRPC) | Add later if you want end-to-end types |
| **Long polling** | Client → server | N/A | Low | Low | Avoid — legacy |

**Recommendation:** **WebSocket for agent loop** (`/ws/:sessionId` — bidirectional: client sends `prompt`/`abort`/`permission_response`, server streams `text_delta`/`tool_start`/`tool_result`), **SSE as fallback** for one-shot `POST /api/chat` (stream-json). This matches Claude Code SDK (`--output-format stream-json`) and DeepSeek Harness (`session/event` stream).

## 6. Other Key Choices

| Area | Recommended | Alternative |
|------|-------------|-------------|
| **Styling** | Tailwind v4 + shadcn/ui (you love it: Randevona, TaskDrome, Sunumly) | Vanilla CSS / UnoCSS |
| **Terminal** | `xterm.js` + `xterm-addon-fit` + `xterm-addon-web-links` (proven) | `terminal.js` (lighter, less) |
| **Code editor** | `monaco-editor` (VS Code) for file preview & diff | `codemirror 6` (lighter, good) |
| **File tree** | `shadcn` + `react-arborist` (virtualized tree, drag-drop) | Custom `ul` + `dnd-kit` |
| **Browser preview** | `iframe` + harness-driven CDP (like Claude Code Chrome ext) | `playwright` headless behind API |
| **Charts (usage)** | `recharts` (you use it) or `visx` | `chart.js` |
| **Auth** | NextAuth-ish: `lokma auth` token → httpOnly cookie + `Authorization: Bearer` | Clerk / Auth.js |
| **DB (web)** | SQLite (local) / Postgres (cloud) via `drizzle-orm` | Prisma (heavier) |
| **Validation** | `zod` shared (`lokma-shared`) — single source of truth | `arktype` / `valibot` |

## 7. Decision Matrix — One Line Per Stack

| Stack | Frontend | Backend | Pane | State | Realtime | Bundle | Best for |
|-------|----------|---------|------|-------|----------|--------|----------|
| **A — Recommended** | Next.js 15 | Fastify 5 | flexlayout-react | Zustand | WS + SSE | ~260kb | **Fastest to MVP, proven on your infra** |
| **B — Minimal JS** | SvelteKit | Hono (Bun) | flexlayout | Zustand | WS | ~150kb | Smallest bundle, Bun-native |
| **C — Custom panes** | Next.js 15 | Fastify 5 | dnd-kit + Resizable | Zustand | WS + SSE | ~210kb + custom | Max design control |
| **D — Enterprise** | Next.js 15 | NestJS | flexlayout | Redux | WS | ~340kb | Teams / RBAC / modules |

## 8. My Recommendation (Stack A)

```
Frontend:  Next.js 15 (App Router) + React 19 + Tailwind v4 + shadcn/ui
Backend:   Fastify 5 + @fastify/websocket + Zod (lokma-shared)
Pane:      flexlayout-react (IDE-style, model-driven, drag-drop)
State:     Zustand 5 (per-domain stores, localStorage persist)
Realtime:  WebSocket (agent loop) + SSE fallback (one-shot)
Terminal:  xterm.js
Editor:    monaco-editor
Tree:      react-arborist
Charts:    recharts
DB:        drizzle-orm + SQLite (local) / Postgres (cloud)
Validate:  zod
```

Why: You already run this exact shape on 67 (Next.js + Fastify + PM2 + nginx + shadcn). Least risk, fastest to `lokma web` MVP, easiest to hire for, and flexlayout gives you the IDE-grade pane system you specced without building it from scratch.

## 9. What I Need From You

Reply with one of:

- **`A`** — Recommended (Next.js + Fastify + flexlayout) — I scaffold it.
- **`B`** — Minimal (SvelteKit + Hono) — I scaffold it.
- **`C`** — Custom panes (Next.js + dnd-kit) — I scaffold it.
- **`D`** — Enterprise (NestJS) — I scaffold it.
- **Mix** — e.g. "A but with Hono" or "Next.js but with rc-dock" — I mix.

No decision = no scaffold. Your call.

---

*Next: `22-WEB-FEATURES-provider-model-session.md` — what the web can do.*
