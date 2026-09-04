import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ensureDir, expandHome, writeAtomic } from '../utils/fs.js';
import type { ArchifyIR, ArchifyPreset, ArchifyTheme, ArchifyType, ReceiptRow } from './ir.js';
import { ARCHIFY_PRESETS, ARCHIFY_THEMES, ARCHIFY_TYPES, ArchifyError, assertValidIr, validateIr } from './ir.js';
import { buildShareCard, buildStandaloneHtml, buildSvg, esc } from './render.js';

/**
 * Archify store — the single DRY implementation behind `/api/archify/*`.
 * Root: `~/.lokma/archify/<id>/` (Docs/31 §6.2):
 * `ir.json` (source of truth) + `index.html` (viewer) + `diagram.svg` +
 * `share.svg` (1200x630 card) + `receipt.json` (+ `delta.html` on compare).
 * Same store for CLI + web — one loop, like sessions.
 */

/** Archify root (global, same for CLI + web). */
export const ARCHIFY_DIR = '~/.lokma/archify';
/** Max prompt chars accepted by `generateDiagram()`. */
export const ARCHIFY_PROMPT_CAP = 2000;
/** Max nodes a generated starter IR may hold. */
export const ARCHIFY_GENERATE_MAX_NODES = 8;
/** Max diagrams listed (the pane renders rows, not a virtual list). */
export const ARCHIFY_LIST_CAP = 200;

export type DiagramSummary = {
  id: string;
  type: ArchifyType;
  preset: ArchifyPreset;
  theme: ArchifyTheme;
  title: string;
  nodeCount: number;
  edgeCount: number;
  updatedAt: string;
};

export type DiagramDetail = {
  id: string;
  ir: ArchifyIR;
  receipt: ReceiptRow[];
  /** The self-contained viewer HTML (the pane renders it in a sandbox). */
  html: string;
};

export type DiagramDiff = {
  added: string[];
  removed: string[];
  /** Node ids whose label or kind changed. */
  changed: string[];
  /** Edge keys (`from→to`) added or removed. */
  rerouted: string[];
};

/** Absolute archify root on this machine. */
export function archifyRoot(): string {
  return expandHome(ARCHIFY_DIR);
}

/**
 * Validate a diagram id (a single path segment — no traversal into the root).
 * Throws `bad_id` (shape) — unknown-but-valid ids throw `diagram_not_found`.
 */
export function assertDiagramId(raw: unknown): string {
  if (typeof raw !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(raw)) {
    throw new ArchifyError('bad_id', 'diagram id must match [a-z0-9-]{2,64}', 400);
  }
  return raw;
}

function dirOf(id: string): string {
  return join(archifyRoot(), id);
}

/** Read + validate a stored IR (404 on unknown or corrupt). Exported for the PNG raster path. */
export async function readStoredIr(id: string): Promise<ArchifyIR> {
  let raw: string;
  try {
    raw = await readFile(join(dirOf(id), 'ir.json'), 'utf-8');
  } catch {
    throw new ArchifyError('diagram_not_found', `no diagram: ${id}`, 404);
  }
  try {
    return assertValidIr(JSON.parse(raw));
  } catch {
    throw new ArchifyError('diagram_not_found', `no diagram: ${id}`, 404);
  }
}

