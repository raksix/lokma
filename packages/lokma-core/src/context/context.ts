import type { GlobalConfig } from 'lokma-shared';

/**
 * Context — the kernel (~300 lines stub for Phase 0).
 * One per session/turn, holds config + sessionId + emit bus.
 * Plugins inject via ctx.config, ctx.emit, ctx.tools.
 * See Docs/23-PLUGIN-SYSTEM and Docs/12-HARNESS-MIMARI §loop.
 */

export type LokmaEvent = {
  type: string;
  payload?: unknown;
};

export class Context {
  // Immutable per-session inputs
  readonly sessionId: string;
  readonly cwd: string;

  // Mutable harness state
  config: GlobalConfig;
  private listeners = new Map<string, Set<(payload: unknown) => void>>();

  constructor(opts: { sessionId: string; cwd: string; config: GlobalConfig }) {
    this.sessionId = opts.sessionId;
    this.cwd = opts.cwd;
    this.config = opts.config;
  }

  /** Emit typed event — plugins subscribe via ctx.on(). */
  emit(type: string, payload?: unknown): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  /** Subscribe to event. Returns unsubscribe fn. */
  on(type: string, fn: (payload: unknown) => void): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }

  /** Update config and emit config/changed for hot-reload. */
  updateConfig(patch: Partial<GlobalConfig>): void {
    this.config = { ...this.config, ...patch };
    this.emit('config/changed', this.config);
  }
}
