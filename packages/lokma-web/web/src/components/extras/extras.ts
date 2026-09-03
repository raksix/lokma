/**
 * ExtrasPane pure helpers — the W6-26 feature-flag board catalog.
 *
 * The 23 ranked agent-system extras come from Docs/30 (same list and order
 * the concept `ExtrasPane` renders). Each row is either SHIPPED (a live
 * Inspector tab via `tab`, or a real surface named in `where` when it is not
 * a tab — chat Composer, Sessions sidebar) or a ROADMAP todo (a real
 * `features.extras.*` flag persisted via `PATCH /api/config` to the same
 * `~/.lokma/config.json` the CLI reads, plus the real milestone that unlocks
 * it — never a dead switch; #20 waits on W7 so it is milestone-only).
 */

/** Inspector tabs a shipped extra can open. */
export type ExtrasTabId =
  | 'agents'
  | 'bots'
  | 'browser'
  | 'cron'
  | 'git'
  | 'observability'
  | 'orchestration'
  | 'plugins'
  | 'setup'
  | 'skills'
  | 'testing'
  | 'vault';

export type ExtrasFilter = 'all' | 'done' | 'todo';

export type ExtraItem = {
  n: number;
  /** Kebab-case id ( doubles as documentation anchor, never a config key). */
  slug: string;
  title: string;
  why: string;
  how: string;
  /** Where the capability lives today (shipped) or will live (todo). */
  where: string;
  shipped: boolean;
  /** Shipped rows living in an Inspector tab — the Open button jumps there. */
  tab?: ExtrasTabId;
  /** Roadmap rows: the `features` map key persisted via `PATCH /api/config`. */
  flag?: string;
  /** Roadmap rows: the real wave/capability that unlocks the item. */
  milestone?: string;
};

/**
 * The 23 ranked extras (Docs/30 §extras, concept `EXTRAS` titles 1:1).
 * `shipped` is static truth about which waves landed (W0-W6): only rows
 * whose surface exists in this checkout are marked.
 */
