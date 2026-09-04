import { readdir, readFile, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join, normalize, relative, resolve, sep } from 'node:path';
import { expandHome, writeAtomic } from '../utils/fs.js';

/**
 * File-backed vault — the single DRY implementation behind `GET /api/vault/*`.
 * Root: `~/.lokma/vault/` (folders like `lokma/` filter via `?folder=`).
 * Notes are `*.md` files: the title comes from frontmatter `title:` or the
 * first `# heading` or the file name; `[[wikilink]]` targets become graph
 * edges; frontmatter `provenance:` records which agent ingested the note.
 * Search is ranked substring over path + title + content (an FTS5 index is
 * a follow-up — the pane labels this honestly as search, not FTS5).
 * See Docs/28 §vault and Docs/29 (file vault wins, no Obsidian daemon).
 */

/** Vault root (global, same for CLI + web — one store, like sessions). */
export const VAULT_DIR = '~/.lokma/vault';
/** Max files walked per listing (vaults are hundreds of notes, not millions). */
export const VAULT_MAX_FILES = 5000;
/** Max bytes parsed per note (larger files keep head bytes + truncated flag). */
export const VAULT_READ_CAP = 256 * 1024;
/** Max bytes accepted by `ingestNote()`. */
export const VAULT_WRITE_CAP = 512 * 1024;
/** Graph caps (the pane renders SVG — unbounded graphs would freeze it). */
export const VAULT_GRAPH_MAX_NODES = 80;
export const VAULT_GRAPH_MAX_LINKS = 300;
export const VAULT_SEARCH_MAX_HITS = 50;

/** Typed error — routes map `code`/`status` straight into `{ code, message }`. */
export class VaultError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
    this.status = status;
  }
}

export type VaultNote = {
  /** Vault-relative `/`-separated path, e.g. `lokma/00-KONTEKST.md`. */
  path: string;
  title: string;
  tags: string[];
  /** Resolved outgoing `[[wikilink]]` targets (vault-relative paths). */
  links: string[];
  /** Frontmatter `provenance:` (the ingesting agent id), if any. */
  provenance: string | null;
  size: number;
  mtimeMs: number;
};

export type VaultSearchHit = VaultNote & { score: number; snippet: string };

export type VaultGraphNode = {
  id: string;
  path: string;
  title: string;
  tags: string[];
  /** Degree within the returned graph (drives node size + list badge). */
  links: number;
  /** Frontmatter `provenance:` (the ingesting agent id), if any. */
  provenance: string | null;
};

export type VaultGraphLink = { source: string; target: string };

export type VaultGraph = {
  nodes: VaultGraphNode[];
  links: VaultGraphLink[];
  count: number;
};

export type VaultTreeEntry = {
  name: string;
  /** Vault-relative path (`''` for the root itself is never returned). */
  path: string;
  type: 'dir' | 'note';
  children?: VaultTreeEntry[];
};

export type VaultNoteDetail = VaultNote & { content: string; truncated: boolean };

export type VaultIngestResult = { path: string; bytes: number; created: boolean };

/** Absolute vault root on this machine. */
export function vaultRoot(): string {
  return expandHome(VAULT_DIR);
}

/**
 * Jail a vault-relative path inside the vault root.
 * Throws `bad_path` (empty/null bytes/absolute) or `outside_root` (escape).
 */
export function resolveInVault(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.includes('\0')) {
    throw new VaultError('bad_path', 'path must be a non-empty string', 400);
  }
  const cleaned = raw.trim().replace(/^\/+/, '');
  const root = resolve(vaultRoot());
  const abs = resolve(root, normalize(cleaned));
  const rel = relative(root, abs);
  if (rel === '..' || rel.startsWith(`..${sep}`) || resolve(root, rel) !== abs) {
    throw new VaultError('outside_root', 'path escapes the vault root', 400);
  }
  return abs;
}

/** Vault-relative `/`-separated path for an absolute path under root. */
function toRel(root: string, abs: string): string {
  return relative(root, abs).split(sep).join('/');
}

/** `folder` must be a safe relative prefix (`lokma`, `projeler/x`) — never `..`. */
export function assertFolder(folder: unknown): string {
  if (folder === undefined || folder === null || folder === '') return '';
  if (typeof folder !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(folder.trim())) {
    throw new VaultError('bad_folder', 'folder must look like `lokma` or `projeler/x`', 400);
  }
  if (folder.includes('..')) throw new VaultError('bad_folder', 'folder must not contain `..`', 400);
  return folder.trim().replace(/^\/+|\/+$/g, '');
}

