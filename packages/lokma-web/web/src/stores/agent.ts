/**
 * agentStore — agent registry cache over `GET /api/agents*` plus live
 * presence from WS `agent_state` frames.
 * The server owns caps/queue/locks (429 when full); this store mirrors them
 * for the HUD. Orchestration (live tree) vs Hub (registry) split per Docs/30.
 */
import { create } from 'zustand';
import { api, type AgentInfo } from '@/lib/api';
import type { ServerMessage } from 'lokma-shared/protocol/ws';

export type AgentLock = { owner: string; path?: string; since?: string };

export type AgentStore = {
  agents: AgentInfo[];
  selectedAgentId: string | null;
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
  reset: () => void;
};

const initial = {
  agents: [] as AgentInfo[],
  selectedAgentId: null as string | null,
  locks: {} as Record<string, AgentLock[]>,
  loading: false,
  lastError: null as string | null,
};

export const useAgentStore = create<AgentStore>()((set) => ({
  ...initial,

  refresh: async () => {
    set({ loading: true, lastError: null });
    try {
      const res = await api.listAgents();
      set((prev) => ({
        agents: res.agents,
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

  reset: () => {
    set({ ...initial });
  },
}));
