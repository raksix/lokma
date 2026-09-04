import type { Permissions } from 'lokma-shared';

/**
 * Permission gate — one decision function behind every tool call.
 * Reads the live `permissions` object (`GET /api/config` shape from
 * Docs/26 §3 + Docs/36 RBAC): `allow`/`deny` lists plus `defaultMode`.
 * The WS `permission_response` handler persists `always` by appending to
 * `allow` server-side — this module only reads, never writes.
 * See Docs/30 §collision-free + Docs/22 §permissions.
 */

export type GateDecision = 'allow' | 'ask' | 'deny';

/** Tools that only read — safe to auto-run in `auto` mode. */
export const READ_TOOLS: ReadonlySet<string> = new Set(['read_file', 'list_files', 'search_files']);

/** Tools that mutate disk or spawn processes — need approval by default. */
export const WRITE_TOOLS: ReadonlySet<string> = new Set(['write_file', 'run_command']);

/** Exact or prefix match: `write` covers `write_file`, `read` covers reads. */
function listed(entries: readonly string[], tool: string): boolean {
  return entries.some((entry) => entry.length > 0 && (entry === tool || tool.startsWith(entry)));
}

function fallbackFor(tool: string, mode: Permissions['defaultMode']): GateDecision {
  switch (mode) {
    case 'bypass':
      // Explicit operator override — everything runs.
      return 'allow';
    case 'manual':
      // Paranoid mode — even reads ask first.
      return 'ask';
    case 'plan':
      // Plan-only mode — reads run, mutations are refused outright.
      return READ_TOOLS.has(tool) ? 'allow' : 'deny';
    case 'acceptEdits':
    case 'auto':
    default:
      return READ_TOOLS.has(tool) ? 'allow' : 'ask';
  }
}

/**
 * Decide one tool call. Precedence: `deny` > `allow` > `defaultMode`.
 * Unknown tool names still get a decision (deny-list can block by prefix);
 * unknown-tool rejection itself lives in the executor.
 */
export function decideToolCall(
  permissions: Pick<Permissions, 'allow' | 'deny' | 'defaultMode'> | undefined | null,
  tool: string,
): GateDecision {
  const perms = {
    allow: permissions?.allow ?? [],
    deny: permissions?.deny ?? [],
    defaultMode: permissions?.defaultMode ?? ('auto' as const),
  };
  if (listed(perms.deny, tool)) return 'deny';
  if (listed(perms.allow, tool)) return 'allow';
  return fallbackFor(tool, perms.defaultMode);
}

/** One-line human sentence for `permission_request.description` + logs. */
export function describeToolCall(tool: string, input: unknown): string {
  const arg = (key: string): string | null => {
    if (typeof input !== 'object' || input === null) return null;
    const value = (input as Record<string, unknown>)[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };
  switch (tool) {
    case 'read_file':
      return `Read ${arg('path') ?? 'a file'}`;
    case 'list_files':
      return `List ${arg('path') ?? 'the workspace'}`;
    case 'search_files':
      return `Search for "${arg('query') ?? ''}"`;
    case 'write_file':
      return `Write ${arg('path') ?? 'a file'}`;
    case 'run_command': {
      const cmd = arg('command') ?? 'a command';
      return `Run \`${cmd}\``;
    }
    default:
      return `Run ${tool}`;
  }
}