/** Split `---` frontmatter from the body (returns `{ meta, body }`). */
function splitFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const meta: Record<string, string> = {};
  if (!text.startsWith('---')) return { meta, body: text };
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { meta, body: text };
  for (const line of text.slice(3, end).split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key) meta[key] = value;
  }
  return { meta, body: text.slice(end + 4).replace(/^\n/, '') };
}

/** `tags: a, b #c` → `['a', 'b', 'c']` (frontmatter value, comma/space split). */
function parseTags(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,\s]+/)
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean)
    .slice(0, 12);
}

/** `[[target]]`, `[[target|label]]`, `[[target#section]]` → `target` list. */
export function extractWikilinks(text: string): string[] {
  const out: string[] = [];
  const re = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const target = match[1].trim();
    if (target && !out.includes(target)) out.push(target);
  }
  return out.slice(0, 100);
}

/** First `# heading` in the body (the note title when frontmatter has none). */
function firstHeading(body: string): string | null {
  for (const line of body.split('\n', 40)) {
    const heading = line.match(/^#{1,3}\s+(.+)/);
    if (heading) return heading[1].trim().slice(0, 120);
  }
  return null;
}

/** Parse raw markdown into display metadata (links stay unresolved here). */
function parseNote(rel: string, text: string, size: number, mtimeMs: number): VaultNote {
  const { meta, body } = splitFrontmatter(text);
  const base = basename(rel, '.md');
  const tags = parseTags(meta.tags);
  if (tags.length === 0) {
    const parent = dirname(rel);
    tags.push(parent === '.' ? 'vault' : basename(parent));
  }
  const provenance =
    typeof meta.provenance === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(meta.provenance.trim())
      ? meta.provenance.trim()
      : null;
  return {
    path: rel,
    title: meta.title?.slice(0, 120) || firstHeading(body) || base,
    tags,
    links: extractWikilinks(body),
    provenance,
    size,
    mtimeMs,
  };
}

/** Recursively collect `.md` files under `dir` (skips dotfiles, capped). */
async function walkMarkdown(dir: string, root: string, out: string[]): Promise<void> {
  if (out.length >= VAULT_MAX_FILES) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (out.length >= VAULT_MAX_FILES) return;
    if (entry.name.startsWith('.')) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      await walkMarkdown(abs, root, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      out.push(toRel(root, abs));
    }
  }
}

/** Read + parse one note by vault-relative path (resolves links later). */
async function loadNote(root: string, rel: string): Promise<VaultNote | null> {
  const abs = join(root, rel.split('/').join(sep));
  let s;
  try {
    s = await stat(abs);
  } catch {
    return null;
  }
  if (!s.isFile() || s.size > 8 * 1024 * 1024) return null;
  const raw = await readFile(abs, 'utf-8').catch(() => null);
  if (raw === null || raw.includes('\0')) return null;
  const head = raw.length > VAULT_READ_CAP ? raw.slice(0, VAULT_READ_CAP) : raw;
  return parseNote(rel, head, s.size, s.mtimeMs);
}

/** All parsed notes under `folder` (empty folder = whole vault), sorted by path. */
export async function listNotes(folder = ''): Promise<VaultNote[]> {
  const prefix = assertFolder(folder);
  const root = vaultRoot();
  const rels: string[] = [];
  await walkMarkdown(prefix ? join(root, prefix.split('/').join(sep)) : root, root, rels);
  const notes: VaultNote[] = [];
  for (const rel of rels) {
    const note = await loadNote(root, rel);
    if (note) notes.push(note);
  }
  notes.sort((a, b) => a.path.localeCompare(b.path));
  return notes;
}