async function readReceipt(id: string): Promise<ReceiptRow[]> {
  try {
    const raw = await readFile(join(dirOf(id), 'receipt.json'), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as ReceiptRow[];
    return [];
  } catch {
    return [];
  }
}

/** Persist a validated IR + rebuild every derived artifact. */
export async function saveDiagram(id: string, ir: ArchifyIR): Promise<{ id: string; receipt: ReceiptRow[] }> {
  const { receipt } = validateIr(ir);
  // Absolute paths pass through writeAtomic/ensureDir untouched (expandHome
  // only rewrites a leading `~`), so no string juggling is needed.
  const dir = dirOf(id);
  await mkdir(dir, { recursive: true });
  await writeAtomic(join(dir, 'ir.json'), JSON.stringify(ir, null, 2));
  await writeAtomic(join(dir, 'index.html'), buildStandaloneHtml(ir));
  await writeAtomic(join(dir, 'diagram.svg'), buildSvg(ir));
  await writeAtomic(join(dir, 'share.svg'), buildShareCard(ir));
  await writeAtomic(join(dir, 'receipt.json'), JSON.stringify(receipt, null, 2));
  return { id, receipt };
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug || 'diagram';
}

function kindFor(type: ArchifyType, label: string, position: number, total: number): string {
  const low = label.toLowerCase();
  if (/(sqlite|postgres|mysql|mongo|redis|db|database|store|fts5|ledger)/.test(low)) return 'db';
  if (/(queue|kafka|bus|pubsub|stream)/.test(low)) return 'queue';
  if (/(gateway|api|proxy|nginx|endpoint)/.test(low)) return 'gateway';
  if (type === 'sequence') return 'actor';
  if (type === 'lifecycle') return 'state';
  if (type === 'workflow') return 'step';
  if (type === 'dataflow') return position === 0 ? 'source' : position === total - 1 ? 'sink' : 'transform';
  return 'service';
}

function nodeId(label: string, taken: Set<string>): string {
  let base = slugify(label).slice(0, 24) || 'node';
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  let i = 2;
  while (taken.has(`${base}-${i}`)) i += 1;
  taken.add(`${base}-${i}`);
  return `${base}-${i}`;
}

/**
 * Generate a starter IR from a prompt — deterministic derivation, no LLM.
 * Splits the prompt on chain separators (`->`, `→`, `>`, `,`, `;`, newline)
 * so `web -> api -> db` becomes three linked nodes; a plain sentence becomes
 * one node the user edits in the pane. Always valid (fails closed otherwise).
 */
export function deriveIr(
  type: ArchifyType,
  prompt: string,
  preset: ArchifyPreset,
  theme: ArchifyTheme,
): ArchifyIR {
  const parts = prompt
    .split(/->|→|=>|[,;\n]+/)
    .map((s) => s.replace(/^[>\-*\s]+/, '').trim().replace(/\s+/g, ' '))
    .filter((s) => s.length > 0)
    .slice(0, ARCHIFY_GENERATE_MAX_NODES);
  const segments = parts.length > 0 ? parts : [prompt.trim().slice(0, 80) || 'untitled'];
  const taken = new Set<string>();
  const nodes = segments.map((label, i) => ({
    id: nodeId(label, taken),
    label: label.slice(0, 48),
    kind: kindFor(type, label, i, segments.length),
  }));
  const edges = nodes.slice(1).map((n, i) => ({
    from: (nodes[i] as { id: string }).id,
    to: n.id,
    label: type === 'dataflow' ? 'flows' : type === 'sequence' ? 'calls' : '',
  }));
  const title = prompt.trim().replace(/\s+/g, ' ').slice(0, 80) || 'untitled';
  return {
    type,
    preset,
    theme,
    title,
    nodes,
    edges: edges.map((e) => (e.label ? e : { from: e.from, to: e.to })),
    trace: nodes.map((n) => n.id),
  };
}

/** Create + persist a diagram from a prompt (validates before writing). */
export async function generateDiagram(
  typeRaw: unknown,
  promptRaw: unknown,
  presetRaw: unknown,
  themeRaw: unknown,
): Promise<{ id: string; ir: ArchifyIR }> {
  if (!ARCHIFY_TYPES.includes(typeRaw as ArchifyType)) {
    throw new ArchifyError('bad_type', `type must be one of ${ARCHIFY_TYPES.join('|')}`, 400);
  }
  if (typeof promptRaw !== 'string' || !promptRaw.trim()) {
    throw new ArchifyError('bad_prompt', 'prompt must be a non-empty string', 400);
  }
  if (promptRaw.length > ARCHIFY_PROMPT_CAP) {
    throw new ArchifyError('bad_prompt', `prompt too long (${ARCHIFY_PROMPT_CAP} max)`, 400);
  }
  const preset: ArchifyPreset = ARCHIFY_PRESETS.includes(presetRaw as ArchifyPreset)
    ? (presetRaw as ArchifyPreset)
    : 'signal-flow';
  const theme: ArchifyTheme = ARCHIFY_THEMES.includes(themeRaw as ArchifyTheme) ? (themeRaw as ArchifyTheme) : 'dark';
  const type = typeRaw as ArchifyType;
  const ir = deriveIr(type, promptRaw, preset, theme);
  const check = validateIr(ir);
  if (!check.ok) {
    throw new ArchifyError('invalid_ir', check.errors[0]?.message ?? 'generated IR invalid', 500);
  }
  const id = `${slugify(promptRaw).slice(0, 32) || 'diagram'}-${Date.now().toString(36)}`;
  assertDiagramId(id);
  await saveDiagram(id, ir);
  return { id, ir };
}

/** Update a diagram's IR (the pane's JSON editor) — validates, rebuilds. */
export async function updateDiagram(idRaw: unknown, irRaw: unknown): Promise<{ id: string; receipt: ReceiptRow[] }> {
  const id = assertDiagramId(idRaw);
  await readStoredIr(id); // 404 on unknown before touching disk.
  const ir = assertValidIr(irRaw);
  return saveDiagram(id, ir);
}

/** List diagrams (newest first, capped). Missing/corrupt dirs are skipped. */
export async function listDiagrams(): Promise<{ items: DiagramSummary[]; count: number }> {
  await ensureDir(ARCHIFY_DIR);
  let names: string[];
  try {
    names = await readdir(archifyRoot());
  } catch {
    return { items: [], count: 0 };
  }
  const items: DiagramSummary[] = [];
  for (const name of names.slice(0, ARCHIFY_LIST_CAP * 2)) {
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(name)) continue;
    try {
      const st = await stat(join(dirOf(name), 'ir.json'));
      if (!st.isFile()) continue;
      const ir = await readStoredIr(name);
      items.push({
        id: name,
        type: ir.type,
        preset: ir.preset,
        theme: ir.theme,
        title: ir.title,
        nodeCount: ir.nodes.length,
        edgeCount: ir.edges.length,
        updatedAt: st.mtime.toISOString(),
      });
    } catch {
      continue;
    }
    if (items.length >= ARCHIFY_LIST_CAP) break;
  }
  items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return { items, count: items.length };
}

