import * as React from 'react';
import { FilePlus2, Folder, GitBranch, Link2, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatSize } from '@/components/files';
import { VaultGraph3D } from './vault-graph-3d';
import {
  clampDepth,
  emptyIngestForm,
  layoutGraph,
  NODE_PALETTE,
  normalizeNodes,
  paletteIndex,
  resolveWikilinkClick,
  splitWikilinks,
  validateIngestForm,
  VAULT_MAX_DEPTH,
  VAULT_MIN_DEPTH,
  type IngestForm,
  type VaultLink,
  type VaultNode,
  type VaultNoteDetail,
} from './vault';

/**
 * VaultPane — live file vault over the real `~/.lokma/vault/` store (W4-15).
 * Concept layout 1:1 (header + search/depth row + note list + SVG graph),
 * but every pixel is live: the list and graph come from
 * `GET /api/vault/graph?folder=&depth=&q=`, row click reads the full note
 * via `GET /api/vault/note?path=`, `[[wikilink]]` clicks resolve against
 * the loaded graph and open the target note, and the New-note form writes
 * through `POST /api/vault/ingest` (with `provenance:` = ingesting agent).
 * The open note reader carries a two-click Delete (the undo for ingest —
 * `DELETE /api/vault/note?path=`), which closes the reader and reloads
 * the graph on success.
 * NOT ported: the concept's hardcoded NOTES/EDGES rows and the mock
 * barnesHut constants strip (ours is a deterministic circle layout in 2D
 * and a Fibonacci-sphere canvas star-map in 3D — the footer says so), plus
 * the toast-only Full button. Search is SQLite FTS5 (weighted BM25 over
 * path + title + tags + body) — graph seeds and typeaheads rank through
 * it; the footer says so.
 */

const inputClass =
  'h-7 rounded-md border border-line bg-white px-2 text-xs focus:outline-none focus:border-terracotta/30 dark:bg-[#1E1E21]';

function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('lokma-toast', { detail: message }));
}

function NoteReader({
  note,
  nodes,
  onOpenPath,
  onClose,
  onDelete,
  deleteArmed,
  deleting,
}: {
  note: VaultNoteDetail;
  nodes: VaultNode[];
  onOpenPath: (path: string) => void;
  onClose: () => void;
  onDelete: () => void;
  deleteArmed: boolean;
  deleting: boolean;
}) {
  return (
    <div className="border-t border-line/50 bg-white/80 dark:bg-[#1E1E21]/80 flex flex-col min-h-0 max-h-[46%]">
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-line/50 text-[11px] shrink-0">
        <GitBranch className="w-3 h-3 text-zinc-400" />
        <span className="font-medium truncate">{note.title}</span>
        <span className="text-zinc-400 truncate hidden sm:inline">{note.path}</span>
        {note.provenance ? (
          <span
            title="ingesting agent"
            className="ml-1 px-1.5 py-0 rounded-full bg-[#6C5CE7]/10 border border-[#6C5CE7]/30 text-[#6C5CE7] text-[10px] shrink-0"
          >
            {note.provenance}
          </span>
        ) : null}
        <span className="ml-auto text-zinc-400 shrink-0">{formatSize(note.size)}</span>
        <Button
          variant={deleteArmed ? 'destructive' : 'ghost'}
          size="sm"
          className="h-5 w-5 p-0"
          onClick={onDelete}
          disabled={deleting}
          aria-label={deleteArmed ? 'Confirm note delete' : 'Delete note'}
          title={deleteArmed ? 'Click again to confirm delete' : 'Delete this note'}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={onClose} aria-label="Close note">
          <X className="w-3 h-3" />
        </Button>
      </div>
      <div className="overflow-auto p-2 text-xs leading-relaxed whitespace-pre-wrap min-h-0">
        {splitWikilinks(note.content).map((chunk, i) =>
          chunk.kind === 'text' ? (
            <span key={i}>{chunk.text}</span>
          ) : (
            <button
              key={i}
              className="text-terracotta hover:underline font-medium"
              onClick={() => {
                const hit = resolveWikilinkClick(chunk.target, nodes);
                if (hit) onOpenPath(hit);
                else toast(`No vault note matches [[${chunk.target}]]`);
              }}
            >
              {chunk.label}
            </button>
          ),
        )}
        {note.truncated ? (
          <div className="mt-1 text-[11px] text-zinc-400">(truncated at 256KB — full note lives on disk)</div>
        ) : null}
      </div>
    </div>
  );
}