/** Resolve raw `[[wikilink]]` targets to vault-relative note paths. */
function resolveLinks(notes: VaultNote[]): Map<string, string[]> {
  const byPath = new Map<string, VaultNote>();
  for (const note of notes) byPath.set(note.path.toLowerCase(), note);
  const basenames = new Map<string, VaultNote[]>();
  for (const note of notes) {
    const base = basename(note.path, '.md').toLowerCase();
    const list = basenames.get(base) ?? [];
    list.push(note);
    basenames.set(base, list);
  }
  // Titles (`# Pane System` heading) resolve too — users link the title
  // they see, not the file stem. Exact title match, shortest path wins.
  const byTitle = new Map<string, VaultNote[]>();
  for (const note of notes) {
    const key = note.title.toLowerCase();
    const list = byTitle.get(key) ?? [];
    list.push(note);
    byTitle.set(key, list);
  }
  const resolved = new Map<string, string[]>();
  for (const note of notes) {
    const targets: string[] = [];
    for (const raw of note.links) {
      const target = raw.toLowerCase();
      const direct =
        byPath.get(target) ??
        byPath.get(`${target}.md`) ??
        basenames.get(target)?.sort((a, b) => a.path.localeCompare(b.path))[0] ??
        byTitle.get(target)?.sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path))[0] ??
        null;
      // Suffix match (`Pane System` → `lokma/24-pane.md` only when the
      // basename contains it — deterministic, shortest path wins).
      let fallback: VaultNote | null = null;
      if (!direct) {
        const candidates = notes.filter((n) => basename(n.path, '.md').toLowerCase().includes(target));
        candidates.sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path));
        fallback = candidates[0] ?? null;
      }
      const hit = direct ?? fallback;
      if (hit && hit.path !== note.path && !targets.includes(hit.path)) targets.push(hit.path);
    }
    resolved.set(note.path, targets);
  }
  return resolved;
}

/**
 * Ranked substring search over path + title + content.
 * Title hits outrank path hits outrank body hits; empty query returns
 * every note (path order) so the pane doubles as a folder browser.
 */
export async function searchNotes(query: unknown, folder = ''): Promise<VaultSearchHit[]> {
  const q = typeof query === 'string' ? query.trim().toLowerCase() : '';
  if (query !== undefined && query !== null && query !== '' && typeof query !== 'string') {
    throw new VaultError('bad_query', 'q must be a string', 400);
  }
  const notes = await listNotes(folder);
  if (!q) {
    return notes.slice(0, VAULT_SEARCH_MAX_HITS).map((note) => ({ ...note, score: 0, snippet: '' }));
  }
  const root = vaultRoot();
  const hits: VaultSearchHit[] = [];
  for (const note of notes) {
    const titleAt = note.title.toLowerCase().indexOf(q);
    const pathAt = note.path.toLowerCase().indexOf(q);
    let score = -1;
    if (titleAt !== -1) score = 100 - Math.min(titleAt, 90);
    else if (pathAt !== -1) score = 50 - Math.min(pathAt / 10, 40);
    else {
      const abs = join(root, note.path.split('/').join(sep));
      const text = await readFile(abs, 'utf-8').catch(() => '');
      const bodyAt = text.toLowerCase().indexOf(q);
      if (bodyAt === -1) continue;
      score = 10 - Math.min(bodyAt / 1000, 9);
      const line = text.split('\n').find((l) => l.toLowerCase().includes(q)) ?? '';
      hits.push({ ...note, score, snippet: line.trim().slice(0, 160) });
      continue;
    }
    hits.push({ ...note, score, snippet: '' });
  }
  hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return hits.slice(0, VAULT_SEARCH_MAX_HITS);
}

/**
 * Build the pane graph: seed notes (top search hits, or everything when
 * there is no query) plus BFS over resolved wikilinks to `depth`.
 * Concept parity: the default view caps like the mock did
 * (`10 + depth * 5` seed budget) so the SVG stays readable.
 */
