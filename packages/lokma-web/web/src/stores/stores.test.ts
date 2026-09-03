/**
 * Probe for the W0-F3 stores (`./session`, `./pane`, `./provider`, `./agent`).
 * Run: `bun src/stores/stores.test.ts` from `packages/lokma-web/web`.
 * No test framework — plain asserts so `tsc -b` stays dependency-free.
 * Not imported by app code, so the Vite bundle ignores it.
 */
import { defaultLayout, isLayoutNode, type LayoutNode } from './layout';
import { memoryStorage } from './storage';
import { useSessionStore } from './session';
import { usePaneStore } from './pane';
import { PROVIDER_CACHE_TTL_MS, isCacheFresh, useProviderStore } from './provider';
import { useAgentStore } from './agent';

function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Layout guards (ported 1:1 from concept, never redesigned) ──────────────

assert(isLayoutNode(defaultLayout()), 'default layout passes the guard');
assert(isLayoutNode({ type: 'pane', id: 'a' }), 'pane node passes the guard');
assert(!isLayoutNode(null), 'null fails the guard');
assert(!isLayoutNode({ type: 'pane' }), 'pane without id fails the guard');
assert(!isLayoutNode({ type: 'split', id: 'x', dir: 'diag', sizes: [], children: [] }), 'bad dir fails the guard');
assert(
  !isLayoutNode({ type: 'split', id: 'x', dir: 'row', sizes: [50], children: [{ type: 'pane' }] }),
  'corrupt child fails the guard',
);

// ─── Storage fallback ───────────────────────────────────────────────────────

memoryStorage.setItem('probe-key', 'probe-value');
assert(memoryStorage.getItem('probe-key') === 'probe-value', 'memory storage round-trips');
memoryStorage.removeItem('probe-key');
assert(memoryStorage.getItem('probe-key') === null, 'memory storage removes');

// ─── Session store ──────────────────────────────────────────────────────────

useSessionStore.getState().reset();
useSessionStore.getState().selectSession('sess_1');
assert(useSessionStore.getState().activeSessionId === 'sess_1', 'session select sets active id');

useSessionStore.getState().applyWsEvent({ type: 'done', sessionId: 'sess_1', reason: 'complete' });
assert(useSessionStore.getState().stale['sess_1'] === true, 'WS done marks transcript stale');
useSessionStore.getState().applyWsEvent({ type: 'text_delta', delta: 'hi', sessionId: 'sess_1' });
assert(useSessionStore.getState().stale['sess_1'] === true, 'stream frames leave staleness untouched');

let fetchCalls = 0;
globalThis.fetch = (async (url: unknown) => {
  fetchCalls += 1;
  const path = String(url);
  if (path === '/api/sessions') return json(200, { sessions: [{ id: 'sess_1' }], count: 1 });
  if (path === '/api/sessions/sess_1') {
    return json(200, { id: 'sess_1', cwd: '/repo', messages: [{ role: 'user' }], count: 1 });
  }
  return json(404, { code: 'not_found', message: 'no such route in probe' });
}) as unknown as typeof fetch;

await useSessionStore.getState().refreshSessions();
assert(useSessionStore.getState().sessions.length === 1, 'refresh loads the session list');
assert(useSessionStore.getState().activeSessionId === 'sess_1', 'refresh keeps a live selection');

await useSessionStore.getState().loadTranscript('sess_1');
assert(useSessionStore.getState().transcripts['sess_1']?.length === 1, 'transcript caches after load');
const callsAfterFirstLoad = fetchCalls;
await useSessionStore.getState().loadTranscript('sess_1');
assert(fetchCalls === callsAfterFirstLoad, 'fresh transcript skips refetch');
useSessionStore.getState().invalidateSession('sess_1');
assert(useSessionStore.getState().stale['sess_1'] === true, 'invalidate marks stale');
assert(!('sess_1' in useSessionStore.getState().transcripts), 'invalidate drops the cache');

globalThis.fetch = (async () => json(200, { sessions: [], count: 0 })) as unknown as typeof fetch;
await useSessionStore.getState().refreshSessions();
assert(useSessionStore.getState().sessions.length === 0, 'refresh replaces the list');
assert(useSessionStore.getState().activeSessionId === null, 'refresh clears a dead selection');

// ─── Pane store ─────────────────────────────────────────────────────────────

