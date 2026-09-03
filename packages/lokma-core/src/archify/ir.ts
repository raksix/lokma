/**
 * Archify IR — typed diagram JSON (Lokma-native renderer, Docs/31 contract).
 * The agent produces structured JSON, Lokma validates (5 atomic gates) and
 * builds deterministic self-contained HTML/SVG — no Mermaid, no CDN.
 * Five types share presets, themes, trace animation, one validation pipeline.
 */

export const ARCHIFY_TYPES = ['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle'] as const;
export type ArchifyType = (typeof ARCHIFY_TYPES)[number];

export const ARCHIFY_PRESETS = ['signal-flow', 'blueprint', 'classic', 'minimal'] as const;
export type ArchifyPreset = (typeof ARCHIFY_PRESETS)[number];

export const ARCHIFY_THEMES = ['dark', 'light'] as const;
export type ArchifyTheme = (typeof ARCHIFY_THEMES)[number];

/** Node caps — the pane renders SVG, unbounded diagrams would freeze it. */
export const ARCHIFY_MAX_NODES = 48;
export const ARCHIFY_MAX_EDGES = 120;
export const ARCHIFY_MAX_LABEL = 48;
export const ARCHIFY_MAX_EDGE_LABEL = 40;
export const ARCHIFY_MAX_TITLE = 120;
/** Canvas-fit heuristic behind the `layout` gate (1200x630 share card). */
export const ARCHIFY_MAX_COLUMNS = 6;
export const ARCHIFY_MAX_ROWS = 12;

export type ArchifyNode = {
  id: string;
  label: string;
  /** Open vocabulary (`service/db/queue/gateway/step/actor/state/...`) — the viewer lens filters on it. */
  kind?: string;
};

export type ArchifyEdge = {
  from: string;
  to: string;
  label?: string;
};

export type ArchifyIR = {
  type: ArchifyType;
  preset: ArchifyPreset;
  theme: ArchifyTheme;
  title: string;
  nodes: ArchifyNode[];
  edges: ArchifyEdge[];
  /** Ordered node ids replayed by the viewer trace animation. */
  trace?: string[];
};

export type ReceiptGate = 'schema' | 'layout' | 'route' | 'label' | 'share';

export type ReceiptRow = { gate: ReceiptGate; status: 'pass' | 'fail'; msg: string };

export type GateError = { gate: ReceiptGate; message: string };

export type ValidateResult = { ok: boolean; errors: GateError[]; receipt: ReceiptRow[] };

/** Typed error — routes map `code`/`status` straight into `{ code, message }`. */
export class ArchifyError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ArchifyError';
    this.code = code;
    this.status = status;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate an IR through the 5 atomic gates (Docs/31 §2.1).
 * Schema → layout → route → label → share. All gates always run so the
 * receipt table is complete; `ok` is true only when every gate passes.
 * Never throws on bad input — failures come back as gate errors.
 */
