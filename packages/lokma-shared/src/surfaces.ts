/**
 * REQ-181 — the harness surface catalog (single source of truth).
 *
 * One pure-data table behind three consumers that used to drift apart:
 *  1. the web chrome (Inspector rail, Activity bar, top mode switch),
 *  2. the agent tool registry (what the model can call),
 *  3. the `<available_surfaces>` system-prompt block (what the model knows).
 *
 * Add a surface or an agent tool by adding a row here. The rail lists, the
 * permission gate sets and the prompt block all derive from this file, so
 * there is never a second hand-maintained list to keep in sync.
 *
 * Pure data only: no React, no zod, no runtime side effects — the CLI and
 * the web both import it directly.
 */

/** Stable surface ids (rail tab / mode ids exactly as the UI knows them). */
export type SurfaceId =
  | 'sessions'
  | 'files'
  | 'providers'
  | 'models'
  | 'usage'
  | 'settings'
  | 'terminal'
  | 'git'
  | 'browser'
  | 'agents'
  | 'orchestration'
  | 'vault'
  | 'skills'
  | 'archify'
  | 'testing'
  | 'setup'
  | 'plugins'
  | 'observability'
  | 'cron'
  | 'loops'
  | 'extras'
  | 'memory'
  | 'todos'
  | 'account'
  | 'chat'
  | 'bots'
  | 'design';

/** Where a surface opens when its entry is activated. */
export type SurfaceOpens =
  | 'pane' // an Inspector tab / tiling pane
  | 'settings-section' // a section inside the Settings modal
  | 'standalone-modal' // its own dedicated modal (Archify)
  | 'mode' // a top-level app mode (chat | bots | design)
  | 'explorer'; // the Explorer sidebar list (sessions)

/**
 * Chrome entry points that render a surface. A surface can live in more
 * than one host (Git appears on the rail and the activity bar). Order
 * within a host is the table order below.
 */
export type SurfaceHost =
  | 'inspector' // desktop Inspector rail (right/left strip)
  | 'activity-top' // activity bar, top group
  | 'activity-pane' // activity bar, middle group (pane shortcuts)
  | 'activity-bottom' // activity bar, bottom group
  | 'mode'; // header mode switch

/**
 * Permission class of one agent tool. The single source behind the
 * `READ_TOOLS` / `WRITE_TOOLS` / `BROWSER_TOOLS` / `INTERACTIVE_TOOLS` sets
 * in the core gate: `plan` mode denies everything that is not a read, and
 * `auto` mode asks for everything that is not a read.
 */
export type SurfaceToolGate = 'read' | 'write' | 'interactive' | 'browser';

/** One agent tool a surface owns. */
export type SurfaceTool = {
  /** Registered tool name (stable — probes and REQ notes reference these). */
  name: string;
  /** One-sentence "does what" line for the system prompt and tool lists. */
  summary: string;
  /** Permission class — drives the gate sets in `tools/gate.ts`. */
  gate: SurfaceToolGate;
};

/** One catalog row: a UI surface + the agent tool family that mirrors it. */
export type Surface = {
  id: SurfaceId;
  label: string;
  opens: SurfaceOpens;
  /** Chrome entries that render this surface (empty = internal only). */
  hosts: readonly SurfaceHost[];
  /**
   * Settings-modal section this entry opens. Present exactly when
   * `opens === 'settings-section'`; the web validates it against its own
   * section registry (shared must not depend on web code).
   */
  section?: string;
  /** Agent tool family — empty until the wave that gives this surface tools. */
  tools: readonly SurfaceTool[];
};

/**
 * The catalog. Table order is the rail order (and the order within every
 * activity-bar group and the mode switch), so the lists the chrome renders
 * are pure projections of this array.
 */
