/**
 * Pure VaultPane helpers — no DOM, no fetch
 * (probe: `bun src/components/vault/vault.test.ts`).
 * The pane shows the LIVE file vault (`~/.lokma/vault/`, same store the
 * CLI reads) over `GET /api/vault/graph|tree` + `GET /api/vault/note` +
 * `POST /api/vault/ingest`. Search ranks through SQLite FTS5
 * (`GET /api/vault/search`); the 2D view is a deterministic SVG circle
 * layout and the 3D view a dependency-free canvas star-map (Fibonacci
 * sphere + perspective camera — no force-graph dep), both over the same
 * live graph payload.
 * Node normalization, SVG layout and `[[wikilink]]` splitting live here
 * so the pane itself stays a thin view over `api.*` calls.
 */

/** One graph node as the server returns it (`GET /api/vault/graph`). */
export type VaultNode = {
  id: string;
  path: string;
  title: string;
  tags: string[];
  /** Degree within the returned graph (drives node size + list badge). */
  links: number;
  /** Frontmatter `provenance:` (the ingesting agent id), if any. */
  provenance?: string | null;
};

/** One undirected graph edge as the server returns it. */
export type VaultLink = { source: string; target: string };

/** A note row plus its search snippet (list view). */
export type VaultHit = VaultNode & { score?: number; snippet?: string };

/** Full note as `GET /api/vault/note` returns it. */
export type VaultNoteDetail = VaultNode & {
  content: string;
  truncated: boolean;
  provenance: string | null;
  size: number;
  mtimeMs: number;
};

/** Graph node with deterministic SVG coordinates attached. */
export type PlacedNode = VaultNode & { x: number; y: number; r: number };

/** Coerce an unknown graph node into a displayable row (null = skip). */
export function normalizeNode(raw: unknown): VaultNode | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const path = typeof row.path === 'string' ? row.path : typeof row.id === 'string' ? row.id : null;
  if (!path) return null;
  const title =
    typeof row.title === 'string' && row.title.trim()
      ? row.title
      : path.split('/').pop() ?? path;
  return {
    id: typeof row.id === 'string' ? row.id : path,
    path,
    title,
    tags: Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === 'string') : [],
    links: typeof row.links === 'number' && Number.isFinite(row.links) ? row.links : 0,
    provenance: typeof row.provenance === 'string' ? row.provenance : null,
  };
}

/** Normalize a whole graph payload (nulls dropped, path order kept). */
export function normalizeNodes(raw: unknown): VaultNode[] {
  if (!Array.isArray(raw)) return [];
  const out: VaultNode[] = [];
  for (const entry of raw) {
    const node = normalizeNode(entry);
    if (node) out.push(node);
  }
  return out;
}

/** Node radius from graph degree (4px base, +1 per link, capped at 12). */
export function nodeRadius(degree: number): number {
  return 4 + Math.min(Math.max(degree, 0), 8);
}

/**
 * Deterministic circle layout for the 2D SVG (same input → same pixels,
 * no force library needed for vault-sized graphs).
 * `width`/`height` are the viewBox dimensions (concept uses 300×200).
 */
export function layoutGraph(nodes: VaultNode[], width = 300, height = 200): PlacedNode[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) {
    const only = nodes[0];
    return [{ ...only, x: width / 2, y: height / 2, r: nodeRadius(only.links) + 2 }];
  }
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 24;
  return nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    return {
      ...node,
      x: Math.round((cx + radius * Math.cos(angle)) * 10) / 10,
      y: Math.round((cy + radius * Math.sin(angle)) * 10) / 10,
      r: nodeRadius(node.links),
    };
  });
}

/** Palette index from a path (stable color per note, no random). */
export function paletteIndex(path: string, size: number): number {
  let hash = 0;
  for (let i = 0; i < path.length; i += 1) hash = (hash * 31 + path.charCodeAt(i)) >>> 0;
  return size === 0 ? 0 : hash % size;
}

/** Node fill colors (terracotta first, then muted categoricals). */
export const NODE_PALETTE = ['#C96442', '#262624', '#6C5CE7', '#0EA5E9', '#10B981', '#F59E0B'] as const;