export const EXTRAS: ExtraItem[] = [
  { n: 1, slug: 'agent-templates', title: 'Agent templates marketplace', why: 'Clone reviewer/planner in 1 click', how: 'bot.json + Registry + Hub', where: 'Bots tab → Featured / Mine / Shared', shipped: true, tab: 'bots' },
  { n: 2, slug: 'per-agent-budgets', title: 'Per-agent budgets (hard 80% alert)', why: 'Stop runaway spend', how: 'TokenLedger agentId + 80% toast', where: 'Agents tab → budget editor', shipped: true, tab: 'agents' },
  { n: 3, slug: 'eval-harness', title: 'Eval harness', why: 'Score agents on real tasks', how: '20-task suite + Cron weekly-eval', where: 'Cron tab (when the runner daemon lands)', shipped: false, flag: 'extras.eval-harness', milestone: 'Phase 3 — needs the Cron runner daemon + a 20-task suite' },
  { n: 4, slug: 'time-travel-fork', title: 'Time-travel fork', why: 'Branch from any message', how: 'Fork button → new session from checkpoint', where: 'Sessions sidebar → Fork', shipped: true },
  { n: 5, slug: 'per-agent-cron', title: 'Per-agent cron', why: 'Autonomous nightly jobs', how: 'CronApprovalsPane — 0 3 * * *', where: 'Cron tab → per-agent jobs', shipped: true, tab: 'cron' },
  { n: 6, slug: 'hitl-approvals', title: 'Human-in-the-loop approvals', why: 'Gate risky tools', how: 'permission_request card + Always', where: 'Cron tab → approval rules (same store as the chat card)', shipped: true, tab: 'cron' },
  { n: 7, slug: 'observability-trace', title: 'Observability trace', why: 'Debug N agents', how: 'ObservabilityPane timeline + replay', where: 'Observability tab → trace timeline', shipped: true, tab: 'observability' },
  { n: 8, slug: 'handoff-protocol', title: 'Handoff protocol', why: 'Pass session to another agent', how: 'drag session → agent card', where: 'Agent Hub (when the agent bus lands)', shipped: false, flag: 'extras.session-handoff', milestone: 'Phase 3 — needs the agent bus (Docs/30 §9)' },
  { n: 9, slug: 'auto-scaling', title: 'Auto-scaling maxConcurrent', why: 'Load-based', how: 'queue depth → scale 5→10', where: 'Agents tab → caps banner (when the runner lands)', shipped: false, flag: 'extras.auto-scale', milestone: 'Phase 3 — needs the runner queue' },
  { n: 10, slug: 'agent-sandbox', title: 'Sandbox per agent (docker|host)', why: 'Isolation', how: 'worktree + docker flag', where: 'Agents tab → sandbox badge (when worktree isolation lands)', shipped: false, flag: 'extras.agent-sandbox', milestone: 'Phase 3 — needs worktree isolation + a docker flag' },
  { n: 11, slug: 'browser-per-agent', title: 'Browser per agent', why: 'Parallel UI verify', how: 'BrowserPane per agentId', where: 'Browser tab → per-agent tabs', shipped: true, tab: 'browser' },
  { n: 12, slug: 'skill-sharing', title: 'Skill sharing across agents', why: 'Reuse', how: 'VaultPort + skill_view', where: 'Skills tab → registry + curator patch', shipped: true, tab: 'skills' },
  { n: 13, slug: 'voice-per-agent', title: 'Voice per agent', why: 'Hands-free', how: 'Web Speech API per Composer', where: 'Chat Composer → mic button', shipped: true },
  { n: 14, slug: 'adversarial-review', title: 'Agent-vs-agent adversarial review', why: 'Verifier vote', how: '2 agents + vote card', where: 'Chat (when the vote card lands)', shipped: false, flag: 'extras.adversarial-review', milestone: 'Phase 3 — needs a 2-agent vote card' },
  { n: 15, slug: 'delegation-model', title: 'Token-tiered delegationModel', why: 'Cheap delegation', how: 'haiku for sub-tasks', where: 'Agents tab → per-agent model (when runner routing lands)', shipped: false, flag: 'extras.delegation-model', milestone: 'Needs runner model routing' },
  { n: 16, slug: 'worktree-gc', title: 'Worktree GC (ttl 7d)', why: 'Clean disk', how: '.lokma/worktrees ttl_days', where: 'Git tab → GC button (manual prune today; TTL sweeper is Phase 3)', shipped: true, tab: 'git' },
  { n: 17, slug: 'replay-rerun', title: 'Replay deterministic re-run', why: 'Reproduce bug', how: 'Observability Replay button', where: 'Observability tab → Replay', shipped: true, tab: 'observability' },
  { n: 18, slug: 'mcp-agent-template', title: 'MCP agentTemplate import', why: 'Import from MCP', how: 'PluginMarketplace + agentTemplate', where: 'Plugins tab (when the marketplace fetch wave lands)', shipped: false, flag: 'extras.mcp-agent-template', milestone: 'Needs the marketplace fetch wave (URL records own no routes yet)' },
  { n: 19, slug: 'affinity-steal', title: 'Affinity + work-stealing', why: 'Balance', how: 'Coordinator steals idle', where: 'Orchestration tab (when the coordinator lands)', shipped: false, flag: 'extras.affinity-steal', milestone: 'Phase 3 — needs the coordinator' },
  { n: 20, slug: 'session-drag-handoff', title: 'Session → agent drag handoff', why: 'UX', how: 'Sidebar drag → Hub', where: 'Sessions sidebar → Agent Hub (when the W7 pane system lands)', shipped: false, milestone: 'Needs the W7 pane system (drag session → agent card)' },
  { n: 21, slug: 'doctor-agents', title: 'lokma doctor --agents', why: 'Health', how: 'SetupWizard doctor 8 checks', where: 'Setup tab → Doctor terminal', shipped: true, tab: 'setup' },
  { n: 22, slug: 'vault-provenance', title: 'Vault graph provenance agentId', why: 'Who wrote what', how: 'VaultPane provenance pill', where: 'Vault tab → provenance badges', shipped: true, tab: 'vault' },
  { n: 23, slug: 'trace-share', title: 'Per-agent trace share', why: 'Share debug', how: '/share/agent/<id>', where: 'Observability tab → Share', shipped: true, tab: 'observability' },
];

/** A row counts as shipped exactly when its surface exists in this checkout. */
export function isShipped(e: ExtraItem): boolean {
  return e.shipped;
}

/** Shipped rows in the catalog. */
export function countDone(items: ExtraItem[]): number {
  return items.filter((e) => e.shipped).length;
}

/** Shipped/total as a whole percent, e.g. 14/23 → 61. */
export function progressPct(items: ExtraItem[]): number {
  if (items.length === 0) return 0;
  return Math.round((countDone(items) / items.length) * 100);
}

/** All/Done/Todo filter over the catalog. */
export function filterExtras(items: ExtraItem[], filter: ExtrasFilter): ExtraItem[] {
  if (filter === 'done') return items.filter((e) => e.shipped);
  if (filter === 'todo') return items.filter((e) => !e.shipped);
  return [...items];
}

/** Read the `features` map out of a `GET /api/config` payload (unknown shape). */
export function readFeatures(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== 'object') return {};
  const root = raw as Record<string, unknown>;
  const cfg = (root.config ?? {}) as Record<string, unknown>;
  const features = cfg.features;
  if (!features || typeof features !== 'object' || Array.isArray(features)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(features as Record<string, unknown>)) {
    if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/**
 * Build the `PATCH /api/config` body for one flag flip.
 * The server shallow-merges top-level keys, so the WHOLE features map must
 * travel (same full-object pattern as the chat permission card) — a partial
 * map would wipe the SetupPane stack flags.
 */
export function buildFeaturesPatch(
  current: Record<string, boolean>,
  key: string,
  value: boolean,
): { features: Record<string, boolean> } {
  return { features: { ...current, [key]: value } };
}
