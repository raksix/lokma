# Web Stack Alternatives — Decision Matrix

> **Purpose:** Present concrete stack options for the Lokma Web Harness so you can decide. No implementation — just analysis and a recommendation.
> **Status 2026-09-01:** Stack A **switched to Vite 6** per your request ("vite'a çevirek"). Previously Next.js 15 (2026-08-31) → now Vite 6 + React 19 (DeepSeek Harness pattern). This doc is the updated matrix.
> **How to use:** Read the matrix, pick a row, tell me. I scaffold that stack.

## 1. Frontend Framework

| Option | Pros | Cons | Bundle (est.) | SSE/WS | DX | Verdict |
|--------|------|------|---------------|--------|----|---------|
| **Vite 6 + React 19 + Tailwind v4 — ✅ Selected (2026-09-01)** | Pure SPA, no SSR/RSC overhead, fastest HMR (esbuild), smallest bundle, proven by DeepSeek Harness (`@vitejs/plugin-react` + Vite 6), shadcn/ui + Tailwind v4 first-class, `server/dist` + `web/dist` static via nginx/PM2. | No SSR (not needed for harness — it's an app, not a marketing site). API must live in Fastify (already does). | ~90kb JS (vs ~180kb Next) | ✅ via Fastify WS + Vite proxy `/api` → `:3456` | ⭐⭐⭐⭐⭐ | **Selected** |
| **Next.js 15 (App Router) + Tailwind + React 19** | Largest ecosystem, Vercel deploy, built-in API routes, Turbopack, `next/font`, shadcn/ui ready. | Heavier (~180kb), RSC complexity, WS needs custom server anyway (we already have Fastify), build slower. | ~180kb JS | ✅ native but WS still via Fastify | ⭐⭐⭐⭐⭐ | Superseded — was pick 2026-08-31, switched to Vite 2026-09-01 |
| **SvelteKit 2 + Tailwind** | Smallest bundle, fastest runtime, simplest reactivity. | Smaller plugin ecosystem, fewer hiring pool, shadcn-svelte less mature, not React. | ~90kb | ✅ via `+server.ts` + `ws` | ⭐⭐⭐⭐ | Strong alt if you want minimal JS & leave React |
| **Remix (React Router v7)** | Excellent data loading (loader/action), nested routes fit pane system well, SSR by default. | Smaller community than Next.js, fewer UI libs. | ~160kb | ✅ | ⭐⭐⭐⭐ | Good if you dislike RSC |
| **Astro 4 + React islands** | Minimal JS by default (islands), great for docs/marketing + app hybrid. | Overkill for app-heavy harness, interactivity islands add complexity. | ~60kb (docs) / ~180kb (app islands) | ⚠️ needs custom WS | ⭐⭐⭐ | Best for marketing, not harness |

**Recommendation 2026-09-01:** **Vite 6 + React 19** — you run Fastify on `:3456` already (harness owns API + WS), so Next.js SSR is dead weight. DeepSeek Harness proves Vite SPA + Fastify (or `dsh` Node server) is the ideal harness shape: `vite build` → `web/dist/` static + `vite dev --proxy /api → :3456` for local, `nginx → /api → Fastify` + `nginx → / → web/dist` in prod. Tailwind v4 + shadcn/ui work identically in Vite (`@tailwindcss/vite`). Fastest to MVP now.

## 2. Backend API Server

| Option | Pros | Cons | WS/SSE | Ecosystem | Verdict |
|--------|------|------|--------|-----------|---------|
| **Fastify 5 + @fastify/websocket** | Fastest Node HTTP (2x Express), schema validation (Zod/Ajv), great WS/SSE plugins, used by Sunumly & notes.fermag on 67. | More boilerplate than Hono for simple routes. | ✅ `@fastify/websocket`, `@fastify/sse` | ⭐⭐⭐⭐⭐ | **Recommended — stays** |
| **Hono (Bun) + Bun.serve WS** | Ultra-fast on Bun, tiny, great DX, works on edge. | Bun-only for best perf, fewer Fastify plugins, newer. | ✅ `Bun.serve` WS | ⭐⭐⭐⭐ | Choose if you go all-in on Bun |
| **NestJS 11** | Enterprise, decorators, great for plugin system (modules). | Heavy, over-engineered for harness MVP, slower. | ✅ via `@nestjs/websockets` | ⭐⭐⭐ | Only if you want Nest modules for plugins |
| **Next.js Route Handlers only** | No separate server, deploy anywhere. | WS needs custom server anyway, API logic bloats `app/`. | ⚠️ WS needs `server.js` | ⭐⭐⭐ | Avoid — harness needs dedicated WS server (even more so with Vite) |

**Recommendation:** **Fastify 5** — unchanged. Proven on your infra (67), Zod schemas shared via `lokma-shared`, WS per session, SSE fallback. Works identically with Vite (`vite.config.ts` proxy) or Next rewrites; Vite proxy is simpler (`/api` + `/ws` → Fastify).

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

**Recommendation:** **flexlayout-react** — no change. It is literally what VS Code / JetBrains web IDEs use conceptually. Model-driven (`{ layout: { type: "row", children: [...] } }`), supports:
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

**Recommendation:** **WebSocket for agent loop** (`/ws/:sessionId` — bidirectional: client sends `prompt`/`abort`/`permission_response`, server streams `text_delta`/`tool_start`/`tool_result`), **SSE as fallback** for one-shot `POST /api/chat` (stream-json). This matches Claude Code SDK (`--output-format stream-json`) and DeepSeek Harness (`session/event` stream). Vite dev proxy forwards `/ws` to Fastify identically to Next rewrites.

## 6. Other Key Choices

| Area | Recommended | Alternative |
|------|-------------|-------------|
| **Styling** | Tailwind v4 + shadcn/ui (Vite via `@tailwindcss/vite`, no `next/font`) | Vanilla CSS / UnoCSS |
| **Terminal** | `xterm.js` + `xterm-addon-fit` + `xterm-addon-web-links` (proven) | `terminal.js` (lighter, less) |
| **Code editor** | `monaco-editor` (VS Code) for file preview & diff | `codemirror 6` (lighter, good) |
| **File tree** | `shadcn` + `react-arborist` (virtualized tree, drag-drop) | Custom `ul` + `dnd-kit` |
| **Browser preview** | `iframe` + harness-driven CDP (like Claude Code Chrome ext) | `playwright` headless behind API |
| **Charts (usage)** | `recharts` (you use it) or `visx` | `chart.js` |
| **Auth** | `lokma auth` token → httpOnly cookie + `Authorization: ***` | Clerk / Auth.js |
| **DB (web)** | SQLite (local) / Postgres (cloud) via `drizzle-orm` | Prisma (heavier) |
| **Validation** | `zod` shared (`lokma-shared`) — single source of truth | `arktype` / `valibot` |

## 7. Decision Matrix — One Line Per Stack

| Stack | Frontend | Backend | Pane | State | Realtime | Bundle | Best for |
|-------|----------|---------|------|-------|----------|--------|----------|
| **A — ✅ Selected (Vite)** | **Vite 6 + React 19** | Fastify 5 | flexlayout-react | Zustand | WS + SSE | **~170kb** | **Fastest to MVP, no SSR, DSH-proven** |
| **A-legacy** | Next.js 15 | Fastify 5 | flexlayout-react | Zustand | WS + SSE | ~260kb | Was pick 2026-08-31, superseded |
| **B — Minimal JS** | SvelteKit | Hono (Bun) | flexlayout | Zustand | WS | ~150kb | Smallest bundle, Bun-native |
| **C — Custom panes** | Vite 6 + React 19 | Fastify 5 | dnd-kit + Resizable | Zustand | WS + SSE | ~150kb + custom | Max design control |
| **D — Enterprise** | Vite 6 + React 19 | NestJS | flexlayout | Redux | WS | ~280kb | Teams / RBAC / modules |

## 8. My Recommendation (Stack A — Vite)

```
Frontend:  Vite 6 + React 19 + Tailwind v4 + shadcn/ui + @vitejs/plugin-react
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
Build:     vite build → web/dist/ static (nginx) + Fastify :3456 (PM2)
Dev:       vite dev --port 3457 --proxy /api + /ws → :3456
```

Why Vite now: you already run Fastify WS on `:3456` for the harness, so Next.js SSR/RSC gives you nothing but bundle weight and a second Node server. Vite SPA is exactly what DeepSeek Harness ships (`apps/web` = `vite build` + `pnpm dsh web` serves `dist/`), builds in ~2s vs ~12s, HMR <50ms, and `shadcn/ui` + `Tailwind v4` are Vite-native since `tailwindcss@4` + `@tailwindcss/vite`. Same PM2+nginx on 67, just `web/dist` instead of `.next`.

## 9. What I Need From You

Reply with one of:

- **`A`** — Vite — scaffold it (selected 2026-09-01).
- **`B`** — Minimal (SvelteKit + Hono) — I scaffold it.
- **`C`** — Custom panes (Vite + dnd-kit) — I scaffold it.
- **`D`** — Enterprise (NestJS) — I scaffold it.
- **Mix** — e.g. "A but with Hono" or "Vite but with rc-dock" — I mix.

No decision = no scaffold. Your call.

---

*Next: `22-WEB-FEATURES-provider-model-session.md` — what the web can do.*