usePaneStore.getState().resetLayout();
usePaneStore.getState().openTab({ id: 'tab-1', title: 'Session', sessionId: 'sess_1' });
usePaneStore.getState().openTab({ id: 'tab-1', title: 'Renamed', sessionId: 'sess_1' });
assert(usePaneStore.getState().openTabs.length === 1, 'opening the same tab updates instead of duplicating');
assert(usePaneStore.getState().openTabs[0]?.title === 'Renamed', 're-open refreshes tab data');
usePaneStore.getState().openTab({ id: 'tab-2', title: 'Files' });
usePaneStore.getState().closeTab('tab-1');
assert(usePaneStore.getState().openTabs.length === 1, 'close removes one tab');

const widthBefore = usePaneStore.getState().leftW;
usePaneStore.getState().setSideWidth('left', 40);
assert(usePaneStore.getState().leftW === widthBefore, 'too-narrow sidebar width is rejected');
usePaneStore.getState().setSideWidth('left', 300);
assert(usePaneStore.getState().leftW === 300, 'valid sidebar width applies');

const layoutBefore = usePaneStore.getState().layout;
usePaneStore.getState().setLayout({ type: 'pane' } as unknown as LayoutNode);
assert(usePaneStore.getState().layout === layoutBefore, 'corrupt layout is rejected');
usePaneStore.getState().setTiling(true);
assert(usePaneStore.getState().tiling === true, 'tiling toggle applies');
usePaneStore.getState().resetLayout();
assert(usePaneStore.getState().tiling === false, 'reset clears chrome flags');
assert(isLayoutNode(usePaneStore.getState().layout), 'reset restores a valid layout');

// ─── Provider store (5m TTL) ────────────────────────────────────────────────

assert(PROVIDER_CACHE_TTL_MS === 5 * 60 * 1000, 'provider TTL is 5 minutes');
assert(isCacheFresh(Date.now(), Date.now()), 'fresh timestamp is fresh');
assert(!isCacheFresh(null, Date.now()), 'missing timestamp is stale');
assert(!isCacheFresh(Date.now() - PROVIDER_CACHE_TTL_MS - 1, Date.now()), 'expired timestamp is stale');

let providerCalls = 0;
globalThis.fetch = (async (url: unknown) => {
  providerCalls += 1;
  const path = String(url);
  if (path === '/api/providers') return json(200, { providers: [{ id: 'p1', enabled: true, keySet: true, last4: 'ab12' }] });
  if (path === '/api/models') return json(200, { models: [{ id: 'p1::m1', label: 'M1', provider: 'p1' }], count: 1, cached: false });
  return json(404, { code: 'not_found', message: 'no such route in probe' });
}) as unknown as typeof fetch;

useProviderStore.getState().reset();
await useProviderStore.getState().refresh();
assert(useProviderStore.getState().providers.length === 1, 'provider refresh loads providers');
assert(useProviderStore.getState().models.length === 1, 'provider refresh loads models');
const providerCallsAfterFirst = providerCalls;
await useProviderStore.getState().refresh();
assert(providerCalls === providerCallsAfterFirst, 'fresh cache skips refetch');
await useProviderStore.getState().refresh(true);
assert(providerCalls > providerCallsAfterFirst, 'force bypasses the TTL');
useProviderStore.getState().invalidate();
await useProviderStore.getState().refresh();
assert(providerCalls > providerCallsAfterFirst, 'invalidate forces refetch');

// ─── Agent store ────────────────────────────────────────────────────────────

globalThis.fetch = (async () => json(200, { agents: [{ id: 'agent-1', state: 'idle' }] })) as unknown as typeof fetch;
useAgentStore.getState().reset();
await useAgentStore.getState().refresh();
assert(useAgentStore.getState().agents.length === 1, 'agent refresh loads the registry');

useAgentStore.getState().applyWsEvent({ type: 'agent_state', agentId: 'agent-1', state: 'running' });
assert(
  useAgentStore.getState().agents.find((a) => a.id === 'agent-1')?.state === 'running',
  'WS agent_state merges into the registry entry',
);
useAgentStore.getState().applyWsEvent({ type: 'agent_state', agentId: 'agent-9', state: 'queued' });
assert(useAgentStore.getState().agents.length === 2, 'WS agent_state adds unknown agents');
useAgentStore.getState().applyWsEvent({ type: 'done', sessionId: 'sess_1', reason: 'complete' });
assert(useAgentStore.getState().agents.length === 2, 'non-agent frames leave the registry alone');

useAgentStore.getState().selectAgent('agent-1');
assert(useAgentStore.getState().selectedAgentId === 'agent-1', 'agent select applies');
useAgentStore.getState().clearLocks('agent-1');
assert(!('agent-1' in useAgentStore.getState().locks), 'clearLocks drops one agent');

console.log('stores probe: ALL PASS');