/** One rendered chunk of note body: plain text or a clickable wikilink. */
export type BodyChunk = { kind: 'text'; text: string } | { kind: 'link'; target: string; label: string };

/**
 * Split note body on `[[target]]`, `[[target|label]]`, `[[target#section]]`.
 * The pane renders `link` chunks as buttons that open the target note.
 */
export function splitWikilinks(body: string): BodyChunk[] {
  const chunks: BodyChunk[] = [];
  const re = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    if (match.index > last) chunks.push({ kind: 'text', text: body.slice(last, match.index) });
    const target = match[1].trim();
    const label = (match[2] ?? '').trim() || target;
    if (target) chunks.push({ kind: 'link', target, label });
    else chunks.push({ kind: 'text', text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < body.length) chunks.push({ kind: 'text', text: body.slice(last) });
  if (chunks.length === 0) chunks.push({ kind: 'text', text: body });
  return chunks;
}

/**
 * Resolve a clicked `[[target]]` to a vault-relative note path using the
 * loaded graph nodes (exact path → `target.md` → basename → null).
 * Null means "no local guess" — the pane toasts instead of 404-fishing.
 */
export function resolveWikilinkClick(target: string, nodes: VaultNode[]): string | null {
  const needle = target.trim().toLowerCase();
  if (!needle) return null;
  const byPath = nodes.find((n) => n.path.toLowerCase() === needle);
  if (byPath) return byPath.path;
  const withExt = nodes.find((n) => n.path.toLowerCase() === `${needle}.md`);
  if (withExt) return withExt.path;
  const base = nodes
    .filter((n) => n.path.split('/').pop()?.toLowerCase().replace(/\.md$/, '') === needle)
    .sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path))[0];
  if (base) return base.path;
  const partial = nodes
    .filter((n) =>
      (n.path.split('/').pop() ?? '').toLowerCase().replace(/\.md$/, '').includes(needle),
    )
    .sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path))[0];
  return partial ? partial.path : null;
}

/** Depth slider bounds (mirrors the server `depth must be 1, 2 or 3`). */
export const VAULT_MIN_DEPTH = 1;
export const VAULT_MAX_DEPTH = 3;

/** Clamp raw slider input into the server-accepted depth range. */
export function clampDepth(raw: number): number {
  if (!Number.isFinite(raw)) return 2;
  return Math.min(VAULT_MAX_DEPTH, Math.max(VAULT_MIN_DEPTH, Math.round(raw)));
}

/** A 3D unit used by the dependency-free star-map projection. */
export type Vec3 = { x: number; y: number; z: number };

/** Graph node with a deterministic 3D home position (unit sphere scaled). */
export type PlacedNode3D = VaultNode & Vec3;

/** Yaw/pitch camera rotation in radians (drag-driven, auto-rotate bumps yaw). */
export type GraphRotation = { yaw: number; pitch: number };

/** A 3D node projected onto the 2D canvas (screen px + depth shade 0..1). */
export type ProjectedNode3D = PlacedNode3D & {
  sx: number;
  sy: number;
  /** Perspective scale factor (near nodes render larger). */
  scale: number;
  /** 0 = far side, 1 = near side (drives alpha + draw order). */
  depth: number;
};

/** Radius of the 3D home sphere (world units — the canvas fits it). */
export const GRAPH_3D_RADIUS = 100;

/**
 * Deterministic Fibonacci-sphere layout for the 3D star-map (same input →
 * same positions, no force library). Single node sits at the origin; pairs
 * oppose each other; larger graphs spread evenly over the sphere.
 */
export function layoutGraph3D(nodes: VaultNode[], radius = GRAPH_3D_RADIUS): PlacedNode3D[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) return [{ ...nodes[0], x: 0, y: 0, z: 0 }];
  const golden = Math.PI * (3 - Math.sqrt(5));
  return nodes.map((node, i) => {
    const t = (i + 0.5) / nodes.length;
    const y = (1 - 2 * t) * radius;
    const band = Math.sqrt(Math.max(0, radius * radius - y * y));
    const theta = golden * i;
    return {
      ...node,
      x: Math.round(band * Math.cos(theta) * 10) / 10,
      y: Math.round(y * 10) / 10,
      z: Math.round(band * Math.sin(theta) * 10) / 10,
    };
  });
}