export async function buildGraph(opts: { folder?: unknown; depth?: unknown; q?: unknown }): Promise<VaultGraph> {
  const folder = assertFolder(opts.folder ?? '');
  const depth = opts.depth === undefined || opts.depth === '' ? 2 : Number(opts.depth);
  if (!Number.isInteger(depth) || depth < 1 || depth > 3) {
    throw new VaultError('bad_depth', 'depth must be 1, 2 or 3', 400);
  }
  const q = opts.q === undefined || opts.q === null ? '' : opts.q;
  if (typeof q !== 'string') throw new VaultError('bad_query', 'q must be a string', 400);
  const notes = await listNotes(folder);
  const byPath = new Map(notes.map((n) => [n.path, n]));
  const resolved = resolveLinks(notes);

  const seedBudget = 10 + depth * 5;
  let seeds: VaultNote[];
  if (q.trim()) {
    const ranked = await searchNotes(q, folder);
    seeds = ranked.slice(0, seedBudget);
  } else {
    seeds = notes.slice(0, seedBudget);
  }

  const visited = new Set<string>();
  const queue: Array<{ path: string; level: number }> = seeds.map((s) => ({ path: s.path, level: 0 }));
  for (const seed of seeds) visited.add(seed.path);
  // Undirected adjacency (a link either way connects two notes).
  const adjacent = new Map<string, Set<string>>();
  const link = (a: string, b: string): void => {
    if (!adjacent.has(a)) adjacent.set(a, new Set());
    if (!adjacent.has(b)) adjacent.set(b, new Set());
    adjacent.get(a)!.add(b);
    adjacent.get(b)!.add(a);
  };
  for (const [from, targets] of resolved) for (const to of targets) link(from, to);
  while (queue.length > 0 && visited.size < VAULT_GRAPH_MAX_NODES) {
    const current = queue.shift()!;
    if (current.level >= depth) continue;
    const neighbours = [...(adjacent.get(current.path) ?? [])].sort();
    for (const next of neighbours) {
      if (visited.has(next) || !byPath.has(next)) continue;
      visited.add(next);
      queue.push({ path: next, level: current.level + 1 });
      if (visited.size >= VAULT_GRAPH_MAX_NODES) break;
    }
  }

  const degree = new Map<string, number>();
  const links: VaultGraphLink[] = [];
  const seenPairs = new Set<string>();
  for (const [from, targets] of resolved) {
    if (!visited.has(from)) continue;
    for (const to of targets) {
      if (!visited.has(to)) continue;
      const pair = [from, to].sort().join('\n');
      if (seenPairs.has(pair)) continue;
      seenPairs.add(pair);
      if (links.length >= VAULT_GRAPH_MAX_LINKS) break;
      links.push({ source: from, target: to });
      degree.set(from, (degree.get(from) ?? 0) + 1);
      degree.set(to, (degree.get(to) ?? 0) + 1);
    }
    if (links.length >= VAULT_GRAPH_MAX_LINKS) break;
  }
  const nodes: VaultGraphNode[] = [...visited]
    .sort()
    .map((path) => {
      const note = byPath.get(path)!;
      return { id: path, path, title: note.title, tags: note.tags, links: degree.get(path) ?? 0, provenance: note.provenance };
    });
  return { nodes, links, count: nodes.length };
}

/** Nested dir tree for the `tree` endpoint (dirs + notes, path-sorted). */
export async function readTree(folder = ''): Promise<VaultTreeEntry[]> {
  const notes = await listNotes(folder);
  const root: VaultTreeEntry[] = [];
  const dirs = new Map<string, VaultTreeEntry>();
  const dirFor = (rel: string): VaultTreeEntry[] => {
    if (!rel) return root;
    const hit = dirs.get(rel);
    if (hit) return hit.children!;
    const parent = dirname(rel) === '.' ? '' : dirname(rel);
    const siblings = dirFor(parent);
    const entry: VaultTreeEntry = { name: basename(rel), path: rel, type: 'dir', children: [] };
    siblings.push(entry);
    siblings.sort((a, b) => a.name.localeCompare(b.name));
    dirs.set(rel, entry);
    return entry.children!;
  };
  for (const note of notes) {
    const parent = dirname(note.path) === '.' ? '' : dirname(note.path);
    dirFor(parent).push({ name: basename(note.path), path: note.path, type: 'note' });
  }
  const sortDeep = (entries: VaultTreeEntry[]): void => {
    entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
    for (const entry of entries) if (entry.children) sortDeep(entry.children);
  };
  sortDeep(root);
  return root;
}

