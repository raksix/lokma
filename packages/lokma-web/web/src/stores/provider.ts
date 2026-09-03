/**
 * providerStore — providers/models cache over `GET /api/providers` +
 * `GET /api/models` (the server merges upstreams and caches 5m itself).
 * Client-side TTL mirrors that window so the Composer dropdown and the
 * Models tab read one shared, explicitly-invalidated cache.
 */
import { create } from 'zustand';
import { api, type ModelInfo, type ProviderInfo } from '@/lib/api';

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
  /** Refresh unless the cache is fresh (pass `force` to bypass the TTL). */
  refresh: (force?: boolean) => Promise<void>;
  /** Drop the cache so the next read refetches (e.g. after provider CRUD). */
  invalidate: () => void;
  reset: () => void;
};

const initial = {
  providers: [] as ProviderInfo[],
  models: [] as ModelInfo[],
  fetchedAt: null as number | null,
  loading: false,
  lastError: null as string | null,
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
}));
