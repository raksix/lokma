/**
 * VaultPort — abstraction so Lokma can swap backends (lokma-vault / memory.fermag.com.tr).
 * See Docs/28 §5.1 and Docs/29.
 */

export type VaultNote = { path: string; title: string; content: string };

export interface VaultPort {
  ingest(path: string, content: string, opts?: { append_to?: string }): Promise<{ ok: true; path: string }>;
  search(q: string): Promise<VaultNote[]>;
  graph(): Promise<{ nodes: unknown[]; links: unknown[] }>;
  tree(): Promise<unknown>;
}

/** No-op vault for Phase 0 — real HTTP ingest in Phase 1. */
export class NoopVault implements VaultPort {
  async ingest(): Promise<{ ok: true; path: string }> {
    return { ok: true, path: '' };
  }
  async search(): Promise<VaultNote[]> {
    return [];
  }
  async graph(): Promise<{ nodes: unknown[]; links: unknown[] }> {
    return { nodes: [], links: [] };
  }
  async tree(): Promise<unknown> {
    return null;
  }
}
