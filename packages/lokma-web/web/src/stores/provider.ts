/**
 * providerStore — providers/models cache over `GET /api/providers` +
 * `GET /api/models` (the server merges upstreams and caches 5m itself).
 * Client-side TTL mirrors that window so the Composer dropdown and the
 * Models tab read one shared, explicitly-invalidated cache.
 */
import { create } from 'zustand';
import {
  api,
  type CreateProviderBody,
  type ModelInfo,
  type PatchProviderBody,
  type ProviderInfo,
  type ProviderTestRes,
} from '@/lib/api';

/** Client cache window — matches the server catalog TTL (5 minutes). */
export const PROVIDER_CACHE_TTL_MS = 5 * 60 * 1000;

/** Pure TTL check (exported for probes). */
export function isCacheFresh(fetchedAt: number | null, now: number): boolean {
  return fetchedAt !== null && now - fetchedAt < PROVIDER_CACHE_TTL_MS;
}

export type ProviderStore = {
  providers: ProviderInfo[];
  models: ModelInfo[];
  fetchedAt: number | null;
  loading: boolean;
  lastError: string | null;
  /** Latest live test result per provider id (from POST /:id/test). */
  testResults: Record<string, ProviderTestRes>;
  /** Provider id currently being tested (spinner), null when idle. */
  testingId: string | null;
  /** Refresh unless the cache is fresh (pass `force` to bypass the TTL). */
  refresh: (force?: boolean) => Promise<void>;
  /** Drop the cache so the next read refetches (e.g. after provider CRUD). */
  invalidate: () => void;
  reset: () => void;
  /** Live connection test — stores the result under testResults[id]. */
  testProvider: (id: string) => Promise<ProviderTestRes>;
  /** Create a custom provider, then force-refresh the shared cache. */
  createProvider: (body: CreateProviderBody) => Promise<ProviderInfo>;
  /** Patch name/baseUrl/enabled/priority/apiKey, then force-refresh. */
  patchProvider: (id: string, body: PatchProviderBody) => Promise<ProviderInfo>;
  /** Delete a custom provider, then force-refresh. */
  deleteProvider: (id: string) => Promise<void>;
  /** Persist a new priority order, then force-refresh. */
  reorderProviders: (order: string[]) => Promise<void>;
};

const initial = {
  providers: [] as ProviderInfo[],
  models: [] as ModelInfo[],
  fetchedAt: null as number | null,
  loading: false,
  lastError: null as string | null,
  testResults: {} as Record<string, ProviderTestRes>,
  testingId: null as string | null,
};

export const useProviderStore = create<ProviderStore>()((set, get) => ({
  ...initial,

  refresh: async (force = false) => {
    if (!force && isCacheFresh(get().fetchedAt, Date.now())) return;
    set({ loading: true, lastError: null });
    try {
      const [providersRes, modelsRes] = await Promise.all([api.listProviders(), api.listModels()]);
      set({
        providers: providersRes.providers,
        models: modelsRes.models,
        fetchedAt: Date.now(),
        loading: false,
      });
    } catch (e) {
      set({ loading: false, lastError: e instanceof Error ? e.message : 'provider refresh failed' });
    }
  },

  invalidate: () => {
    set({ fetchedAt: null });
  },

  reset: () => {
    set({ ...initial });
  },

  testProvider: async (id: string) => {
    set({ testingId: id });
    try {
      const result = await api.testProvider(id);
      set((s) => ({ testingId: null, testResults: { ...s.testResults, [id]: result } }));
      return result;
    } catch (e) {
      const fallback: ProviderTestRes = {
        ok: false,
        provider: id,
        error: e instanceof Error ? e.message : 'provider test failed',
      };
      set((s) => ({ testingId: null, testResults: { ...s.testResults, [id]: fallback } }));
      return fallback;
    }
  },

  createProvider: async (body: CreateProviderBody) => {
    const res = await api.createProvider(body);
    await get().refresh(true);
    return res.provider;
  },

  patchProvider: async (id: string, body: PatchProviderBody) => {
    const res = await api.patchProvider(id, body);
    await get().refresh(true);
    return res.provider;
  },

  deleteProvider: async (id: string) => {
    await api.deleteProvider(id);
    set((s) => {
      const testResults = { ...s.testResults };
      delete testResults[id];
      return { testResults };
    });
    await get().refresh(true);
  },

  reorderProviders: async (order: string[]) => {
    await api.reorderProviders(order);
    await get().refresh(true);
  },
}));
