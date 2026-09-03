/**
 * Storage for zustand `persist` — localStorage when available, process memory
 * otherwise (bun probes, SSR). Single implementation shared by every store.
 */
import type { StateStorage } from 'zustand/middleware';

function createMemoryStorage(): StateStorage {
  const mem = new Map<string, string>();
  return {
    getItem: (key) => mem.get(key) ?? null,
    setItem: (key, value) => {
      mem.set(key, value);
    },
    removeItem: (key) => {
      mem.delete(key);
    },
  };
}

/** Exposed for probes so tests can assert what was persisted. */
export const memoryStorage = createMemoryStorage();

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function';
  } catch {
    return false;
  }
}

/** Browser-safe storage: real localStorage in the app, memory outside it. */
export const safeStorage: StateStorage = {
  getItem: (key) => {
    if (!hasLocalStorage()) return memoryStorage.getItem(key);
    try {
      return localStorage.getItem(key);
    } catch {
      return memoryStorage.getItem(key);
    }
  },
  setItem: (key, value) => {
    if (!hasLocalStorage()) {
      memoryStorage.setItem(key, value);
      return;
    }
    try {
      localStorage.setItem(key, value);
    } catch {
      memoryStorage.setItem(key, value);
    }
  },
  removeItem: (key) => {
    if (!hasLocalStorage()) {
      memoryStorage.removeItem(key);
      return;
    }
    try {
      localStorage.removeItem(key);
    } catch {
      memoryStorage.removeItem(key);
    }
  },
};