export function validateIr(raw: unknown): ValidateResult {
  const errors: GateError[] = [];
  const receipt: ReceiptRow[] = [];

  if (!isRecord(raw)) {
    errors.push({ gate: 'schema', message: 'ir must be a JSON object' });
    return { ok: false, errors, receipt: failReceipt('schema', 'ir must be a JSON object') };
  }

  // Gate 1 — schema: enums + required shapes.
  let ir: ArchifyIR | null = null;
  const schemaProblems: string[] = [];
  if (!ARCHIFY_TYPES.includes(raw.type as ArchifyType)) {
    schemaProblems.push(`type must be one of ${ARCHIFY_TYPES.join('|')}`);
  }
  if (!ARCHIFY_PRESETS.includes(raw.preset as ArchifyPreset)) {
    schemaProblems.push(`preset must be one of ${ARCHIFY_PRESETS.join('|')}`);
  }
  if (!ARCHIFY_THEMES.includes(raw.theme as ArchifyTheme)) {
    schemaProblems.push('theme must be dark|light');
  }
  if (!Array.isArray(raw.nodes)) schemaProblems.push('nodes must be an array');
  if (!Array.isArray(raw.edges)) schemaProblems.push('edges must be an array');
  if (raw.trace !== undefined && !Array.isArray(raw.trace)) schemaProblems.push('trace must be an array of node ids');
  if (schemaProblems.length > 0) {
    for (const message of schemaProblems) errors.push({ gate: 'schema', message });
    receipt.push({ gate: 'schema', status: 'fail', msg: schemaProblems[0] as string });
  } else {
    receipt.push({ gate: 'schema', status: 'pass', msg: 'type/preset/nodes valid' });
    ir = raw as unknown as ArchifyIR;
  }

  const nodes: ArchifyNode[] = ir && Array.isArray(ir.nodes) ? ir.nodes : [];
  const edges: ArchifyEdge[] = ir && Array.isArray(ir.edges) ? ir.edges : [];
  const trace: string[] = ir && Array.isArray(ir.trace) ? (ir.trace as string[]) : [];
  const ids = new Set(nodes.map((n) => (isRecord(n) ? String(n.id ?? '') : '')));

  // Gate 2 — layout: counts, unique ids, label lengths, 1200x630 fit.
  if (ir) {
    const problems: string[] = [];
    if (nodes.length < 1) problems.push('at least 1 node required');
    if (nodes.length > ARCHIFY_MAX_NODES) problems.push(`at most ${ARCHIFY_MAX_NODES} nodes`);
    if (edges.length > ARCHIFY_MAX_EDGES) problems.push(`at most ${ARCHIFY_MAX_EDGES} edges`);
    if (ids.size !== nodes.length) problems.push('node ids must be unique');
    for (const n of nodes) {
      if (!isRecord(n) || typeof n.id !== 'string' || !n.id.trim()) problems.push('every node needs a non-empty id');
      else if (n.id.length > 64) problems.push(`node id too long: ${n.id.slice(0, 24)}`);
      if (!isRecord(n) || typeof n.label !== 'string' || !n.label.trim()) problems.push('every node needs a non-empty label');
      else if (n.label.length > ARCHIFY_MAX_LABEL) problems.push(`node label too long: ${n.label.slice(0, 24)}`);
    }
    const columns = columnCount(nodes, edges);
    const rows = maxColumnRows(nodes, edges);
    if (columns > ARCHIFY_MAX_COLUMNS || rows > ARCHIFY_MAX_ROWS) {
      problems.push('1200×630 fit exceeded — split the diagram or shorten the chain');
    }
    if (problems.length > 0) {
      for (const message of problems) errors.push({ gate: 'layout', message });
      receipt.push({ gate: 'layout', status: 'fail', msg: problems[0] as string });
    } else {
      receipt.push({ gate: 'layout', status: 'pass', msg: '1200×630 fit, no overlap' });
    }
  } else {
    receipt.push({ gate: 'layout', status: 'fail', msg: 'skipped — schema failed' });
  }

  // Gate 3 — route: edges + trace resolve to real nodes, no self-loops.
  if (ir) {
    const problems: string[] = [];
    for (const e of edges) {
      if (!isRecord(e) || typeof e.from !== 'string' || typeof e.to !== 'string') {
        problems.push('every edge needs string from/to');
        continue;
      }
      if (!ids.has(e.from)) problems.push(`edge from unknown node: ${e.from}`);
      if (!ids.has(e.to)) problems.push(`edge to unknown node: ${e.to}`);
      if (e.from === e.to) problems.push(`self-loop not routable: ${e.from}`);
    }
    for (const t of trace) {
      if (typeof t !== 'string' || !ids.has(t)) problems.push(`trace references unknown node: ${String(t)}`);
    }
    if (problems.length > 0) {
      for (const message of problems) errors.push({ gate: 'route', message });
      receipt.push({ gate: 'route', status: 'fail', msg: problems[0] as string });
    } else {
      receipt.push({ gate: 'route', status: 'pass', msg: 'edges routable' });
    }
  } else {
    receipt.push({ gate: 'route', status: 'fail', msg: 'skipped — schema failed' });
  }

  // Gate 4 — label: edge labels fit the route clearance.
  if (ir) {
    const problems: string[] = [];
    for (const e of edges) {
      if (isRecord(e) && e.label !== undefined && (typeof e.label !== 'string' || e.label.length > ARCHIFY_MAX_EDGE_LABEL)) {
        problems.push(`edge label too long (${ARCHIFY_MAX_EDGE_LABEL} max): ${String(e.from)}→${String(e.to)}`);
      }
    }
    if (problems.length > 0) {
      for (const message of problems) errors.push({ gate: 'label', message });
      receipt.push({ gate: 'label', status: 'fail', msg: problems[0] as string });
    } else {
      receipt.push({ gate: 'label', status: 'pass', msg: 'label↔route clearance' });
    }
  } else {
    receipt.push({ gate: 'label', status: 'fail', msg: 'skipped — schema failed' });
  }

  // Gate 5 — share: title present + trace non-empty (the card needs a route).
  if (ir) {
    const problems: string[] = [];
    if (typeof ir.title !== 'string' || !ir.title.trim()) problems.push('title is required for the share card');
    else if (ir.title.length > ARCHIFY_MAX_TITLE) problems.push(`title too long (${ARCHIFY_MAX_TITLE} max)`);
    if (trace.length === 0) problems.push('trace is empty — the share card needs a route');
    if (problems.length > 0) {
      for (const message of problems) errors.push({ gate: 'share', message });
      receipt.push({ gate: 'share', status: 'fail', msg: problems[0] as string });
    } else {
      receipt.push({ gate: 'share', status: 'pass', msg: '1200×630 card OK' });
    }
  } else {
    receipt.push({ gate: 'share', status: 'fail', msg: 'skipped — schema failed' });
  }

  return { ok: errors.length === 0, errors, receipt };
}