export const SURFACES: readonly Surface[] = [
  // ── Sessions (Explorer list; opens no pane of its own) ──────────────────
  {
    id: 'sessions',
    label: 'Sessions',
    opens: 'explorer',
    hosts: ['activity-top'],
    tools: [
      { name: 'open_session', summary: 'Open a new chat session pane, optionally carrying a first prompt that auto-sends', gate: 'write' },
      { name: 'send_to_session', summary: 'Send a user message to an existing session; it runs there, behind any run it already has', gate: 'write' },
      // REQ-180 — projects live where sessions live: the explorer groups
      // sessions by project, and opening a project opens a session in it.
      { name: 'open_project', summary: 'Create a project record and open a session in it; idempotent per name and cwd', gate: 'write' },
      { name: 'list_projects', summary: 'List the projects the current user may see, with ids, cwd and visibility', gate: 'read' },
    ],
  },
  // ── Files (workspace tools, jail-scoped to the session cwd) ─────────────
  {
    id: 'files',
    label: 'Files',
    opens: 'pane',
    hosts: ['inspector'],
    tools: [
      { name: 'read_file', summary: 'Read a workspace-relative file with a sha for guarded writes', gate: 'read' },
      { name: 'list_files', summary: 'List one workspace directory level, dirs-first, with git states', gate: 'read' },
      { name: 'glob', summary: 'Find files by glob pattern across the workspace', gate: 'read' },
      { name: 'grep', summary: 'Search file contents with a regular expression, grouped by file with line numbers', gate: 'read' },
      { name: 'search_files', summary: 'Fuzzy file-name search across the workspace (grep searches inside files)', gate: 'read' },
      { name: 'edit_file', summary: 'Replace an exact string inside a workspace file (read it first)', gate: 'write' },
      { name: 'write_file', summary: 'Atomically create or overwrite a workspace file, sha-guarded', gate: 'write' },
      { name: 'run_command', summary: 'Run one binary without a shell, jailed to the workspace cwd', gate: 'write' },
    ],
  },
  // ── Providers ────────────────────────────────────────────────────────────
  {
    id: 'providers',
    label: 'Providers',
    opens: 'pane',
    hosts: ['inspector'],
    tools: [
      { name: 'provider_add', summary: 'Add a model provider (name + base URL + key reference) to the live registry', gate: 'write' },
    ],
  },
  // ── Models ───────────────────────────────────────────────────────────────
  {
    id: 'models',
    label: 'Models',
    opens: 'pane',
    hosts: ['inspector'],
    tools: [
      { name: 'model_probe', summary: 'Probe one model with a real upstream call and report the honest result', gate: 'read' },
    ],
  },
  // ── Usage ────────────────────────────────────────────────────────────────
  {
    id: 'usage',
    label: 'Usage',
    opens: 'pane',
    hosts: ['inspector'],
    tools: [
      { name: 'usage_report', summary: 'Report token and cost usage totals per model and day', gate: 'read' },
    ],
  },
  // ── Settings (opens the modal on General) ────────────────────────────────
  {
    id: 'settings',
    label: 'Settings',
    opens: 'settings-section',
    hosts: ['inspector', 'activity-bottom'],
    section: 'general',
    tools: [],
  },
  // ── Terminal ─────────────────────────────────────────────────────────────
  {
    id: 'terminal',
    label: 'Terminal',
    opens: 'pane',
    hosts: ['inspector', 'activity-pane'],
    tools: [
      { name: 'open_terminal', summary: 'Open a terminal pane on a fresh shell, optionally running one command', gate: 'write' },
      { name: 'terminal_write', summary: 'Type input into an open terminal session (a command, an answer, a key sequence)', gate: 'write' },
    ],
  },
  // ── Git ──────────────────────────────────────────────────────────────────
  {
    id: 'git',
    label: 'Git',
    opens: 'pane',
    hosts: ['inspector', 'activity-top'],
    tools: [
      { name: 'git_status', summary: 'Show the working tree status of the session workspace', gate: 'read' },
      { name: 'git_diff', summary: 'Show the diff for one file or the whole working tree', gate: 'read' },
      { name: 'git_commit', summary: 'Stage paths and commit the working tree with a message', gate: 'write' },
    ],
  },
  // ── Browser (server-side engine + the pane surface) ──────────────────────
  {
    id: 'browser',
    label: 'Browser',
    opens: 'pane',
    hosts: ['inspector', 'activity-pane'],
    tools: [
      { name: 'open_browser', summary: 'Open a URL in the Web UI browser pane; reuses the session tab when one is open', gate: 'browser' },
      { name: 'browser_read_page', summary: 'Read the visible text of the open page through the server-side engine', gate: 'browser' },
      { name: 'browser_scroll', summary: 'Scroll the open page up, down, to the top or to the bottom', gate: 'browser' },
      { name: 'browser_click', summary: 'Click an element on the open page by selector or visible text', gate: 'browser' },
      { name: 'browser_type', summary: 'Type into an input on the open page (password fields are masked)', gate: 'browser' },
      { name: 'browser_screenshot', summary: 'Screenshot the open page; the image is delivered into the chat', gate: 'browser' },
    ],
  },
  // ── Agent Hub (Settings section) ─────────────────────────────────────────
  {
    id: 'agents',
    label: 'Agents',
    opens: 'settings-section',
    hosts: ['inspector'],
    section: 'agents',
    tools: [],
  },
  // ── Orchestration (Settings section) ─────────────────────────────────────
  {
    id: 'orchestration',
    label: 'Orchestration',
    opens: 'settings-section',
    hosts: ['inspector'],
    section: 'orchestration',
    tools: [],
  },
  // ── Vault (Settings section) ─────────────────────────────────────────────
  {
    id: 'vault',
    label: 'Vault',
    opens: 'settings-section',
    hosts: ['inspector', 'activity-pane'],
    section: 'vault',
    tools: [
      { name: 'vault_search', summary: 'Full-text search the memory vault (FTS5) and return matching notes', gate: 'read' },
    ],
  },
  // ── Skills (Settings section) ────────────────────────────────────────────
  {
    id: 'skills',
    label: 'Skills',
    opens: 'settings-section',
    hosts: ['inspector'],
    section: 'skills',
    tools: [
      { name: 'skill_view', summary: 'Read a skill: its SKILL.md body plus the linked reference files', gate: 'read' },
      { name: 'skill_patch', summary: 'Edit a skill file through the curator (create, patch or append a reference)', gate: 'write' },
    ],
  },
  // ── Archify (its own standalone modal) ───────────────────────────────────
  {
    id: 'archify',
    label: 'Archify',
    opens: 'standalone-modal',
    hosts: ['inspector'],
    tools: [
      { name: 'archify_render', summary: 'Render an Archify diagram IR to HTML or SVG in the artifact store', gate: 'write' },
    ],
  },
  // ── Testing Lab ──────────────────────────────────────────────────────────
  {
    id: 'testing',
    label: 'Testing',
    opens: 'pane',
    hosts: ['inspector', 'activity-pane'],
    tools: [
      { name: 'testing_run', summary: 'Run one test plan: request targets, classify the responses, report', gate: 'write' },
    ],
  },
  // ── Setup (hidden once the instance is bootstrapped) ─────────────────────
  {
    id: 'setup',
    label: 'Setup',
    opens: 'pane',
    hosts: ['inspector'],
    tools: [],
  },
  // ── Plugins ──────────────────────────────────────────────────────────────
  {
    id: 'plugins',
    label: 'Plugins',
    opens: 'pane',
    hosts: ['inspector'],
    tools: [
      { name: 'plugin_list', summary: 'List installed plugins with enabled state and route manifest', gate: 'read' },
      { name: 'plugin_install', summary: 'Register a plugin from a URL (suspended until enabled)', gate: 'write' },
    ],
  },
  // ── Observability ────────────────────────────────────────────────────────
  {
    id: 'observability',
    label: 'Observability',
    opens: 'pane',
    hosts: ['inspector'],
    tools: [
      { name: 'trace_list', summary: 'List recent agent traces (runs) with status and timing', gate: 'read' },
      { name: 'trace_get', summary: 'Read one trace: its spans, tool calls and timing detail', gate: 'read' },
    ],
  },
  // ── Cron ─────────────────────────────────────────────────────────────────
  {
    id: 'cron',
    label: 'Cron',
    opens: 'pane',
    hosts: ['inspector'],
    tools: [
      { name: 'cron_list', summary: 'List scheduled jobs with their schedule and last run', gate: 'read' },
      { name: 'cron_create', summary: 'Create a scheduled job (approval-gated) with a prompt and schedule', gate: 'write' },
    ],
  },
  // ── Loops (REQ-201) ─────────────────────────────────────────────────────
  // Harness-owned loops. Deliberately NOT Hermes' `~/.hermes/loops/` trees:
  // only loops created inside this harness (by the user or by the agent) are
  // catalogued, which is the distinction the request turns on.
  //
  // `hosts: []` on purpose — the rail entry arrives WITH the Loops console
  // (REQ-202), not before it. A rail entry whose pane does not exist yet is a
  // dead button, which is worse than a surface the model can reach but the
  // user has not been given a click path to. The catalog rows below still do
  // their real job now: they are what `READ_TOOLS`/`WRITE_TOOLS` derive from
  // and what `<available_surfaces>` advertises.
  {
    id: 'loops',
    label: 'Loops',
    opens: 'pane',
    hosts: [],
    tools: [
      { name: 'loop_list', summary: 'List loops with status, trigger, spent budget and last turn outcome', gate: 'read' },
      { name: 'loop_create', summary: 'Create a repeating loop (approval-gated) with a prompt, cwd and trigger', gate: 'write' },
    ],
  },
  // ── Extras ───────────────────────────────────────────────────────────────
  {
    id: 'extras',
    label: 'Extras',
    opens: 'pane',
    hosts: ['inspector'],
    tools: [],
  },
  // ── Memory (Settings section) ────────────────────────────────────────────
  {
    id: 'memory',
    label: 'Memory',
    opens: 'settings-section',
    hosts: ['inspector'],
    section: 'memory',
    tools: [
      { name: 'memory_read', summary: 'Read the agent or user memory files', gate: 'read' },
      { name: 'memory_write', summary: 'Append or replace one memory entry', gate: 'write' },
    ],
  },
  // ── Todos ────────────────────────────────────────────────────────────────
  {
    id: 'todos',
    label: 'Todos',
    opens: 'pane',
    hosts: ['inspector'],
    tools: [
      { name: 'list_todos', summary: 'List the shared todo board', gate: 'read' },
      { name: 'claim_todo', summary: 'Claim a todo so other agents leave it alone', gate: 'write' },
      { name: 'complete_todo', summary: 'Mark a claimed todo complete', gate: 'write' },
    ],
  },
  // ── Account (activity bar only; opens Settings on Account) ───────────────
  {
    id: 'account',
    label: 'Account',
    opens: 'settings-section',
    hosts: ['activity-bottom'],
    section: 'account',
    tools: [],
  },
  // ── Top-level modes (header switch) ──────────────────────────────────────
  {
    id: 'chat',
    label: 'Lokma',
    opens: 'mode',
    hosts: ['mode'],
    tools: [
      { name: 'send_file', summary: 'Attach a workspace file to the chat (images render inline)', gate: 'write' },
      { name: 'ask_user', summary: 'Ask the user a question with answer options and wait for the reply', gate: 'interactive' },
    ],
  },
  {
    id: 'bots',
    label: 'Bots',
    opens: 'mode',
    hosts: ['mode'],
    tools: [],
  },
  {
    id: 'design',
    label: 'Design',
    opens: 'mode',
    hosts: ['mode'],
    tools: [
      { name: 'design_generate', summary: 'Generate a design artifact from a brief through a real model', gate: 'write' },
      { name: 'design_list', summary: 'List design artifacts in the selected project scope', gate: 'read' },
      { name: 'design_critique', summary: 'Critique an artifact against the DESIGN.md guard and store the notes', gate: 'write' },
    ],
  },
];