/** Full note read for the `note` endpoint (wikilink click → pane). */
export async function readNote(path: unknown): Promise<VaultNoteDetail> {
  if (typeof path !== 'string' || !path.trim()) {
    throw new VaultError('bad_path', 'note needs ?path=<vault note>', 400);
  }
  if (!path.trim().toLowerCase().endsWith('.md')) {
    throw new VaultError('not_a_note', 'only .md notes can be opened', 400);
  }
  const abs = resolveInVault(path);
  const root = resolve(vaultRoot());
  const rel = toRel(root, abs);
  let s;
  try {
    s = await stat(abs);
  } catch {
    throw new VaultError('note_not_found', `no note at ${rel}`, 404);
  }
  if (!s.isFile()) throw new VaultError('note_not_found', `no note at ${rel}`, 404);
  if (s.size > 8 * 1024 * 1024) throw new VaultError('too_large', 'note is larger than 8MB', 413);
  const raw = await readFile(abs, 'utf-8').catch(() => null);
  if (raw === null) throw new VaultError('note_not_found', `no note at ${rel}`, 404);
  if (raw.includes('\0')) throw new VaultError('binary_file', 'not a text note', 400);
  const truncated = raw.length > VAULT_READ_CAP;
  const note = parseNote(rel, truncated ? raw.slice(0, VAULT_READ_CAP) : raw, s.size, s.mtimeMs);
  // Resolve wikilinks against the whole vault so the pane can open them.
  const all = await listNotes('').catch(() => null);
  if (all) {
    const pool = all.some((n) => n.path === rel) ? all : [...all, note];
    note.links = resolveLinks(pool).get(rel) ?? note.links;
  }
  return { ...note, content: truncated ? raw.slice(0, VAULT_READ_CAP) : raw, truncated };
}

/**
 * Ingest a note (`POST /api/vault/ingest`, `provenance:` = the agent id).
 * Merges `provenance:` into existing frontmatter instead of duplicating it;
 * refuses empty content and non-`.md` paths.
 */
export async function ingestNote(
  path: unknown,
  content: unknown,
  provenance: unknown,
): Promise<VaultIngestResult> {
  if (typeof path !== 'string' || !path.trim()) {
    throw new VaultError('bad_path', 'ingest needs { path, content }', 400);
  }
  if (!path.trim().toLowerCase().endsWith('.md')) {
    throw new VaultError('not_a_note', 'only .md notes can be ingested', 400);
  }
  if (typeof content !== 'string' || !content.trim()) {
    throw new VaultError('empty_content', 'content must be a non-empty string', 400);
  }
  if (Buffer.byteLength(content, 'utf-8') > VAULT_WRITE_CAP) {
    throw new VaultError('too_large', 'content is larger than 512KB', 413);
  }
  let agent: string | null = null;
  if (provenance !== undefined && provenance !== null && provenance !== '') {
    if (typeof provenance !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(provenance.trim())) {
      throw new VaultError('bad_provenance', 'provenance must be an agent id (letters, digits, _-)', 400);
    }
    agent = provenance.trim();
  }
  const abs = resolveInVault(path);
  const root = resolve(vaultRoot());
  const rel = toRel(root, abs);
  const existed = await stat(abs)
    .then((s) => s.isFile())
    .catch(() => false);
  let body = content;
  if (agent) {
    const { meta, body: rawBody } = splitFrontmatter(content);
    const lines = [`---`, `provenance: ${agent}`];
    for (const [key, value] of Object.entries(meta)) {
      if (key === 'provenance') continue;
      lines.push(`${key}: ${value}`);
    }
    lines.push(`---`);
    body = `${lines.join('\n')}\n${rawBody.replace(/^\n/, '')}`;
  }
  await writeAtomic(abs, body);
  return { path: rel, bytes: Buffer.byteLength(body, 'utf-8'), created: !existed };
}

/**
 * Delete a note (`DELETE /api/vault/note?path=` — the undo for ingest).
 * Unknown notes 404 via `stat` before anything is touched; non-`.md`
 * paths 400 (same rules as reads so delete can never remove a non-note);
 * `resolveInVault` jails the target so `rm` can never escape the vault.
 */
export async function deleteNote(pathRaw: unknown): Promise<{ path: string }> {
  if (typeof pathRaw !== 'string' || !pathRaw.trim()) {
    throw new VaultError('bad_path', 'delete needs ?path=<vault note>', 400);
  }
  if (!pathRaw.trim().toLowerCase().endsWith('.md')) {
    throw new VaultError('not_a_note', 'only .md notes can be deleted', 400);
  }
  const abs = resolveInVault(pathRaw);
  const root = resolve(vaultRoot());
  const rel = toRel(root, abs);
  let s;
  try {
    s = await stat(abs);
  } catch {
    throw new VaultError('note_not_found', `no note at ${rel}`, 404);
  }
  if (!s.isFile()) throw new VaultError('note_not_found', `no note at ${rel}`, 404);
  await unlink(abs);
  return { path: rel };
}