export function VaultPane() {
  const [q, setQ] = React.useState('');
  const [folder, setFolder] = React.useState('');
  const [depth, setDepth] = React.useState(2);
  const [mode, setMode] = React.useState<'2d' | '3d'>('2d');
  const [nodes, setNodes] = React.useState<VaultNode[]>([]);
  const [links, setLinks] = React.useState<VaultLink[]>([]);
  const [count, setCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<VaultNoteDetail | null>(null);
  const [noteLoading, setNoteLoading] = React.useState(false);
  const [ingestOpen, setIngestOpen] = React.useState(false);
  const [form, setForm] = React.useState<IngestForm>(emptyIngestForm);
  const [ingestError, setIngestError] = React.useState<string | null>(null);
  const [ingesting, setIngesting] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const reloadRef = React.useRef(0);

  const loadGraph = React.useCallback(async (query: string, dir: string, d: number) => {
    const run = (reloadRef.current += 1);
    setLoading(true);
    try {
      const res = await api.getVaultGraph(query || undefined, {
        folder: dir.trim() || undefined,
        depth: d,
      });
      if (reloadRef.current !== run) return;
      setNodes(normalizeNodes(res.nodes));
      setLinks(Array.isArray(res.links) ? (res.links as VaultLink[]) : []);
      setCount(typeof res.count === 'number' ? res.count : 0);
      setError(null);
    } catch (e) {
      if (reloadRef.current !== run) return;
      setNodes([]);
      setLinks([]);
      setError(e instanceof Error ? e.message : 'vault graph failed');
    } finally {
      if (reloadRef.current === run) setLoading(false);
    }
  }, []);

  // Debounced live search (same 250ms rhythm as the global SearchModal).
  React.useEffect(() => {
    const timer = setTimeout(() => void loadGraph(q, folder, depth), 250);
    return () => clearTimeout(timer);
  }, [q, folder, depth, loadGraph]);

  const openNote = React.useCallback(
    async (path: string) => {
      setSelected(path);
      setConfirmDelete(null);
      setNoteLoading(true);
      try {
        const res = await api.getVaultNote(path);
        setNote({
          id: path,
          path: res.path ?? path,
          title: res.title ?? path.split('/').pop() ?? path,
          tags: Array.isArray(res.tags) ? res.tags : [],
          links: typeof res.links === 'number' ? res.links : Array.isArray(res.links) ? res.links.length : 0,
          content: typeof res.content === 'string' ? res.content : '',
          truncated: res.truncated === true,
          provenance: typeof res.provenance === 'string' ? res.provenance : null,
          size: typeof res.size === 'number' ? res.size : 0,
          mtimeMs: typeof res.mtimeMs === 'number' ? res.mtimeMs : 0,
        });
      } catch (e) {
        setNote(null);
        toast(e instanceof Error ? e.message : 'note read failed');
      } finally {
        setNoteLoading(false);
      }
    },
    [],
  );

  async function ingest(): Promise<void> {
    const problem = validateIngestForm(form);
    if (problem) {
      setIngestError(problem);
      return;
    }
    setIngesting(true);
    setIngestError(null);
    try {
      const res = await api.ingestVaultNote({
        path: form.path.trim(),
        content: form.content,
        ...(form.provenance.trim() ? { provenance: form.provenance.trim() } : {}),
      });
      setForm(emptyIngestForm());
      setIngestOpen(false);
      toast(res.created ? `Ingested ${res.path}` : `Updated ${res.path}`);
      await loadGraph(q, folder, depth);
      await openNote(res.path);
    } catch (e) {
      setIngestError(e instanceof Error ? e.message : 'ingest failed');
    } finally {
      setIngesting(false);
    }
  }

  const runDelete = React.useCallback(async () => {
    if (!note || deleting) return;
    if (confirmDelete !== note.path) {
      setConfirmDelete(note.path);
      return;
    }
    setConfirmDelete(null);
    setDeleting(true);
    try {
      await api.deleteVaultNote(note.path);
      toast(`Deleted ${note.path}`);
      setNote(null);
      setSelected(null);
      await loadGraph(q, folder, depth);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setDeleting(false);
    }
  }, [note, deleting, confirmDelete, loadGraph, q, folder, depth]);

  const placed = React.useMemo(() => layoutGraph(nodes), [nodes]);
  const edgeSet = React.useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    return links.filter((l) => ids.has(l.source) && ids.has(l.target));
  }, [nodes, links]);
  const byId = React.useMemo(() => new Map(placed.map((n) => [n.id, n])), [placed]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0 overflow-x-auto">
        <Folder className="w-3 h-3 text-amber-600" />
        <span className="text-xs font-semibold">Vault</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden sm:inline">
          file vault · {count} notes{folder.trim() ? ` · folder=${folder.trim()}` : ''}
        </span>
        <span className="ml-auto flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-2 text-[11px]"
            onClick={() => {
              setIngestOpen((v) => !v);
              setIngestError(null);
            }}
            aria-label="New vault note"
          >
            <FilePlus2 className="w-3 h-3" /> New
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={() => void loadGraph(q, folder, depth)}
            aria-label="Refresh vault graph"
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button
            variant={mode === '2d' ? 'default' : 'ghost'}
            size="sm"
            className="h-5 px-2 text-[11px]"
            onClick={() => setMode('2d')}
          >
            2D
          </Button>
          <Button
            variant={mode === '3d' ? 'default' : 'ghost'}
            size="sm"
            className="h-5 px-2 text-[11px]"
            onClick={() => setMode('3d')}
          >
            3D
          </Button>
        </span>
      </div>

      <div className="p-2 border-b border-line/50 flex gap-1 items-center flex-wrap">
        <div className="relative flex-1 min-w-[140px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
          <label htmlFor="vault-search" className="sr-only">
            Search vault notes
          </label>
          <input
            id="vault-search"
            placeholder="Vault ara — title, path, body…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full h-7 pl-7 pr-2 rounded-md bg-white dark:bg-[#1E1E21] border border-line text-xs focus:outline-none focus:border-terracotta/30"
          />
        </div>
        <label htmlFor="vault-folder" className="sr-only">
          Vault folder filter
        </label>
        <input
          id="vault-folder"
          placeholder="folder (blank = all)"
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          className={`${inputClass} w-28`}
        />
        <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-zinc-500">
          <label htmlFor="vault-depth">depth</label>
          <input
            id="vault-depth"
            type="range"
            min={VAULT_MIN_DEPTH}
            max={VAULT_MAX_DEPTH}
            value={depth}
            onChange={(e) => setDepth(clampDepth(parseInt(e.target.value, 10)))}
            className="w-16 accent-[#C96442]"
          />
          {depth}
        </span>
      </div>

      {ingestOpen ? (
        <div className="p-2 border-b border-line/50 space-y-1.5 bg-[#FAF9F5] dark:bg-[#0F0F11]">
          <div className="flex gap-1.5">
            <div className="flex-1">
              <label htmlFor="vault-ingest-path" className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                Note path (.md)
              </label>
              <input
                id="vault-ingest-path"
                placeholder="lokma/my-note.md"
                value={form.path}
                onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))}
                className={inputClass}
              />
            </div>
            <div className="w-32">
              <label htmlFor="vault-ingest-prov" className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                Provenance (agent)
              </label>
              <input
                id="vault-ingest-prov"
                placeholder="builder-1 (optional)"
                value={form.provenance}
                onChange={(e) => setForm((f) => ({ ...f, provenance: e.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor="vault-ingest-body" className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
              Markdown body
            </label>
            <textarea
              id="vault-ingest-body"
              placeholder="# Title&#10;&#10;Body with [[wikilinks]]…"
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              rows={3}
              className={`${inputClass} h-auto min-h-[64px] py-1.5 font-mono`}
            />
          </div>
          {ingestError ? <div className="text-[11px] text-red-600">{ingestError}</div> : null}
          <div className="flex gap-1">
            <Button size="sm" className="h-6 text-[11px]" disabled={ingesting} onClick={() => void ingest()}>
              {ingesting ? 'Ingesting…' : 'Ingest note'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px]"
              onClick={() => {
                setIngestOpen(false);
                setForm(emptyIngestForm());
                setIngestError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex-1 flex min-h-0">
        <div className="w-[46%] min-w-[160px] border-r border-line flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-1.5 space-y-1">
            {loading && nodes.length === 0 ? (
              <div className="p-3 text-center text-[11px] text-zinc-500">Loading vault…</div>
            ) : error ? (
              <div className="p-3 text-center text-[11px] text-red-600">{error}</div>
            ) : nodes.length === 0 ? (
              <div className="p-3 text-center text-[11px] text-zinc-500">
                No notes yet — ingest one with New above.
              </div>
            ) : (
              nodes.map((n) => (
                <button
                  key={n.path}
                  onClick={() => void openNote(n.path)}
                  className={`w-full text-left p-2 rounded-md border flex gap-2 group transition ${
                    selected === n.path
                      ? 'bg-[#FDF0E6] border-[#F2D5C2] dark:bg-[#2A1E15]'
                      : 'border-transparent hover:border-line hover:bg-muted'
                  }`}
                >
                  <GitBranch className="w-3 h-3 text-zinc-400 mt-0.5 shrink-0 group-hover:text-terracotta" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate flex items-center gap-1">
                      {n.title}
                      <span className="ml-auto flex items-center gap-0.5 text-[10px] text-zinc-400">
                        <Link2 className="w-3 h-3" /> {n.links}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate">{n.path}</div>
                    {n.provenance ? (
                      <div className="text-[10px] text-[#6C5CE7] truncate">via {n.provenance}</div>
                    ) : null}
                  </div>
                  {n.tags.length > 0 ? (
                    <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted border border-line group-hover:bg-white shrink-0">
                      {n.tags[0]}
                    </span>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-[#FAF9F5] dark:bg-[#0F0F11] relative overflow-hidden">
          <div className="h-7 flex items-center gap-1 px-2 border-b border-line/50 bg-white/60 dark:bg-[#1E1E21]/60 backdrop-blur text-[11px] shrink-0">
            Graph — {placed.length} nodes · {edgeSet.length} edges · depth {depth}
          </div>
          <div className="flex-1 relative p-2 overflow-hidden min-h-0">
            {mode === '3d' ? (
              <VaultGraph3D nodes={nodes} links={edgeSet} selected={selected} onOpenNote={(p) => void openNote(p)} />
            ) : (
              <svg
                viewBox="0 0 300 200"
                className="w-full h-full rounded-lg bg-white dark:bg-[#1E1E21] border border-line"
                role="img"
                aria-label={`Vault graph, ${placed.length} notes`}
              >
                {edgeSet.map((l) => {
                  const a = byId.get(l.source);
                  const b = byId.get(l.target);
                  if (!a || !b) return null;
                  return (
                    <line
                      key={`${l.source}\n${l.target}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="#E8E4DE"
                      strokeWidth="1.2"
                    />
                  );
                })}
                {placed.map((n) => {
                  const fill = NODE_PALETTE[paletteIndex(n.path, NODE_PALETTE.length)];
                  return (
                    <g key={n.id} onClick={() => void openNote(n.path)} className="cursor-pointer">
                      <circle cx={n.x} cy={n.y} r={n.r + 5} fill={fill} opacity="0.12" />
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={n.r}
                        fill={fill}
                        stroke={selected === n.path ? '#262624' : 'white'}
                        strokeWidth={selected === n.path ? 2 : 1.5}
                        className="hover:opacity-80"
                      >
                        <title>{`${n.title} (${n.path})`}</title>
                      </circle>
                      <text
                        x={n.x}
                        y={n.y + n.r + 11}
                        textAnchor="middle"
                        fontSize="7"
                        fill="#6B7280"
                        fontFamily="Inter, sans-serif"
                      >
                        {n.title.length > 18 ? `${n.title.slice(0, 17)}…` : n.title}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}
            {noteLoading ? (
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-white dark:bg-[#1E1E21] border border-line text-[10px] text-zinc-500">
                Loading note…
              </div>
            ) : null}
          </div>
          {note ? (
            <NoteReader
              note={note}
              nodes={nodes}
              onOpenPath={(p) => void openNote(p)}
              onClose={() => {
                setNote(null);
                setSelected(null);
                setConfirmDelete(null);
              }}
              onDelete={() => void runDelete()}
              deleteArmed={confirmDelete === note.path}
              deleting={deleting}
            />
          ) : null}
          <div className="p-1.5 border-t border-line/50 bg-white/60 dark:bg-[#1E1E21]/60 text-[11px] text-zinc-500 flex gap-1 flex-wrap shrink-0">
            <span className="px-1.5 py-0.5 rounded bg-white border border-line">[[wikilink]] click → note</span>
            <span className="px-1.5 py-0.5 rounded bg-white border border-line">provenance: agentId</span>
            <span className="ml-auto hidden sm:inline">FTS5 full-text · {mode === '3d' ? '3D sphere' : '2D circle'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