/** Full detail for the viewer + IR tabs. */
export async function getDiagram(idRaw: unknown): Promise<DiagramDetail> {
  const id = assertDiagramId(idRaw);
  const ir = await readStoredIr(id);
  const receipt = await readReceipt(id);
  return { id, ir, receipt, html: buildStandaloneHtml(ir) };
}

/**
 * Delete a diagram — removes its whole on-disk dir (`ir.json` +
 * viewer + exports + receipt + delta). Unknown ids 404 via
 * `readStoredIr` before anything is touched; bad shapes 400 via
 * `assertDiagramId`. The id is validated to a single path segment so
 * `rm` can never escape the archify root.
 */
export async function deleteDiagram(idRaw: unknown): Promise<{ id: string }> {
  const id = assertDiagramId(idRaw);
  await readStoredIr(id); // 404 on unknown before touching disk.
  await rm(dirOf(id), { recursive: true, force: true });
  return { id };
}

export type ExportFormat = 'svg' | 'html' | 'json' | 'card';

/** Raw export bytes for the download endpoint (files already on disk). */
export async function exportDiagram(idRaw: unknown, formatRaw: unknown): Promise<{ filename: string; contentType: string; body: string }> {
  const id = assertDiagramId(idRaw);
  if (formatRaw !== 'svg' && formatRaw !== 'html' && formatRaw !== 'json' && formatRaw !== 'card') {
    throw new ArchifyError('bad_format', 'format must be svg|html|json|card', 400);
  }
  const format = formatRaw as ExportFormat;
  await readStoredIr(id); // 404 on unknown.
  const file = format === 'svg' ? 'diagram.svg' : format === 'html' ? 'index.html' : format === 'json' ? 'ir.json' : 'share.svg';
  const body = await readFile(join(dirOf(id), file), 'utf-8');
  const contentType = format === 'json' ? 'application/json' : format === 'html' ? 'text/html' : 'image/svg+xml';
  return { filename: `${id}.${format === 'card' ? 'card.svg' : format === 'html' ? 'html' : format}`, contentType, body };
}

