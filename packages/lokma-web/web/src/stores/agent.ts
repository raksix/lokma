/**
 * agentStore — agent registry cache over `GET /api/agents*` plus live
 * presence from WS `agent_state` frames.
 * The server owns caps/queue/locks (429 when full); this store mirrors them
 * for the HUD. Orchestration (live tree) vs Hub (registry) split per Docs/30.
 */
import { create } from 'zustand';
import { api, type AgentCaps, type AgentInfo, type CreateAgentBody, type PatchAgentBody } from '@/lib/api';
import type { ServerMessage } from 'lokma-shared/protocol/ws';

export type AgentLock = { owner: string; path?: string; since?: string };

export type AgentStore = {
  agents: AgentInfo[];
  selectedAgentId: string | null;
  /** Registry caps from the server (429 past maxAgents — Hub shows the banner). */
  caps: AgentCaps;
  /** Advisory file locks per agent id (3-layer safe banner reads this). */
  locks: Record<string, AgentLock[]>;
  loading: boolean;
  lastError: string | null;
  /** Reload the registry from the server (replaces the cache). */
  refresh: () => Promise<void>;
  selectAgent: (id: string | null) => void;
  /** Merge one WS `agent_state` frame into the registry (live presence). */
  applyWsEvent: (msg: ServerMessage) => void;
  /** Clear one agent's locks (e.g. after it was killed). */
  clearLocks: (agentId: string) => void;
  /** Run one registry mutation, then refresh the cache from the server. */
  mutate: (fn: () => Promise<AgentInfo>) => Promise<AgentInfo>;
  create: (body: CreateAgentBody) => Promise<AgentInfo>;
  /** Edit name/model/budgets of one agent. */
  update: (id: string, body: PatchAgentBody) => Promise<AgentInfo>;
  /** Lifecycle move: pause | resume | kill (server guards the transition). */
  move: (id: string, action: 'pause' | 'resume' | 'kill') => Promise<AgentInfo>;
  /** Copy an agent into a fresh id (fork | clone, state idle). */
  copy: (id: string, action: 'fork' | 'clone') => Promise<AgentInfo>;
  /** Delete an agent (prunes the cache selection when it pointed at it). */
  remove: (id: string) => Promise<void>;
  reset: () => void;
};

const initial = {
  agents: [] as AgentInfo[],
  selectedAgentId: null as string | null,
  caps: { maxAgents: 20, maxConcurrent: 5, maxQueue: 20 } as AgentCaps,
  locks: {} as Record<string, AgentLock[]>,
  loading: false,
  lastError: null as string | null,
};

export const useAgentStore = create<AgentStore>()((set, get) => ({
  ...initial,

  refresh: async () => {
    set({ loading: true, lastError: null });
    try {
      const res = await api.listAgents();
      set((prev) => ({
        agents: res.agents,
        caps: res.caps ?? prev.caps,
        selectedAgentId:
          prev.selectedAgentId && res.agents.some((a) => a.id === prev.selectedAgentId)
            ? prev.selectedAgentId
            : null,
        loading: false,
      }));
    } catch (e) {
      set({ loading: false, lastError: e instanceof Error ? e.message : 'agent refresh failed' });
    }
  },

  selectAgent: (id: string | null) => {
    set({ selectedAgentId: id });
  },

  applyWsEvent: (msg: ServerMessage) => {
    if (msg.type !== 'agent_state') return;
    // A deleted row is gone on the server — drop it instead of merging.
    if (msg.state === 'deleted') {
      set((prev) => ({
        agents: prev.agents.filter((a) => a.id !== msg.agentId),
        selectedAgentId: prev.selectedAgentId === msg.agentId ? null : prev.selectedAgentId,
      }));
      return;
    }
    set((prev) => {
      const existing = prev.agents.find((a) => a.id === msg.agentId);
      const agents = existing
        ? prev.agents.map((a) => (a.id === msg.agentId ? { ...a, state: msg.state } : a))
        : [...prev.agents, { id: msg.agentId, state: msg.state }];
      return { agents };
    });
  },

  clearLocks: (agentId: string) => {
    set((prev) => {
      const locks = { ...prev.locks };
      delete locks[agentId];
      return { locks };
    });
  },

  /** Run one registry mutation, then refresh the cache from the server. */
  mutate: async (fn: () => Promise<AgentInfo>): Promise<AgentInfo> => {
    set({ lastError: null });
    try {
      const agent = await fn();
      await get().refresh();
      return agent;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'agent mutation failed';
      set({ lastError: message });
      throw e;
    }
  },

  create: async (body) => get().mutate(() => api.createAgent(body).then((r) => r.agent)),

  update: async (id, body) => get().mutate(() => api.patchAgent(id, body).then((r) => r.agent)),

  move: async (id, action) => get().mutate(() => api.moveAgent(id, action).then((r) => r.agent)),

  copy: async (id, action) => {
    const agent = await get().mutate(() => api.copyAgent(id, action).then((r) => r.agent));
    // A fork/clone is a new agent — select it so the detail view follows.
    set({ selectedAgentId: agent.id });
    return agent;
  },

  remove: async (id) => {
    set({ lastError: null });
    try {
      await api.deleteAgent(id);
      set((prev) => ({
        agents: prev.agents.filter((a) => a.id !== id),
        selectedAgentId: prev.selectedAgentId === id ? null : prev.selectedAgentId,
      }));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'agent delete failed';
      set({ lastError: message });
      throw e;
    }
  },

  reset: () => {
    set({ ...initial });
  },
}));