function failReceipt(gate: ReceiptGate, msg: string): ReceiptRow[] {
  const gates: ReceiptGate[] = ['schema', 'layout', 'route', 'label', 'share'];
  return gates.map((g) => ({ gate: g, status: 'fail' as const, msg: g === gate ? msg : `skipped — ${gate} failed` }));
}

/** Assert a validated IR — throws `invalid_ir` with the first gate message. */
export function assertValidIr(raw: unknown): ArchifyIR {
  const result = validateIr(raw);
  if (!result.ok || !isRecord(raw)) {
    const first = result.errors[0];
    throw new ArchifyError('invalid_ir', first ? `[${first.gate}] ${first.message}` : 'invalid IR', 400);
  }
  return raw as unknown as ArchifyIR;
}

/** Column assignment shared by validation + the renderer (single source). */
export function layoutColumns(nodes: ArchifyNode[], edges: ArchifyEdge[]): Map<string, number> {
  const incoming = new Map<string, number>();
  for (const n of nodes) incoming.set(n.id, 0);
  for (const e of edges) {
    if (isRecord(e) && typeof e.from === 'string' && typeof e.to === 'string' && incoming.has(e.to) && e.from !== e.to) {
      incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
    }
  }
  const columns = new Map<string, number>();
  const queue: string[] = [];
  for (const n of nodes) {
    if ((incoming.get(n.id) ?? 0) === 0) {
      columns.set(n.id, 0);
      queue.push(n.id);
    }
  }
  // Deterministic: process in node order so the layout never shifts.
  const outEdges = new Map<string, string[]>();
  for (const n of nodes) outEdges.set(n.id, []);
  for (const e of edges) {
    if (isRecord(e) && outEdges.has(e.from as string) && incoming.has(e.to as string)) {
      (outEdges.get(e.from as string) as string[]).push(e.to as string);
    }
  }
  while (queue.length > 0) {
    const id = queue.shift() as string;
    const col = columns.get(id) ?? 0;
    for (const next of outEdges.get(id) ?? []) {
      if (!columns.has(next)) {
        columns.set(next, col + 1);
        queue.push(next);
      }
    }
  }
  // Cycles / disconnected nodes append in order instead of vanishing.
  let fallback = 0;
  for (const n of nodes) {
    if (!columns.has(n.id)) {
      columns.set(n.id, fallback);
      fallback += 1;
    }
  }
  // Normalize so columns are dense 0..k.
  const sorted = [...new Set(columns.values())].sort((a, b) => a - b);
  const remap = new Map(sorted.map((c, i) => [c, i]));
  for (const [id, col] of columns) columns.set(id, remap.get(col) ?? col);
  return columns;
}

function columnCount(nodes: ArchifyNode[], edges: ArchifyEdge[]): number {
  if (nodes.length === 0) return 0;
  const cols = layoutColumns(nodes, edges);
  return Math.max(...cols.values()) + 1;
}

function maxColumnRows(nodes: ArchifyNode[], edges: ArchifyEdge[]): number {
  if (nodes.length === 0) return 0;
  const cols = layoutColumns(nodes, edges);
  const per = new Map<number, number>();
  for (const n of nodes) {
    const c = cols.get(n.id) ?? 0;
    per.set(c, (per.get(c) ?? 0) + 1);
  }
  return Math.max(...per.values());
}