/**
 * Compare two diagrams — Before/Delta/After (Docs/31 §2.3).
 * Writes `delta.html` next to the head diagram and returns the diff +
 * the HTML (the pane renders it, no toast-only button).
 */
export async function compareDiagrams(headRaw: unknown, baseRaw: unknown): Promise<{ diff: DiagramDiff; deltaHtml: string }> {
  const headId = assertDiagramId(headRaw);
  const baseId = assertDiagramId(baseRaw);
  const head = await readStoredIr(headId);
  const base = await readStoredIr(baseId);
  const baseNodes = new Map(base.nodes.map((n) => [n.id, n]));
  const headNodes = new Map(head.nodes.map((n) => [n.id, n]));
  const added = [...headNodes.keys()].filter((id) => !baseNodes.has(id));
  const removed = [...baseNodes.keys()].filter((id) => !headNodes.has(id));
  const changed = [...headNodes.keys()].filter((id) => {
    const b = baseNodes.get(id);
    const h = headNodes.get(id);
    return b && h && (b.label !== h.label || (b.kind ?? '') !== (h.kind ?? ''));
  });
  const key = (e: { from: string; to: string; label?: string }) => `${e.from}→${e.to}${e.label ? `#${e.label}` : ''}`;
  const baseEdges = new Set(base.edges.map(key));
  const headEdges = new Set(head.edges.map(key));
  const rerouted = [...headEdges].filter((k) => !baseEdges.has(k)).concat([...baseEdges].filter((k) => !headEdges.has(k)));
  const diff: DiagramDiff = { added, removed, changed, rerouted };
  const deltaHtml = buildDeltaHtml(baseId, base, headId, head, diff);
  await mkdir(dirOf(headId), { recursive: true });
  await writeAtomic(join(dirOf(headId), 'delta.html'), deltaHtml);
  return { diff, deltaHtml };
}

function diffList(title: string, items: string[], color: string): string {
  if (items.length === 0) return `<div><b>${title}</b><br><span style="color:#999">none</span></div>`;
  return `<div><b>${title} (${items.length})</b><br>${items.map((i) => `<code>${esc(i)}</code>`).join(' ')}</div>`;
}

function buildDeltaHtml(
  baseId: string,
  base: ArchifyIR,
  headId: string,
  head: ArchifyIR,
  diff: DiagramDiff,
): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>delta ${esc(baseId)} → ${esc(headId)}</title><style>body{margin:0;font:13px/1.5 Inter,system-ui,sans-serif;background:#FAF9F5;color:#262624}.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:12px;height:100vh;box-sizing:border-box}.col{background:#fff;border:1px solid #E8E4DE;border-radius:10px;padding:10px;overflow:auto}.col.mid{background:#FFFBEB;border-color:#FDE68A}code{background:#F2F0EB;border:1px solid #E8E4DE;border-radius:4px;padding:0 5px;font-size:11px}svg{width:100%;height:auto;border:1px dashed #E8E4DE;border-radius:8px}</style></head><body><div class="grid"><div class="col"><h3>Before — ${esc(baseId)}</h3>${buildSvg(base)}</div><div class="col mid"><h3>Delta</h3>${diffList('added', diff.added, '')}${diffList('removed', diff.removed, '')}${diffList('changed', diff.changed, '')}${diffList('rerouted', diff.rerouted, '')}</div><div class="col"><h3>After — ${esc(headId)}</h3>${buildSvg(head)}</div></div></body></html>`;
}

/** Seed starter content for the `archify guide` flow (Docs/31 §6.4). */
export function guideStarter(topic: string): string {
  const clean = topic.trim().replace(/\s+/g, ' ').slice(0, 200) || 'API request with cache miss';
  return `${clean} -> handler -> cache -> database`;
}