/** One tool row with its owning surface (flat view for prompts + gates). */
export type SurfaceToolRow = SurfaceTool & { surface: SurfaceId };

const SURFACE_BY_ID = new Map<SurfaceId, Surface>(SURFACES.map((s) => [s.id, s]));
const TOOL_ROWS: readonly SurfaceToolRow[] = SURFACES.flatMap((surface) =>
  surface.tools.map((tool) => ({ ...tool, surface: surface.id })),
);
const TOOL_BY_NAME = new Map<string, SurfaceToolRow>(TOOL_ROWS.map((row) => [row.name, row]));

/** Look up one surface by id. */
export function surfaceById(id: SurfaceId): Surface | undefined {
  return SURFACE_BY_ID.get(id);
}

/** Surfaces rendered into one chrome host, in catalog order. */
export function surfacesWithHost(host: SurfaceHost): Surface[] {
  return SURFACES.filter((surface) => surface.hosts.includes(host));
}

/** Every agent tool declared by the catalog (flat, with surface ids). */
export function surfaceToolRows(): SurfaceToolRow[] {
  return [...TOOL_ROWS];
}

/** Every declared agent tool name. */
export function surfaceToolNames(): string[] {
  return TOOL_ROWS.map((row) => row.name);
}

/** Look up one declared tool by name. */
export function surfaceTool(name: string): SurfaceToolRow | undefined {
  return TOOL_BY_NAME.get(name);
}

/** Tool names that carry one permission class (the gate inputs). */
export function surfaceToolNamesByGate(gate: SurfaceToolGate): string[] {
  return TOOL_ROWS.filter((row) => row.gate === gate).map((row) => row.name);
}

/** Human line for one tool: "name — summary" (prompt + list building). */
export function surfaceToolLine(row: SurfaceToolRow): string {
  return `${row.name} — ${row.summary}`;
}