/**
 * Rotate one world point by yaw (around Y) then pitch (around X).
 * Pure so the canvas renderer and the probe share the exact math.
 */
export function rotatePoint(point: Vec3, rot: GraphRotation): Vec3 {
  const cosY = Math.cos(rot.yaw);
  const sinY = Math.sin(rot.yaw);
  const yawed = { x: point.x * cosY + point.z * sinY, y: point.y, z: -point.x * sinY + point.z * cosY };
  const cosP = Math.cos(rot.pitch);
  const sinP = Math.sin(rot.pitch);
  return { x: yawed.x, y: yawed.y * cosP - yawed.z * sinP, z: yawed.y * sinP + yawed.z * cosP };
}

/**
 * Project placed 3D nodes onto a `width`×`height` canvas with a simple
 * perspective camera (`distance` = camera range in world units, larger =
 * flatter). Returns screen coords plus depth for shading/draw order.
 */
export function projectGraph3D(
  placed: PlacedNode3D[],
  rot: GraphRotation,
  width: number,
  height: number,
  distance = 340,
): ProjectedNode3D[] {
  const safeDistance = Number.isFinite(distance) && distance > GRAPH_3D_RADIUS + 1 ? distance : 340;
  const minSide = Math.max(1, Math.min(width, height));
  const fit = minSide / 2 / ((GRAPH_3D_RADIUS / safeDistance + 1) * GRAPH_3D_RADIUS);
  return placed.map((node) => {
    const spun = rotatePoint(node, rot);
    const scale = safeDistance / (safeDistance - spun.z);
    return {
      ...node,
      sx: width / 2 + spun.x * scale * fit * (safeDistance / (safeDistance + GRAPH_3D_RADIUS)),
      sy: height / 2 + spun.y * scale * fit * (safeDistance / (safeDistance + GRAPH_3D_RADIUS)),
      scale,
      depth: (spun.z + GRAPH_3D_RADIUS) / (2 * GRAPH_3D_RADIUS),
    };
  });
}

/** Clamp pitch so the star-map never flips upside down. */
export function clampPitch(pitch: number): number {
  if (!Number.isFinite(pitch)) return 0;
  return Math.min(1.4, Math.max(-1.4, pitch));
}

/**
 * Hit-test a canvas click against projected nodes (nearest within its
 * drawn radius + 4px grace). Returns the node path or null.
 */
export function hitTestProjected(
  projected: Array<Pick<ProjectedNode3D, 'path' | 'sx' | 'sy'> & { r?: number }>,
  px: number,
  py: number,
): string | null {
  let best: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const node of projected) {
    const grace = (typeof node.r === 'number' ? node.r : 5) + 4;
    const dist = Math.hypot(node.sx - px, node.sy - py);
    if (dist <= grace && dist < bestDist) {
      bestDist = dist;
      best = node.path;
    }
  }
  return best;
}

/** Ingest form values (path + optional provenance + markdown body). */
export type IngestForm = { path: string; provenance: string; content: string };

/** Empty ingest form (path prefilled with the `.md` suffix hint). */
export function emptyIngestForm(): IngestForm {
  return { path: '', provenance: '', content: '' };
}

/**
 * Validate the ingest form against the server rules (400 `not_a_note` /
 * `empty_content` / `bad_provenance`). Returns the first problem or null.
 */
export function validateIngestForm(form: IngestForm): string | null {
  if (!form.path.trim()) return 'Give the note a path ending in .md';
  if (!form.path.trim().toLowerCase().endsWith('.md')) return 'Only .md notes can be ingested';
  if (!form.content.trim()) return 'Content must not be empty';
  const agent = form.provenance.trim();
  if (agent && !/^[A-Za-z0-9_-]{1,64}$/.test(agent)) {
    return 'Provenance must be an agent id (letters, digits, _-)';
  }
  return null;
}
