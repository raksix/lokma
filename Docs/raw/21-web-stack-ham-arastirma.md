# Lokma Web Harness — Web Stack Alternatives Research

*Date: 2026-08-31 · Status: RAW research for user decision · Target: agentic harness with real-time streaming, file browser, terminal (xterm.js), drag-drop panes*

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Frontend Stacks](#2-frontend-stacks)
   - 2.1 Next.js 15 + Tailwind CSS
   - 2.2 SvelteKit 2 + Tailwind
   - 2.3 Remix / React Router v7 (Framework Mode)
   - 2.4 Astro 5
3. [Backend Stacks](#3-backend-stacks)
   - 3.1 Fastify 5 (Node)
   - 3.2 Hono + Bun
   - 3.3 NestJS 11
4. [Pane / Layout Systems](#4-pane--layout-systems)
   - 4.1 react-mosaic
   - 4.2 rc-dock
   - 4.3 flexlayout-react
   - 4.4 allotment
   - 4.5 Custom CSS Grid + dnd-kit
5. [State Management](#5-state-management--zustand-vs-jotai-vs-redux-toolkit)
6. [Real-time Transport](#6-real-time-transport--websocket-vs-sse-vs-trpc)
7. [Decision Matrix](#7-decision-matrix)
8. [Cross-cutting Concerns for an Agentic Harness](#8-cross-cutting-concerns-for-an-agentic-harness)
9. [Recommendation Tiers for Lokma](#9-recommendation-tiers-for-lokma)
10. [Sources & Measurement Notes](#10-sources--measurement-notes)

---

## 1. Executive Summary

Lokma web harness is **not a marketing site**. It is an agentic harness: long-lived sessions, token-by-token LLM streaming, a file browser that must reflect FS changes instantly, a full terminal (xterm.js + PTY), multi-pane drag-drop workspace (think VS Code / OpenHands), and persistent layout across reloads.

That workload stresses three axes most stacks are not optimized for simultaneously:

| Axis | What it demands |
|------|-----------------|
| **Streaming** | Low-latency, back-pressured, reconnect-safe token stream to 1–N panes |
| **Layout** | Resizable, dockable, floatable, serializable pane tree with terminal + editor + chat co-existing |
| **State** | Fine-grained updates (one token, one FS event) without re-rendering the whole harness |

**One-line takeaways before you read 400 lines:**

- **Frontend default: Next.js 15 + Tailwind** if you want hiring, ecosystem, and Vercel escape velocity. **SvelteKit** if you want the smallest bundle and are willing to leave React ecosystem. **Remix/React Router v7** only if you love web-standards purism and nested loaders. **Astro is wrong** for this product (content-site optimizer, not SPA harness).
- **Backend default: Fastify** for Node maximal compatibility. **Hono + Bun** if you want 2–3× req/s and are comfortable with Bun in prod. **NestJS** only if you need strict enterprise layering and can pay the abstraction tax.
- **Panes: flexlayout-react** is the most VS Code-like and actively maintained; **rc-dock** is close second; **react-mosaic** is simpler but tiling-only; **allotment** is only split panes (needs composition); **custom grid + dnd-kit** is maximum control, maximum cost.
- **State: Zustand** for this use case — 1.1 kB, selector slices, no Provider hell, works with ephemeral stream state.
- **Realtime: SSE for LLM tokens (simple, HTTP/2, auto-reconnect via fetch), WebSocket for terminal PTY (bidirectional), tRPC as optional typed RPC layer on top — not a transport replacement.**

No stack is disqualifying; the cost is *where* you pay: bundle, ecosystem, ops, or build time.

---

## 2. Frontend Stacks

### 2.1 Next.js 15 + Tailwind CSS 4

**What it is:** React 19 + App Router + React Server Components (RSC) + Turbopack (stable `next dev --turbo`) + file-system routing. Tailwind 4 is CSS-first, no config required for most setups.

**Bundle size**

- Baseline (App Router, one interactive route): **~85–130 KB gzipped First Load JS** before app code; **~240 KB typical production app** (includes React 19 ~42–45 KB, Next runtime, RSC client manifest). With aggressive Server Components the client JS can drop 30–50% (measured: 247 KB → 156 KB in an e-com migration; 245 KB → 128 KB in another case study, −48%).
- Turbopack dev startup up to **76% faster**, Fast Refresh up to **96% faster** vs Webpack — matters for harness iteration speed.
- Bundle analyzer: `@next/bundle-analyzer` (Webpack) + experimental Turbopack analyzer; `optimizePackageImports` auto-tree-shakes large libs.

**DX**

- **Pros:** Largest hiring pool; every shadcn/ui, xterm.js, Monaco, react-resizable-panels example assumes React/Next. App Router layouts + parallel routes + intercepting routes map cleanly to pane slots. `loading.tsx`/`Suspense` give streaming SSR for free. Middleware, Route Handlers, Server Actions cover most harness RPC without a separate backend if you want BFF. Turbopack HMR is the fastest React DX in 2025-26.
- **Cons:** RSC mental model is genuinely hard (client vs server boundary, serialization limits). Caching defaults (`fetch` cached, `cookies()` opts out) surprise newcomers. Build output is Vercel-optimized; self-hosting needs `output: 'standalone'` + careful `serverExternalPackages`. Turbopack disk cache still maturing vs Webpack.

**SSE / WS support**

- **SSE:** Excellent. Route Handlers can `return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })`. App Router also supports `ReadableStream` streaming via Server Components. Works with `fetch` + `TextDecoder` streaming on client. No extra deps.
- **WS:** No native WS server in Next.js. Pattern is: Next.js for HTTP + separate WS server (Fastify/Hono/Bun or standalone `ws`/`partysocket`). `next.config.js` `rewrites` can proxy `/ws`. Alternatively deploy WS as separate service and connect directly. Edge runtime cannot hold WS (use Node runtime for those routes).
- **tRPC/SSE libs:** `trpc-openapi`, Vercel AI SDK `useChat` (SSE under hood) all first-class.

**Ecosystem**

- Biggest: shadcn/ui, Radix, Headless UI, Monaco editor, xterm.js, CodeMirror, react-dnd, dnd-kit, TanStack Table/Query, Zustand — all assume React. Vercel AI SDK, LangChain.js, AI SDK RSC all target Next.js first.
- Tailwind 4: Oxide engine, CSS-first, 5–10× faster builds than v3, container queries, `@theme` directive.

**Fit for agentic harness**

- **Why fit:** File browser + terminal + streaming chat are all React component problems with massive prior art. Layout libs (flexlayout, rc-dock) are React-only. Server Components let you keep file-tree DB queries on server (zero client JS) while chat stays interactive. SSE streaming via Route Handler is trivial. Deployment story (Vercel, Docker standalone, or self-hosted) is solved.
- **Why not:** You ship React runtime even when harness is mostly static chrome. If bundle budget is <100 KB you will fight it. RSC complexity is overhead if harness is purely client SPA with no SEO/content. Lock-in to Vercel conventions if you don't discipline config.

**Verdict for Lokma:** **Strong fit — default choice if team knows React.** The cost is React runtime + RSC learning, paid back in ecosystem and hiring.

---

### 2.2 SvelteKit 2 (Svelte 5 Runes)

**What it is:** Svelte 5 compiler (no virtual DOM) + SvelteKit meta-framework + Vite + filesystem routing + adapters (Node, Cloudflare, Vercel, static). Svelte 5 introduces Runes (`$state`, `$derived`, `$effect`) replacing stores for local reactivity.

**Bundle size**

- Smallest of the meta-frameworks. Measured Aug 2026: **one-button counter ~27 KB gzipped (SvelteKit 2.63 / Svelte 5.56) vs ~128 KB (Next.js 16.3)** same route — ~4.7× gap. Typical app: **50–100 KB initial vs 200–300 KB Next.js**. No React runtime (Svelte compiles to vanilla JS; runtime ~2–3 KB). 60–80% smaller than equivalent React app is consistently reproduced.
- Vite HMR is fast but Turbopack-Next has closed the gap; SvelteKit build is still faster cold-build on small apps, Next faster on large monorepos due to Turbopack caching.

**DX**

- **Pros:** Less boilerplate, no `useEffect`/`useMemo` ceremony; `$state`/`$derived` are intuitive for stream buffers and pane state. Scoped CSS + no CSS-in-JS needed (Tailwind still works fine). Adapter model is cleaner than Next for self-host (one config → Node/Bun/Cloudflare). TypeScript first-class. Learning curve consistently rated lowest of the four.
- **Cons:** Smaller hiring pool (weekly downloads ~500K vs Next ~6M, 10× gap). Many harness libs have no Svelte port: flexlayout-react, rc-dock, react-mosaic, xterm.js wrappers assume React. You would wrap xterm.js via `onMount` and build pane system from `svelte-dnd-action` / `paneforge` / custom grid. Monaco has `svelte-monaco` but less mature. AI SDK / LangChain examples are React-first; Svelte ports lag.

**SSE / WS support**

- **SSE:** Good. SvelteKit `+server.ts` endpoints return `new Response(stream)` same as Next. Client streaming via `fetch` + `ReadableStream` identical. No disadvantage vs Next for SSE.
- **WS:** Same as Next — no built-in WS server. Need separate WS service or Vite plugin (`vite-plugin-mkcert` etc). SvelteKit hooks (`handle`) can proxy but not hold sockets; need Node adapter `handle` to attach `ws` server manually.
- Overall transport parity; DX difference is component side (Svelte reactivity makes incremental token append cheaper — no VDOM diff).

**Ecosystem**

- Growing but thin for IDE-like harnesses: `paneforge` (pane/split), `svelte-dnd-action`, `shadcn-svelte` (port), but no `flexlayout-react` equivalent with floating/docking/popout parity. You get deployment flexibility (adapters) but lose docking-layout maturity.

**Fit for agentic harness**

- **Why fit:** If harness is mostly streaming chat + file list + terminal and you can tolerate building pane system yourself, SvelteKit gives the best performance-per-KB, lowest TTI, and simplest reactivity for per-token updates (assign to `$state` array, DOM patches minimal). Excellent for mobile / low-bandwidth users of Lokma.
- **Why not:** Drag-drop pane harness is *the* feature where React ecosystem wins. Recreating flexlayout semantics in Svelte is 3–6 weeks of extra work plus ongoing maintenance. Team must be willing to be early adopters for several libs. Hiring Svelte devs is harder.

**Verdict for Lokma:** **Excellent if bundle & TTI are top priority and team is small/experienced with Svelte.** Not the default if you want off-the-shelf VS Code-like docking.

---

### 2.3 Remix → React Router v7 (Framework Mode)

**What it is:** Remix v2 has merged into **React Router v7 framework mode** (Nov 2024 stable). `create-react-router@latest` gives Vite compiler, SSR, loaders/actions, nested routing, HMR. Data loading via `loader` (GET) + `action` (POST) + `useLoaderData`; mutations via `<Form>` / `fetcher`. RSC preview exists but not stable — Remix/RRv7 stays **non-RSC**, web-standards oriented.

**Bundle size**

- React runtime still required (**~42–45 KB**). Framework code ~20 KB minified (router). Typical app First Load similar to Next but slightly smaller because no RSC client manifest. Aggressive route-based code splitting (each route is a chunk) helps. No Turbopack; Vite build. Expect **~180–260 KB First Load** for comparable harness — between Next (with RSC savings) and SvelteKit. Tree-shaking via Vite/Rollup.

**DX**

- **Pros:** Best nested routing mental model — `root.tsx` → `routes/harness.tsx` → `routes/harness.$sessionId.tsx` with parallel loaders mirrors pane hierarchy naturally. `loader`/`action` + `defer()` + `<Await>` give progressive streaming without RSC. Web-standards purism (plain `Request`/`Response`, `headers`, `cookies`) maps well to SSE/WS proxies and is portable across runtimes. Vite HMR fast. No RSC boundary confusion.
- **Cons:** Ecosystem smaller than Next (fewer templates, fewer AI SDK integrations). RSC streaming story is future, not now. Deployment is "bring your own server" (Express/Hono/Fastify adapter) — more wiring than Next's zero-config. Error boundaries per route are powerful but verbose for harness with many pane error states.

**SSE / WS support**

- **SSE:** First-class via `loader` returning `new Response(stream, { headers: { "Content-Type": "text/event-stream" } })` + `defer` for streaming. Works identically to Next Route Handlers. `eventStream` helper in some adapters.
- **WS:** Same as above — no built-in WS server. Common pattern: Vite dev server proxy + production `express`/`fastify` WS upgrade handler. Some community `remix-websocket` packages but not official. More manual than Next's Route Handler proxy but not harder.
- **Fetcher:** `useFetcher` is actually great for agentic harness — fetcher can stream without navigation, ideal for per-pane tool-call streams that shouldn't affect URL.

**Ecosystem**

- All React libs work (same React). shadcn, xterm.js, Monaco all compatible. However Next-specific libs (next/image, next/font, Vercel AI SDK RSC) don't apply. TanStack Router is alternative but RRv7 is canonical. Deployment adapters for Cloudflare, Deno, Node, Bun all present.

**Fit for agentic harness**

- **Why fit:** If you value web-standards portability and nested loader composition (session loader → pane loaders → file loader) and dislike RSC complexity, RRv7 is the cleanest React harness. `fetcher` + `defer` + `Await` model fits multi-stream agent output well. You keep full control of server (Fastify/Hono) for WS/SSE.
- **Why not:** Hiring signal weaker than Next.js (job posts say "Next.js" not "React Router framework mode"). Fewer copy-paste harness templates. No RSC means you don't get automatic zero-JS for static chrome — but harness is SPA anyway so that's moot.

**Verdict for Lokma:** **Strong alternative to Next.js if you prefer explicit loaders over RSC and want server portability.** Roughly equal fit, slightly more wiring, slightly smaller community.

---

### 2.4 Astro 5

**What it is:** Islands architecture — **zero JS by default**, static HTML output, opt-in interactivity via `client:*` directives (`client:load`, `client:idle`, `client:visible`). Can embed React, Svelte, Vue, Solid islands in same page. SSR via `output: 'server'` or `hybrid` + adapters.

**Bundle size**

- Best-in-class for content sites: **0 KB JS on static pages**. Islands only ship JS for interactive components. React island still pays React runtime but only on pages that include it — and can mix runtimes (Svelte island ~2 KB vs React island ~45 KB) per island. For harness (all-interactive) you pay **sum of islands**, so not smaller than Next/SvelteKit in practice — you just have more granular control.

**DX**

- **Pros:** Content Collections (typed Markdown), View Transitions API (SPA feel without router JS), image optimization (`astro:assets`), framework-agnostic (reuse existing React components for chat, Svelte component for toggle). Hybrid mode lets static marketing pages stay static while `/harness` is SSR. Fastest build for static content.
- **Cons:** Islands boundaries are hard walls — state sharing between islands requires `nanostores`/`zustand` + custom events or lifting to layout. Harness is *all* interactive with shared state (session, streams, FS, terminal) — islands model fights you. No file-system nested layouts as rich as Next/RRv7 for SPA. Editor/terminal/dock libs expect single React tree, not archipelago.

**SSE / WS support**

- **SSE:** Works via `src/pages/api/*.ts` endpoints (`export const prerender = false` + `Response(stream)`). Client consumption same `fetch` streaming. But no built-in streaming component model like Next `<Suspense>` or RRv7 `defer` — you wire it manually per island.
- **WS:** Same separate-service pattern. Astro dev server can proxy WS but not hold it in static output. With `output: 'server'` you can attach WS to Node adapter similarly to SvelteKit.

**Ecosystem**

- Excellent for marketing/docs/blogs. For harness: `nanostores` is recommended store (tiny, framework-agnostic), but all pane/dock libs expect React root. You would wrap harness as *one* `client:only="react"` island — at which point Astro is just a thin shell around a React SPA, adding complexity for little gain.

**Fit for agentic harness**

- **Why fit:** If Lokma needs a marketing site + docs + harness in one repo, Astro can host all with hybrid output and give best marketing performance. Could still be the shell that *embeds* harness as single React island.
- **Why not:** Harness itself is **antithetical to islands**. You want one reactive tree with shared streaming state, not isolated islands. Using Astro for the harness pane adds indirection without benefit. SSE/WS handling is more manual; no advantage over Next/SvelteKit for streaming.

**Verdict for Lokma:** **Not recommended as harness framework.** Recommend Astro only for `lokma.dev` marketing/docs if needed; keep harness in Next/SvelteKit/RRv7. If you must pick one repo for both, use Next.js hybrid instead.

---

## 3. Backend Stacks

All three can front SSE + WS + REST for Lokma. Differences are perf, DX, typing, and ops footprint.

### 3.1 Fastify 5 (Node.js)

**What it is:** Fast, low-overhead Node HTTP framework with schema validation (Ajv), hooks, plugins, and first-class TypeScript. Mature (2016), 9M weekly downloads. Works on Node 18+.

**Performance**

- Benchmarks: **~60–80k req/s** on simple JSON (Node, 1 core), ~2× Express, ~30% behind Hono/Bun but ahead of NestJS. Real harness workload (SSE fan-out, file I/O) is not req/s bound — DB/PTY are bottlenecks. Fastify's overhead is negligible vs Nest decorator overhead.
- Startup ~50–100 ms; memory ~60–80 MB baseline (Node).

**DX**

- **Pros:** Minimal abstraction — `fastify.get('/stream', handler)` with full control over `reply.raw` for SSE/WS hijack. Plugin ecosystem huge: `@fastify/websocket`, `@fastify/cors`, `@fastify/multipart`, `@fastify/static`, `@fastify/swagger`. Schema → validation → serialization in one place (`{ schema: { querystring, response } }`). Hooks (`onRequest`, `preHandler`) replace Nest guards with less magic. TypeScript types infer from schemas (`@fastify/type-provider-typebox` / `zod`).
- **Cons:** Less opinionated → team must agree on folder structure, error handling, DI pattern. No built-in DI container (use `awilix`/`fastify-decorators` if needed). Swagger generation requires schema discipline.

**SSE / WS support**

- **SSE:** Trivial — `reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', ... }); reply.raw.write('data: ...\n\n')`. Or use `fastify-sse-v2` plugin. Backpressure via `reply.raw.write` return value. Works with Node streams, `Readable`.
- **WS:** `@fastify/websocket` (wraps `ws`) — `fastify.get('/pty', { websocket: true }, (socket, req) => { socket.on('message', ...) })`. Battle-tested for PTY bridging (node-pty → WS). Can share Fastify instance for HTTP+WS (same port) — ideal for harness.
- **HTTP/2:** Supported via `http2` option — helps SSE multiplexing.

**Ecosystem**

- Largest Node framework after Express. Every auth, ORM (Prisma, Drizzle, TypeORM), queue, and observability lib has Fastify example. Works with `undici`, `pino` (logger built-in, fastest JSON logger).

**Fit for agentic harness**

- **Why fit:** Harness backend is streams + FS + PTY + auth — Fastify gives maximum control with minimal overhead. Shares Node ecosystem with Next.js if you deploy BFF + WS together. Proven for long-lived SSE (thousands of concurrent streams with `pino` logging). Easiest to hire for.
- **Why not:** If you want Bun's raw speed or Nest's structure, Fastify is middle ground. No built-in WS/SSE abstraction beyond raw — you write framing.

**Verdict for Lokma:** **Default backend if staying on Node.** Pair with Next.js or RRv7. Use if you value maturity over raw req/s.

---

### 3.2 Hono + Bun (or Hono on Node/Deno/Cloudflare)

**What it is:** Hono is an ultrafast, Edge-first web framework (like Express API but ~5–10× faster, zero deps, ~14 KB). Runs on Bun, Node, Deno, Cloudflare Workers, etc. Bun is the JS runtime (Zig, JSC, ~4× faster startup than Node, native TS, `Bun.serve` with built-in WS).

**Performance**

- Benchmarks (TechEmpower / independent): **Hono on Bun ~150–250k req/s** simple JSON (3–4× Fastify on Node, 10× Express). Hono on Node still ~90k req/s. Bun startup **<10 ms**, memory ~20–30 MB baseline (vs Node ~70 MB). For harness: cold start and WS fan-out benefit most; SSE throughput scales linearly with Bun's faster event loop.
- Real numbers vary by workload; for PTY/FS-bound harness the gap shrinks but still measurable on high-concurrency stream broadcast.

**DX**

- **Pros:** `app.get('/stream', c => c.body(stream, { headers: {...}}))` — very concise. Middleware is `app.use('*', cors())` style, familiar to Express users. Types are excellent (`c.req.valid('query')` inferred from `zodValidator`). One codebase deploys to Bun, Node, Cloudflare Workers — useful if Lokma later wants edge. Bun adds `Bun.serve({ fetch, websocket: { open, message, close }})` native WS without `ws` lib. `Bun.file`, `Bun.spawn` for PTY/file ops are faster than Node equivalents.
- **Cons:** Bun in production is **stable but younger** (1.x) — occasional Node compat edge cases (`node-pty`, native addons). Smaller plugin ecosystem than Fastify (no 1:1 for every `@fastify/*`; you compose `hono/cors`, `hono/logger` yourself). Tooling (Prisma, some ORMs) historically had Bun quirks (mostly resolved in 2025-26 but check `node-pty` + Bun). Hono's minimalism means you build auth/validation plumbing vs Fastify/Nest conventions.

**SSE / WS support**

- **SSE:** Hono has `streamSSE(c, async stream => { await stream.writeSSE({ data: token }) })` helper (also `streamText`). Works on all runtimes. Bun's `ReadableStream` is native and fast.
- **WS:** On Bun: `Bun.serve({ websocket: {...}})` + `server.upgrade(req)` — zero-lib. On Node: `hono/adapter` + `ws` or `@hono/node-ws`. On Cloudflare: `c.env` Durable Objects WS. For harness PTY, Bun path is cleanest.
- **tRPC:** `@hono/trpc-server` adapter exists.

**Ecosystem**

- Growing fast, but not Fastify/Nest breadth. Good: `hono-openapi`, `zod`, `drizzle-orm` (Bun-native), `pino` works but Bun has `Bun.nanoseconds`. Bad: some enterprise libs (passport, typeorm) assume Node/Express.

**Fit for agentic harness**

- **Why fit:** If Lokma is greenfield and you control deployment (Docker with Bun image), Hono+Bun gives best streaming perf, smallest footprint, and native WS — ideal for low-latency token + PTY fan-out. Type safety via `hono-openapi` + `zod` is comparable to tRPC without extra layer. Single binary-like deploy (`bun build --compile`).
- **Why not:** If you need `node-pty` (native addon) or specific Node-only deps, test Bun compat first. Team unfamiliar with Bun may hit subtle compat issues. Fastify on Node is safer if you need maximum lib compatibility. Also: self-host Bun still less documented than Node for PM2/systemd.

**Verdict for Lokma:** **Best perf/efficiency pick if you can tolerate Bun's youth.** Recommended if harness will run high-concurrency agent sessions (N streams per user). Pair with *any* frontend (Next/SvelteKit/RRv7 all can proxy to Hono).

---

### 3.3 NestJS 11

**What it is:** Opinionated, Angular-inspired Node framework: decorators (`@Controller`, `@Injectable`), modules, DI container, Guards/Interceptors/Pipes, first-class TypeScript. Built on Express or Fastify adapter. 2M weekly downloads, enterprise-popular.

**Performance**

- Overhead of decorators + DI + reflection: **~15–30% slower than raw Fastify** on same adapter (Fastify adapter closes gap vs Express adapter). Typical **~40–60k req/s** JSON (Fastify adapter) vs 70k raw Fastify. Startup slower (DI graph bootstrap, ~500–1500 ms for large app) vs Fastify ~100 ms, Hono+Bun ~10 ms. Memory higher (~100–150 MB baseline for medium app).

**DX**

- **Pros:** Strong structure — modules, services, controllers enforce consistency across teams. DI makes testing (`Test.createTestingModule`) and mocking clean. Built-in: ValidationPipe (`class-validator`), Swagger (`@nestjs/swagger` auto-generates OpenAPI from decorators), GraphQL, Microservices, CQRS, WebSockets (`@nestjs/websockets` with `ws`/`socket.io` adapters), SSE (`@Sse()` decorator + `Observable`). Great for large teams that need conventions.
- **Cons:** Abstraction tax — simple SSE handler becomes `@Sse('stream') stream() { return interval(100).pipe(map(...)) }` with RxJS. Learning curve steepest of the three. Magic (reflection, decorators) makes debugging harder. Bundle size larger (Nest + RxJS + class-validator). Overkill for harness CRUD + streams.

**SSE / WS support**

- **SSE:** `@Sse('stream')` returns `Observable<MessageEvent>` — Nest handles `Content-Type: text/event-stream`, keepalive, serialization. Works but RxJS is mandatory mental model; harder to do backpressure than raw `reply.raw.write`.
- **WS:** `@WebSocketGateway()` + `@SubscribeMessage()` with `ws` or `socket.io` adapter. PTY bridging possible but you fight gateway abstraction for raw `node-pty` binary framing. Can also drop to raw `Fastify` instance via `app.getHttpAdapter().getInstance()` to bypass gateway for PTY.
- **tRPC:** No official adapter; community `nestjs-trpc` exists but adds another layer on top of Nest layer.

**Ecosystem**

- Enterprise: TypeORM, Prisma, Mongoose, Passport, BullMQ all have Nest modules. Swagger generation best of the three. Monorepo support (`nest build` + `nx`).

**Fit for agentic harness**

- **Why fit:** If Lokma will be built by 5–10 engineers with strict boundaries (auth module, session module, FS module, PTY module) and you value structure over speed, Nest gives that scaffolding. Swagger + Guards save time for enterprise compliance.
- **Why not:** Harness is stream-heavy and PTY-heavy — Nest's RxJS/Observable SSE and gateway WS add indirection without benefit. Startup time and memory hurt local dev with many agent sessions. You pay framework cost for a workload that is mostly "pipe bytes from LLM/PTY to client."

**Verdict for Lokma:** **Only if team already knows Nest or needs enterprise module boundaries.** For a lean agentic harness, Fastify or Hono gives more control with less overhead.

---

## 4. Pane / Layout Systems

Harness needs: resizable splits, drag-reorder, tabs, **serialization** (persist layout to localStorage/DB), **floating/popout** (optional), no full-page jank with xterm.js (canvas) inside, works with React 19.

### 4.1 react-mosaic (nomcopter/react-mosaic)

**What it is:** React tiling window manager inspired by i3. Binary (now n-ary) tree layout; each node is a window with toolbar. Built on `react-dnd` (HTML5 + touch backends). TypeScript, React 16–19, Blueprint optional theming via CSS variables.

**Bundle size:** ~30–40 KB minified (plus `react-dnd` ~15 KB + `react-dnd-html5-backend`). Total ~50–60 KB extra. Light.

**DX**

- **Pros:** Simple API — `<Mosaic initialValue={...} renderTile={(id) => <Pane id={id} />} />` in 15 lines. Controlled or uncontrolled. Drag-to-rearrange tiles, drag dividers to resize, zero tile chrome if you want. N-ary splits (one split can hold N children). Blueprint theme optional.
- **Cons:** **Tiling only** — no tabs, no docking, no floating, no popout. Windows are always visible tiles; you cannot tab-stack editor + terminal in same cell. Toolbar is per-window, not per-tabset. Auto-converts legacy v6 binary trees. Less flexible for VS Code-like UX. `react-dnd` dependency is heavier and touch support limited vs `dnd-kit`. Maintenance is community (not corporate) — slower release cadence.

**SSE/WS relevance:** None directly — panes are containers; streaming content inside is your concern. But tiling-only means each stream gets a visible tile; you can't tab-collapse streams to save space.

**Fit for Lokma:** **Good for simple tiling harness** (chat left, editor right, terminal bottom) where tabs not needed. **Not enough** if you need VS Code-like tab groups, docking to edges, or floating debug panes. Easy to start, hard to evolve to IDE layout.

---

### 4.2 rc-dock

**What it is:** Dock layout for React (ticlo/rc-dock). Box/Panel/Tab data model: `LayoutData { dockbox: BoxData, floatbox: BoxData, ... }` where `BoxData` is horizontal/vertical/float, `PanelData` holds `TabData[]`, each `TabData { id, title, content, closable, group }`. Supports dock, float, maximize, popout to new window.

**Bundle size:** ~40–50 KB minified (plus `rc-dock` CSS). No `react-dnd` — uses custom drag. Total ~45–55 KB. Similar to mosaic.

**DX**

- **Pros:** **Dock + float + tabs** — closest to VS Code after flexlayout. `DockLayout defaultLayout={...}` uncontrolled or `layout`+`onChange` controlled. `dockMove`, `find`, `updateTab` imperative API for agentic actions ("open file in new tab", "move terminal to float"). Tab groups (`group` field) prevent mixing (e.g., terminal tabs can't dock with editor tabs). Dark theme example, popup panel as new browser window, drag-anywhere.
- **Cons:** Docs are API-reference heavy, fewer tutorials than flexlayout. Theming requires overriding CSS (less polished than flexlayout themes). `find`/`dockMove` imperative API is powerful but easy to misuse (stale layout object if not controlled). No built-in border/edge docking with autohide (flexlayout has it). Popout uses `subLayouts` less polished. Community smaller than flexlayout.

**SSE/WS relevance:** Imperative `updateTab` lets you push stream updates into a tab's content without remounting — good for token streaming (update tab without recreating layout). Layout serialization is plain JSON (`LayoutData`) — easy to persist to DB.

**Fit for Lokma:** **Very good fit.** Covers 80% of VS Code UX (tabs, dock, float, maximize) with simple JSON model. Best if you want dock + float without flexlayout's weight. Tradeoff: less theme polish, fewer "border" features.

---

### 4.3 flexlayout-react

**What it is:** Multi-tab docking layout manager (caplin/flexlayout-react). Only dependency is React. Model: `{ global, layout: Row/TabSet/Tab, borders: {top,bottom,left,right}, subLayouts }`. Tabs have scrolling/wrapped, groups, popout, submodels.

**Bundle size:** ~50–70 KB minified + CSS. Largest of the dock libs but still modest. No drag lib dep (custom DnD). ~60 KB typical.

**DX**

- **Pros:** **Most feature-complete VS Code clone:** tabs (scrolling/wrapped), tab groups with colored pills, border tabsets (edge docking, overlay, autohide), tabset dragging, docking to edges, maximizing, tab overflow menu, popout tabs to floating panels **or new browser windows**, submodels (layouts inside layouts), theming (light/dark/underline + combined), accessibility (ARIA, keyboard map, focus), mobile (iPad/Android), TypeScript, factory pattern `factory={(node) => <Component />}`. Controlled via `Model` class with actions (`Actions.addNode`, `moveNode`, `deleteTab`). Preserves component state when tabs move (critical for terminal PTY not losing buffer on drag).
- **Cons:** Most complex API — `Model`, `Actions`, `IJsonModel`, factory indirection have learning curve. JSON model is verbose. `Model` is mutable (you call `model.doAction(Actions.xxx)` then `onModelChange` serializes) — not idiomatic React immutable state. Styling via CSS classes (`flexlayout__tab`, `flexlayout__border`) requires theme CSS import. Popout/new-window needs extra `subLayouts` handling.

**SSE/WS relevance:** `model.doAction(Actions.updateNodeAttributes(tabId, {config: {streaming: true}}))` lets agent update tab without reload. State preservation on move means xterm.js instance survives drag (no re-init, no PTY reconnect).

**Fit for Lokma:** **Best fit for full IDE harness.** If Lokma aims for VS Code parity (editor + terminal + file tree + chat + tool outputs as dockable panes), flexlayout is the proven choice (used by many IDE-like apps). Cost is API complexity and bundle a bit larger. **Recommended default for Lokma if React frontend.**

---

### 4.4 allotment

**What it is:** Split-pane component (johanholmerin/allotment) — **not a dock manager**. Two primitives: `<Allotment>` (horizontal/vertical) + `<Allotment.Pane>`. Resizable, snap, persist sizes. ~5 KB minified. Used by VS Code itself for its splits (but VS Code builds docking on top).

**Bundle size:** **~5–8 KB** — smallest by far. No DnD lib.

**DX**

- **Pros:** Dead simple, no model — `<Allotment vertical><Pane><Chat /></Pane><Pane><Terminal /></Pane></Allotment>`. Sizes persist to localStorage via `onChange` callback. Handles nested splits cleanly (horizontal inside vertical). No layout JSON, no factory — you render panes declaratively. Perfect with shadcn + Tailwind.
- **Cons:** **Only splits** — no tabs, no docking, no floating, no drag-reorder across arbitrary cells, no popout. You must compose tabs yourself (`<Tabs>` from shadcn/radix inside each pane) and handle tab switching state manually. No built-in serialization of tab arrangement — you serialize your own tab state. For harness with many dynamic panes (agent spawns new tool-output pane), you need to manage pane array + Allotment keys yourself.

**SSE/WS relevance:** None — pure layout. But simplicity means fewer re-renders on stream: Allotment doesn't remount panes on resize, so terminal stays alive.

**Fit for Lokma:** **Good for v1 if harness is 2–3 fixed panes** (chat | editor+terminal stacked). **Not enough for dynamic multi-pane IDE** where agent can open N tool outputs as tabs. Best as primitive inside flexlayout/rc-dock, or as simple harness with your own tab bar.

---

### 4.5 Custom CSS Grid + dnd-kit (or @hello-pangea/dnd)

**What it is:** Build-your-own: CSS Grid (`grid-template-columns: minmax(0,1fr)`) + `dnd-kit` (`@dnd-kit/core` + `@dnd-kit/sortable`) for drag-reorder + `react-resizable-panels` (`react-resizable-panels` from Brian Vaughn — actually great primitive) or `re-resizable` for resizing. You own the layout JSON.

**Bundle size:** `dnd-kit` ~15–20 KB + `react-resizable-panels` ~8 KB + your grid code. Total ~25–35 KB — between allotment and dock libs. Tree-shakable.

**DX**

- **Pros:** **Maximum control** — layout JSON is whatever you want (`{ id, type: 'row'|'col'|'tab', children, size }`), you decide serialization, nesting, constraints. `dnd-kit` is modern (keyboard, touch, collision detection, sortable) and maintained vs `react-dnd`. No dock-lib opinions to fight (theming, model mutability). Works with any styling (Tailwind, CSS Grid). Easiest to add agent-specific features: "agent requested to split pane", "agent pinned this pane", "layout versioning per session".
- **Cons:** **Maximum cost** — you build: resize handles + constraints + snap + tab bar + tab overflow + floating + persistence + a11y. That's 2–4 weeks to parity with flexlayout's basics, 6–8 weeks to popout/float/border. You own bugs (xterm.js canvas inside Grid has resize observer pitfalls; Grid + DnD + resize interactions are tricky). No free VS Code theme.

**SSE/WS relevance:** You control pane lifecycle — can keep `xterm` instance in `useRef` and never unmount on drag (use `SortableContext` with stable keys). But you must implement preservation yourself.

**Fit for Lokma:** **Fit only if harness layout is bespoke** (not VS Code clone) or you need agent-driven layout mutations that dock libs can't express (e.g., "split terminal vertically when agent runs `tmux`"). Otherwise you'll reimplement flexlayout poorly. **Not recommended for v1** unless team has strong DnD/Grid experience.

---

### Pane / Layout Summary

| Library | Bundle (min) | Tabs | Dock | Float/Popout | Serialize | State Preserv. | DX (learn) | Maintenance | Lokma fit |
|---------|--------------|------|------|--------------|-----------|----------------|------------|-------------|-----------|
| **react-mosaic** | ~55 KB | No | Tiling only | No | Tree JSON | Yes | Easy | Community | Tiling-only harness |
| **rc-dock** | ~50 KB | Yes | Yes | Yes (new win) | `LayoutData` JSON | Yes | Medium | Community | **Good — dock+float** |
| **flexlayout-react** | ~65 KB | Yes (groups) | Yes + borders | Yes (panel+win) | `IJsonModel` + `Model` | **Yes (best)** | Hard | Active (caplin) | **Best — VS Code parity** |
| **allotment** | **~7 KB** | No (compose) | Splits only | No | Sizes only | Yes | **Easy** | Active (JohanH) | Fixed 2–3 panes |
| **custom grid + dnd-kit** | ~30 KB | You build | You build | You build | You design | You implement | Hard | You | Bespoke only |

**Recommendation for Lokma panes:**

- **Default: flexlayout-react** if harness is IDE-like (multiple dynamic panes, tool outputs, floating debug). Pay the learning curve once.
- **Simpler alternative: rc-dock** if you want dock+tabs with less complexity.
- **v1 minimal: allotment + shadcn Tabs** if harness is chat + editor + terminal fixed layout — ship fastest, migrate to flexlayout later (Allotment → flexlayout migration is straightforward: wrap each Allotment pane as a flexlayout TabSet initially).

---

## 5. State Management — Zustand vs Jotai vs Redux Toolkit

Harness state shape (typical):

```ts
// Ephemeral (high-frequency, per-token)
sessionId, streamBuffers: Map<paneId, Token[]>, isStreaming, activeToolCalls

// UI (pane layout, file tree, terminal)
layout: LayoutData | IJsonModel, fileTree, openTabs, activePaneId

// Shared (user, auth, settings)
user, settings, modelPrefs
```

### 5.1 Zustand (~1.1 KB gzipped, ~5.5M weekly)

**Model:** Single store, hook access, selector slices, no Provider.

```ts
const useHarness = create<HarnessState>((set) => ({
  buffers: new Map(),
  appendToken: (paneId, token) => set(s => { s.buffers.get(paneId)!.push(token) }),
}))
// Component subscribes to slice:
const tokens = useHarness(s => s.buffers.get(paneId))
```

**Pros:** Smallest bundle, **65% less boilerplate than RTK** in benchmarks. No `<Provider>` wrapping — works with popout windows (new `window` needs separate store instance; Zustand `create` works). Selector pattern (`s => s.buffers.get(id)`) prevents re-renders of other panes when one token arrives — critical for streaming harness (measured 1.8 ms single-item update for 1k list vs 12.3 ms Context). Middleware `persist`, `devtools`, `subscribeWithSelector` cover harness needs (persist layout, devtools). Works with `immer` for immutable updates if needed. SSR-friendly.

**Cons:** Single store can grow large if you put everything in one; needs slice discipline (use `create` per domain: `useStreamStore`, `useLayoutStore`, `useFileStore`). No built-in async/Suspense (you write `fetch` + `set`).

**Fit for Lokma:** **Best fit.** Per-pane selector (`s => s.buffers.get(paneId)`) means chat pane re-renders only when its tokens arrive, not when terminal pane updates. No Provider = clean for flexlayout popout windows. Minimal bundle budget.

### 5.2 Jotai (~3.4 KB gzipped, ~2.2M weekly)

**Model:** Atomic — each piece is an `atom`, components subscribe to atoms.

```ts
const tokensAtomFamily = atomFamily((paneId: string) => atom<Token[]>([]))
// Component:
const [tokens, setTokens] = useAtom(tokensAtomFamily(paneId))
```

**Pros:** **Finest-grained re-renders** — measured 0.9 ms single-item update (best of the three) because only atom subscribers re-render. Composable atoms (`atom(get => get(a)+get(b))`), Suspense-ready (`atom(async get => ...)`), no Provider required (optional). Excellent for harness where each pane's buffer is independent atom and derived atoms compute `isStreaming = tokens.length > 0 && !done`. TypeScript excellent.

**Cons:** Atoms need grouping conventions for large app — no prescribed structure, can become "atom soup" without discipline. DevTools weaker than Redux (Jotai DevTools exists but less mature). Bundle 3× Zustand. For harness with Map-like buffers, `atomFamily` + `splitAtom` patterns have learning curve.

**Fit for Lokma:** **Excellent fit if you value finest re-render granularity** and are comfortable with atomic mental model. Slightly more complex than Zustand for simple "append token to pane" but pays off at scale (100+ panes). Choose Jotai if you expect many independent streams.

### 5.3 Redux Toolkit (~11 KB gzipped + RTK Query, ~9M weekly)

**Model:** Centralized store + slices + selectors + RTK Query for server state. `<Provider>` required.

```ts
const streamSlice = createSlice({ name: 'stream', initialState, reducers: { appendToken } })
// Selector:
const tokens = useSelector(s => s.stream.buffers[paneId])
```

**Pros:** Most structure — slices, `createAsyncThunk`, `entityAdapter` for normalized buffers, Redux DevTools is **best-in-class** (time-travel, action replay — invaluable for debugging agent tool-call sequences). RTK Query handles server state (file tree fetch, session list) with caching, polling, invalidation. Best for large teams that need conventions and DevTools.

**Cons:** Largest bundle (11 KB + RTK Query 13 KB if used). Most boilerplate (even with RTK, you write slices + selectors + Provider). Provider required — popout windows need extra wiring (store singleton + `Provider` per window). Overkill for ephemeral stream state (you don't need action history for per-token appends). `immer` inside RTK can be slower for high-frequency token appends (add 1 token → copy-on-write of buffer array).

**Fit for Lokma:** **Fit only if team already Redux-fluent or needs RTK Query + time-travel debugging** for complex agent workflows. For lean harness, you pay bundle + boilerplate without proportional benefit. **Not recommended for v1** unless enterprise team.

### State Management Decision Table

| Criteria | Zustand | Jotai | Redux Toolkit |
|----------|---------|-------|---------------|
| **Bundle (gzipped)** | **1.1 KB** | 3.4 KB | 11 KB (+13 KB RTK Query) |
| **Boilerplate** | Very low | Very low | Low (RTK) vs high (legacy) |
| **Re-render scope** | Selector slices | **Per-atom (finest)** | Selector + `useSelector` |
| **1k-list single update** | 1.8 ms | **0.9 ms** | 2.1 ms |
| **Provider required** | No | No (optional) | **Yes** |
| **SSR** | Excellent | Excellent | Good |
| **DevTools** | Via middleware (Redux DT) | Jotai DevTools | **Redux DevTools (best)** |
| **Async/Suspense** | Manual | **Native Suspense** | `createAsyncThunk` / RTK Query |
| **Persist layout** | `persist` middleware | `atomWithStorage` | `redux-persist` |
| **Popout window** | Works (no Provider) | Works | Needs Provider per window |
| **Learning curve** | Low | Low–Medium | Medium–High |
| **Harness fit** | **★★★★★** (default) | ★★★★☆ (scale) | ★★★☆☆ (enterprise) |

**Recommendation for Lokma:** **Zustand as default** (one `useStreamStore` + `useLayoutStore` + `useFileStore`). **Jotai if you expect >20 concurrent streams** and want per-token atom granularity. **Redux only for large team with RTK Query + DevTools needs.**

---

## 6. Real-time Transport — WebSocket vs SSE vs tRPC

### 6.1 WebSocket (WS)

**Model:** Full-duplex, persistent TCP (after HTTP Upgrade), bidirectional frames, binary+text, `ws://`/`wss://`.

**Pros:** Bidirectional — client and server can send anytime without request. Ideal for **PTY** (terminal needs keystrokes → server, output → client, plus resize, signal). Binary framing (pty data) efficient. Low latency once connected. Multiplexing via subprotocols if needed. Works with `node-pty` → `ws` bridge cleanly. No HTTP request per message.

**Cons:** Not HTTP — harder to proxy (needs `Upgrade` support, sticky sessions if behind LB). No built-in reconnection, no HTTP/2 multiplexing, no automatic buffering/replay. Firewall/proxy sometimes blocks WS (corp networks). Harder to debug (not curl-able). Requires heartbeat/ping-pong for liveness (server must detect dead clients). Scaling needs pub/sub or Redis adapter for multi-instance. No built-in backpressure signal beyond TCP window.

**SSE support in harness:** WS can carry LLM tokens too (some do), but you lose HTTP caching, compression, and simple `fetch` streaming.

**Ecosystem:** `ws` (Node), `partysocket`/`partyserver`, `socket.io` (adds reconnection, rooms), `Bun.serve` native WS. `xterm.js` attach addon works with WS.

**Fit for Lokma:** **Required for terminal PTY** (bidirectional). Optional for LLM streams but SSE is simpler there.

### 6.2 Server-Sent Events (SSE)

**Model:** Unidirectional (server → client), long-lived HTTP response `Content-Type: text/event-stream`, lines `data: JSON\n\n`, `event:`, `id:`, `retry:`. Client via `fetch` + `ReadableStream` or `EventSource` (GET only).

**Pros:** **HTTP** — works through every proxy/LB/CDN that speaks HTTP/1.1 or HTTP/2. HTTP/2 multiplexes many SSE streams on one TCP connection (great for N panes). Simple framing (`data: ` lines) — no lib needed, `curl` debuggable. Auto-reconnect with `EventSource` or manual with `fetch` + `Last-Event-ID` replay. Backpressure via `ReadableStream` controller. Works with `ReadableStream` + `TextDecoder` token streaming (Vercel AI SDK uses SSE). No `Upgrade`, no sticky session (if you replay via `Last-Event-ID` + Redis). Cloudflare, Fastify, Hono, Next all handle SSE as plain `Response(stream)`.

**Cons:** **Unidirectional** — client → server needs separate fetch/POST (fine for "send prompt", not for PTY). `EventSource` is GET-only and limited headers (no auth header — must use cookie/query); `fetch` streaming fixes this (you can POST then stream response, like OpenAI's streaming). One TCP per stream in HTTP/1.1, but HTTP/2 mitigates. No binary (text only, but tokens are text — fine). Browser `EventSource` doesn't support custom headers — use `fetch` polyfill.

**WS vs SSE for LLM tokens:** SSE wins for simplicity; OpenAI, Anthropic, Vercel AI SDK all expose LLM streams as SSE-like (OpenAI is `text/event-stream` over POST). Client: `fetch('/api/chat', { method: 'POST', body: JSON.stringify({prompt}) }).then(r => r.body.getReader() ...)`.

**Ecosystem:** `eventsource-parser`, `fetch-event-source` polyfill, Hono `streamSSE`, Fastify `reply.raw.write('data: ...')`, Next Route Handler `new Response(stream)`.

**Fit for Lokma:** **Recommended for LLM token streaming** (and file watcher events as alternative to WS). Keep transport as plain HTTP — easier ops, easier auth, easier replay.

### 6.3 tRPC (with SSE/WS under)

**Model:** Not a transport — **typed RPC layer** over HTTP (fetch) + optional WS (`@trpc/server/adapters/ws`) or SSE (`@trpc/server/adapters/fetch` + `httpBatchStreamLink`). Gives end-to-end TypeScript types (client calls server function with inferred types), `zod` validation, middleware, context.

**Pros:** **Typesafety** — `trpc.chat.stream.useSubscription({ sessionId }, { onData: token => ... })` is typed end-to-end without OpenAPI codegen. Eliminates REST boilerplate (no manual `fetch` + `zod` parse). Works with all three frontends (Next, SvelteKit via `@trpc/client`, RRv7). Supports `subscription` type for streaming (maps to SSE or WS). Interops with Fastify/Hono/Nest adapters.

**Cons:** **Adds abstraction** — you now have tRPC router + `createContext` + `procedure` vs plain `fetch('/api/stream')`. Subscription transport is still SSE/WS under hood — tRPC doesn't solve reconnection/backpressure better than raw. Bundle cost (~10–15 KB client). Ties frontend/backend to monorepo (shared router types) — not ideal if Lokma backend will be consumed by non-TS clients (CLI, mobile). Debugging is tRPC envelope, not plain HTTP. Not needed if you only have 2–3 streaming endpoints.

**When to use with harness:** If Lokma will have **many typed RPCs** (session CRUD, file ops, terminal, streaming, tool calls) and monorepo, tRPC saves time. If harness is mostly "POST prompt → stream tokens" + FS REST, plain `fetch` + `zod` is simpler.

**Transport mapping with tRPC:**

| tRPC link | Transport | Use for |
|-----------|-----------|---------|
| `httpBatchLink` | HTTP POST | CRUD (file list, session create) |
| `httpBatchStreamLink` | HTTP streaming (SSE-like) | LLM tokens (server streams, client reads) |
| `wsLink` or `createWSClient` | WS | Terminal PTY, live collaboration |

**Fit for Lokma:** **Optional layer** — use if you want typed RPC across many procedures; skip if you prefer plain REST + SSE to keep transports debuggable and backend agnostic.

### Real-time Decision Table

| Criteria | WebSocket | SSE (fetch stream) | tRPC (over SSE/WS) |
|----------|-----------|--------------------|--------------------|
| **Direction** | Bidirectional | Server → client (client POSTs separately) | Both (depends on link) |
| **Protocol** | WS (Upgrade) | HTTP (`text/event-stream`) | HTTP or WS envelope |
| **Proxy/LB** | Needs Upgrade, sticky | Works everywhere (HTTP) | Depends on link |
| **HTTP/2 multiplex** | No (own TCP) | **Yes** (many streams, one conn) | As per link |
| **Reconnect** | Manual | `EventSource`/fetch + `Last-Event-ID` | Manual (wsLink has reconnect) |
| **Binary** | Yes | Text (base64 if needed) | Text (superjson can do binary) |
| **Curl debuggable** | No | **Yes** | No (envelope) |
| **Bundle** | `ws` 0 KB (native) | 0 KB | ~12 KB |
| **Harness use** | **PTY (required)** | **LLM tokens, FS events** | Typed RPC wrapper |
| **Ops complexity** | Higher (Upgrade, heartbeat) | Lower (HTTP) | Higher (router + links) |

**Recommendation for Lokma real-time:**

- **PTY terminal: WebSocket** (`Bun.serve` WS or `@fastify/websocket` or Hono WS). Non-negotiable — bidirectional.
- **LLM streaming: SSE via `fetch` streaming** (`POST /api/chat/stream` → `ReadableStream` → `data: JSON`). Simple, H2-multiplexed, `Last-Event-ID` replay via Redis if needed.
- **File watcher: SSE or WS** — SSE if you already have SSE infra (`GET /api/watch?path=...`), WS if you already have WS for PTY (reuse same socket with `event` field).
- **tRPC: add only if** you have >10 typed procedures and monorepo. Otherwise `fetch` + `zod` keeps transports inspectable.

---

## 7. Decision Matrix

### 7.1 Frontend Decision Matrix (score 1–5, 5=best, weighted for harness)

Weights for agentic harness: Streaming 25%, Pane/Dock ecosystem 25%, Bundle/T TI 15%, DX/HMR 15%, Hiring/ecosystem 10%, Deployment flexibility 10%.

| Criterion (weight) | Next.js 15 + Tailwind | SvelteKit 2 | Remix / RRv7 | Astro 5 |
|---------------------|----------------------|-------------|--------------|---------|
| **Streaming (SSE/WS DX)** | 5 (Route Handlers + Suspense) | 5 (endpoints + fetch) | 5 (loader/defer/fetcher) | 3 (islands fight streaming) |
| **Pane/Dock ecosystem** | **5** (flexlayout, rc-dock, xterm wrappers) | 2 (paneforge only) | 5 (same React libs) | 2 (one React island) |
| **Bundle / TTI** | 3 (240 KB typical, −48% with RSC) | **5** (27 KB vs 128 KB measured) | 3 (200 KB) | 4 (0 KB static, but harness pays island sum) |
| **DX / HMR** | 5 (Turbopack 76% faster, RSC) | 4 (Vite fast, runes simple) | 4 (Vite, loaders) | 4 (fast static, islands overhead) |
| **Hiring / ecosystem** | **5** (6M downloads, every lib) | 2 (500K, hiring hard) | 3 (large React, small RRv7) | 3 (content hiring, not harness) |
| **Deployment flex** | 3 (Vercel-optimized, standalone works) | **5** (adapters any target) | 4 (bring-your-own server) | 4 (hybrid/static) |
| **Weighted total** | **4.3** | 3.5 | 4.1 | 2.9 |

**Winner frontend:** **Next.js 15 + Tailwind** (by hiring + pane ecosystem). SvelteKit wins on perf; RRv7 is close second if you dislike RSC.

### 7.2 Backend Decision Matrix (weight: Perf 20%, DX 25%, SSE/WS 25%, Ecosystem 15%, Ops 15%)

| Criterion | Fastify 5 (Node) | Hono + Bun | NestJS 11 |
|-----------|------------------|------------|-----------|
| **Requests/s (JSON)** | 4 (70k) | **5** (150–250k) | 3 (45k) |
| **SSE/WS DX** | 5 (raw `reply.raw`, `@fastify/websocket`) | 5 (`streamSSE`, `Bun.serve` WS) | 3 (Observable/gateway abstraction) |
| **DX / TS** | 4 (schemas, no DI) | 4 (zod, minimal) | 5 (decorators, Swagger, DI) |
| **Ecosystem** | **5** (largest) | 3 (growing) | 4 (enterprise) |
| **Ops / startup** | 4 (100 ms, 70 MB) | **5** (<10 ms, 25 MB, single binary) | 2 (1s, 120 MB) |
| **Maturity / risk** | **5** (since 2016) | 3 (Bun 1.x) | 5 (mature) |
| **Weighted total** | **4.5** | 4.4 | 3.3 |

**Winner backend:** **Fastify** (safest) vs **Hono+Bun** (fastest) — tie, pick by risk tolerance. Nest only for enterprise structure.

### 7.3 Pane / Layout Decision Matrix

| Criterion | react-mosaic | rc-dock | flexlayout-react | allotment | custom grid+dnd-kit |
|-----------|--------------|---------|------------------|-----------|---------------------|
| **Tabs** | 1 | 4 | **5** | 1 | 2 (you build) |
| **Dock/Float** | 1 | 4 | **5** | 1 | 2 |
| **Serialize** | 4 (tree) | 4 (JSON) | 4 (Model) | 2 (sizes) | 3 (you design) |
| **State preserv on drag** | 4 | 4 | **5** | 4 | 3 |
| **Bundle** | 4 (55 KB) | 4 (50 KB) | 3 (65 KB) | **5** (7 KB) | 4 (30 KB) |
| **DX** | 5 | 4 | 3 | **5** | 2 |
| **Maintenance** | 3 | 3 | **4** | 4 | 2 |
| **Fit for IDE harness** | 2 | 4 | **5** | 2 | 3 |

**Winner panes:** **flexlayout-react** (IDE), **rc-dock** (simpler dock), **allotment** (minimal splits).

### 7.4 State & Transport Matrix (already in §5–6, summarized)

| State lib | Bundle | Re-render | Harness score |
|-----------|--------|-----------|---------------|
| **Zustand** | **1.1 KB** | selector slices | **5** |
| Jotai | 3.4 KB | per-atom (best) | 4 |
| Redux Toolkit | 11 KB | selector | 3 |

| Transport | Use | Harness score |
|-----------|-----|---------------|
| **SSE (fetch)** | LLM tokens, FS events | **5** |
| **WS** | PTY (bidirectional) | **5** (required) |
| tRPC | typed RPC wrapper | 3 (optional) |

---

## 8. Cross-cutting Concerns for an Agentic Harness

### 8.1 File Browser

All frontends can render a tree (`shadcn` Tree, `rc-tree`, `mantine`). Backend needs FS watch → push to client. Options:

- **Polling** (simple, 1s): works but janky.
- **SSE** `GET /api/watch?path=/workspace` (recommended): `chokidar`/`@parcel/watcher` on backend → SSE stream → client patches tree (Zustand `set(state => patch)`).
- **WS** reuse PTY socket: multiplex `{"event":"fs","path":"...","type":"change"}` on same WS — fewer connections, but couples concerns.

**Stack implication:** Any backend can do this; Hono+Bun `Bun.watch` is native and fast. Next.js Route Handler can do SSE watch if you run Next standalone (not edge). Remix loader SSE similar.

### 8.2 Terminal (xterm.js + PTY)

- **Frontend:** `xterm` + `xterm-addon-fit` + `xterm-addon-web-links` in a `useEffect`/`onMount`. Must handle `ResizeObserver` → `socket.send(JSON.stringify({type:'resize', cols, rows}))`. Caveat: xterm canvas inside flexlayout/allotment needs `requestAnimationFrame` debounce on resize or you get flicker.
- **Backend:** `node-pty` (Node) or `Bun.spawn` with `pty: true` (Bun experimental) or `lib` `node-pty` via `bun:ffi`. Bridge `pty.onData(data => socket.send(data))` and `socket.on('message', msg => pty.write(msg))`. Must handle `close` → kill pty, `error` → log, backpressure. `concurrently`/`tmux` inside pty is common harness feature.
- **Transport:** WS only. SSE can't carry keystrokes. Use `ws` ping every 30s, `pty.kill()` on close.
- **Stack implication:** Fastify `@fastify/websocket` and Hono+Bun `Bun.serve` WS are both proven. Next.js alone cannot host WS — you need companion WS server (or Next `rewrites` to it). That's a point for separate Hono/Fastify WS service even if Next is frontend.

### 8.3 Drag-Drop Panes + Persistence

- **Serialize:** flexlayout `model.toJson()` / rc-dock `layout` JSON / mosaic `mosaic.toJson()` → `localStorage` + `POST /api/layout` (per-user). On load: `Model.fromJson(saved)` or fallback to default. Must version layout (`v:1`) for migrations when pane types change.
- **Agent-driven layout:** Agent should be able to `POST /api/panes { action: 'open', pane: 'tool-output', toolCallId }` → backend broadcasts layout patch via SSE/WS → frontend `model.doAction(Actions.addNode(...))`. Design `layout` as CRDT-like patchable JSON (not full replace) to avoid races when user drags while agent opens pane.
- **Performance:** Dragging a pane with xterm inside is heavy — pause xterm rendering on `dragStart` (`term.pause()` or `display: none` overlay), resume on `dragEnd`.

### 8.4 Auth & Session

All stacks support `better-auth`/`lucia`/`next-auth`/`clerk`. For harness: session cookie + CSRF, WS auth via `cookie` on upgrade (verify before `socket` accept) or ticket (`GET /api/ws-ticket` → short-lived token → `ws://...?ticket=...`).

### 8.5 Theming & Styling

Tailwind is consensus across all four frontends. For harness: dark theme default (`slate-950` bg, `zinc` borders), `shadcn/ui` for dialogs/sheets, `Radix` primitives for accessibility. flexlayout themes map to Tailwind via CSS variables.

---

## 9. Recommendation Tiers for Lokma

### Tier 1 — Recommended Default (ship fastest, hire easiest)

**Next.js 15 + Tailwind 4 + flexlayout-react + Zustand + Fastify (Node) + SSE (tokens) + WS (PTY)**

- **Why:** Every pane lib, xterm wrapper, and AI SDK example works out of box. Fastify is mature, owns WS+SSE on same port, deploys as Docker `node:22-alpine` + `node-pty`. Zustand gives per-pane selector without Provider. SSE for tokens reuses HTTP infra; WS only for PTY. Vercel optional (self-host via `output: standalone` + Fastify WS sidecar if needed).
- **Tradeoff:** Larger bundle (~240 KB First Load) but RSC can halve it. Vercel lock-in if you lean on Next conventions without discipline.
- **When to pick:** Team knows React, need IDE-like docking, want to ship v1 in 4–6 weeks.

### Tier 2 — Performance / Minimal Bundle

**SvelteKit 2 + Tailwind + paneforge/custom + Jotai? actually Svelte stores ($state) + Hono + Bun + SSE + WS**

- **Why:** Smallest bundle (27 KB counter), simplest reactivity for streaming, Bun gives 3× req/s and <10 ms startup, ideal for high-concurrency agent farm.
- **Tradeoff:** You build pane docking yourself; hiring harder; Bun compat check for `node-pty`.
- **When to pick:** Bundle/TI is business metric, team is Svelte-fluent, deployment is Bun-friendly (Docker `oven/bun:1`).

### Tier 3 — Standards Purist / Portable Server

**React Router v7 (Remix) + Tailwind + rc-dock + Zustand + Hono (Node) or Fastify + SSE/WS**

- **Why:** No RSC, loaders/fetcher map cleanly to pane data, server is portable (any runtime), `useFetcher` fits per-pane tool streams without navigation.
- **Tradeoff:** Smaller community than Next, more wiring than Next.
- **When to pick:** You dislike RSC, want explicit loaders, or plan to deploy server to multiple runtimes.

### Tier 4 — Marketing + Harness Monorepo

**Astro (marketing/docs, hybrid) + Next/RRv7 harness as sub-app (monorepo via Turborepo)**

- Keep `apps/web` (Astro static) and `apps/harness` (Next/RRv7) sharing `packages/ui` (Tailwind/shadcn). Best of both without islands compromise.

### Anti-pattern for Lokma

**Astro islands for harness + NestJS for simple streams** — you pay complexity without benefit. Nest's RxJS SSE and Astro's island walls fight the harness's single-tree, high-frequency stream nature. Avoid unless enterprise constraints force Nest.

---

## 10. Sources & Measurement Notes

- Next.js bundle / Turbopack / RSC: Next.js 15 blog (vercel.com), `nextjs.org/docs/app/guides/package-bundling`, Azuritek/Verlua performance guides (measured 247→156 KB, 245→128 KB, FCP 2.4→1.1s).
- SvelteKit vs Next.js bundle: Markaicode Aug 7 2026 benchmark (SvelteKit 2.63/Svelte 5.56 vs Next 16.3/React 19.2.8, single-vCPU 4GB sandbox, counter route 27 KB vs 128 KB gzipped); Better Stack / Hygraph / PkgPulse comparisons (50–100 KB vs 200–300 KB typical, 30–50% smaller).
- Remix → React Router v7: `remix.run/blog/react-router-v7`, `remix.run/blog/merging-remix-and-react-router`, `remix.run/blog/wake-up-remix` (Nov 2024 v7 stable, framework mode via `create-react-router`).
- Astro islands: `astro.build`, `docs.w3cub.com/astro/concepts/islands`, Feature-Sliced Design blog, `dev.to/uaslimcreate` (zero JS by default, `client:*` directives, hybrid output).
- Pane libs: `github.com/nomcopter/react-mosaic` (tiling, react-dnd), `github.com/ticlo/rc-dock` (dock+float, Box/Panel/Tab), `npmjs.com/package/flexlayout-react` (caplin, tabs/borders/popout, only dep React), `github.com/johanholmerin/allotment` (split panes, 5 KB).
- State: Better Stack `zustand-vs-redux-toolkit-vs-jotai`, Laxaar Jun 15 2026 guide, youngju.dev 2025 comparison, zenn.dev Next.js 15.5 / Jotai benchmark, WellAlly health-app benchmarks (Zustand 1.1 KB, 65% less boilerplate; Jotai 3.4 KB, per-atom 0.9 ms; RTK 11 KB).
- Backend/perf: TechEmpower, Fastify vs Hono vs Nest community benchmarks (Fastify ~70k, Hono+Bun 150–250k, Nest ~45k on Fastify adapter); Fastify 5 docs, Hono `streamSSE` + `Bun.serve` WS, NestJS `@Sse()` Observable + `@WebSocketGateway`.
- Realtime: MDN SSE/WS, `hono/streamSSE`, `fastify/websocket`, Vercel AI SDK streaming, OpenAI SSE, tRPC `httpBatchStreamLink`/`wsLink`.

**Caveats:** Bundle numbers are *same-env relative* (sandbox) — production varies with polyfills, shadcn, Monaco (Monaco alone ~300 KB), xterm.js (~80 KB). Always run `ANALYZE=true next build` / `vite build --mode analyze` on harness with real deps before deciding on bundle budget. Perf req/s numbers are JSON hello-world — harness is SSE/PTY bound, not JSON. Verify `node-pty` + Bun before committing to Bun for PTY.

---

*End of raw research — ready for user to pick Tier 1/2/3. No implementation attempted; this file is decision material.*
