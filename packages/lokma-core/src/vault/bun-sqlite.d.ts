/**
 * Minimal ambient types for `bun:sqlite` (the server and CLI run under bun).
 * Imported dynamically inside `fts.ts` so a plain-node runtime falls back to
 * substring search instead of crashing the whole `lokma-core` import graph.
 */
declare module 'bun:sqlite' {
  export class Database {
    constructor(path: string, options?: { readonly?: boolean; create?: boolean });
    run(query: string, ...params: unknown[]): void;
    query<T = Record<string, unknown>>(query: string): {
      all(...params: unknown[]): T[];
      get(...params: unknown[]): T | null;
    };
    close(): void;
  }
}
