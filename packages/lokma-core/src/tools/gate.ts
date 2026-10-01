import { surfaceToolNamesByGate, type Permissions } from '@lokma/shared';

/**
 * Permission gate — one decision function behind every tool call.
 * Reads the live `permissions` object (`GET /api/config` shape from
 * Docs/26 §3 + Docs/36 RBAC): `allow`/`deny` lists plus `defaultMode`.
 * The WS `permission_response` handler persists `always` by appending to
 * `allow` server-side — this module only reads, never writes.
 * See Docs/30 §collision-free + Docs/22 §permissions.
 */

export type GateDecision = 'allow' | 'ask' | 'deny';

/**
 * REQ-181 — the four tool classes below are DERIVED from the surface
 * catalog (`packages/lokma-shared/src/surfaces.ts`): every catalog tool row
 * declares its `gate`, and these sets are its projections. Adding a row
 * there is the only edit a new tool needs — this file keeps no second,
 * hand-maintained list.
 *
 * read — only reads: auto-runs in `auto`, allowed in `plan`.
 */
export const READ_TOOLS: ReadonlySet<string> = new Set(surfaceToolNamesByGate('read'));

/**
 * write — mutates disk or persists server state: asks in `auto`, refused in
 * `plan` (REQ-180's open_project is one of these).
 */
export const WRITE_TOOLS: ReadonlySet<string> = new Set(surfaceToolNamesByGate('write'));

/**
 * REQ-154: browser-engine tools act on a real page (scroll/click/type) via
 * the host browser engine — not on disk, so they are neither reads nor
 * writes: gated like writes (ask in `auto`, refused in `plan`).
 */
export const BROWSER_TOOLS: ReadonlySet<string> = new Set(surfaceToolNamesByGate('browser'));

/**
 * REQ-135: interactive tools' whole point is talking to the user. Gating
 * them would ask the user to approve being asked, so `decideToolCall`
 * allows them outright — an explicit `deny` entry still wins (operator
 * intent).
 */
export const INTERACTIVE_TOOLS: ReadonlySet<string> = new Set(surfaceToolNamesByGate('interactive'));

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
  // Talking to the user is never a permission question (REQ-135) — but the
  // deny-list above still outranks it.
  if (INTERACTIVE_TOOLS.has(tool)) return 'allow';
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
    case 'open_browser':
      return `Open browser on ${arg('url') ?? 'a URL'}`;
    case 'open_terminal': {
      const cmd = arg('command');
      return cmd ? `Open a terminal running \`${cmd}\`` : 'Open a terminal pane';
    }
    case 'terminal_write': {
      const typed = arg('data');
      return typed ? `Type into terminal: ${typed.slice(0, 60)}` : 'Type into a terminal';
    }
    case 'open_session': {
      const title = arg('title');
      return title ? `Open session "${title}"` : 'Open a new session pane';
    }
    case 'send_to_session': {
      const target = arg('sessionId');
      return target ? `Send a message to session ${target}` : 'Send a message to another session';
    }
    case 'open_project': {
      const name = arg('name');
      const cwd = arg('cwd') ?? 'a workspace path';
      return name ? `Open project "${name}" at ${cwd}` : `Open project at ${cwd}`;
    }
    case 'list_projects':
      return 'List projects';
    default:
      return `Run ${tool}`;
  }
}
