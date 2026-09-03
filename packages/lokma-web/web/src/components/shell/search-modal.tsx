import * as React from 'react';
import { FileText, MessagesSquare, Search } from 'lucide-react';
import { api, type SessionSummary } from '@/lib/api';
import { useSessionStore } from '@/stores';

/**
 * SearchModal — global search (Ctrl/Cmd+K) over REAL harness data:
 * live sessions (`GET /api/sessions`, via sessionStore) + vault notes
 * (`GET /api/vault/graph?q=`). The concept's hardcoded DOCS array is gone —
 * every row below comes from the server. Selecting a session switches to it;
 * selecting a note toasts its id (the note pane lands in W4).
 */

export type NoteHit = { id: string; title: string };

/** Case-insensitive substring match over session ids (pure, unit-tested). */
export function filterSessionHits(sessions: SessionSummary[], query: string): SessionSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return sessions.slice(0, 8);
  return sessions.filter((s) => s.id.toLowerCase().includes(q)).slice(0, 8);
}

/** Coerce unknown vault graph nodes into displayable hits (pure, unit-tested). */
export function filterNoteHits(nodes: unknown[], query: string): NoteHit[] {
  const q = query.trim().toLowerCase();
  const hits: NoteHit[] = [];
  for (const node of nodes) {
    if (hits.length >= 8) break;
    if (typeof node !== 'object' || node === null) continue;
    const rec = node as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id : typeof rec.path === 'string' ? rec.path : null;
    if (!id) continue;
    const title =
      typeof rec.title === 'string' && rec.title
        ? rec.title
        : typeof rec.label === 'string' && rec.label
          ? rec.label
          : id;
    if (q && !`${title} ${id}`.toLowerCase().includes(q)) continue;
    hits.push({ id, title });
  }
  return hits;
}

export function SearchModal({
  open,
  onClose,
  onSelectSession,
}: {
  open: boolean;
  onClose: () => void;
  onSelectSession: (id: string) => void;
}) {
  const [q, setQ] = React.useState('');
  const [noteNodes, setNoteNodes] = React.useState<unknown[]>([]);
  const [notesError, setNotesError] = React.useState<string | null>(null);
  const sessions = useSessionStore((s) => s.sessions);
  const refreshSessions = useSessionStore((s) => s.refreshSessions);

  // Refresh the session list every time the modal opens (fresh server data).
  React.useEffect(() => {
    if (!open) return;
    setQ('');
    setNotesError(null);
    void refreshSessions();
  }, [open, refreshSessions]);

  // Debounced live vault search as the user types.
  React.useEffect(() => {
    if (!open) return;
    const query = q.trim();
    const timer = setTimeout(() => {
      api
        .getVaultGraph(query || undefined)
        .then((res) => {
          setNoteNodes(Array.isArray(res.nodes) ? res.nodes : []);
          setNotesError(null);
        })
        .catch((e: unknown) => {
          setNoteNodes([]);
          setNotesError(e instanceof Error ? e.message : 'vault search failed');
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [open, q]);

  if (!open) return null;
  const sessionHits = filterSessionHits(sessions, q);
  const noteHits = filterNoteHits(noteNodes, q);
  const firstHit = sessionHits[0]?.id ?? noteHits[0]?.id ?? null;

  const openFirst = (): void => {
    if (!firstHit) return;
    const isSession = sessionHits.some((s) => s.id === firstHit);
    if (isSession) {
      onSelectSession(firstHit);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[70vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-[#E8E4DE] bg-white shadow-2xl">
        <div className="border-b border-[#E8E4DE] p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') openFirst();
              }}
              placeholder="Search sessions and vault notes…"
              className="h-8 w-full rounded-md border border-[#E8E4DE] bg-transparent pl-8 pr-3 text-sm outline-none placeholder:text-zinc-400 focus:ring-1 focus:ring-[#C96442]"
            />
          </div>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-2">
          <section>
            <div className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              <MessagesSquare className="h-3 w-3" /> Sessions
            </div>
            {sessionHits.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-zinc-500">
                No sessions match — create one from the chat pane.
              </div>
            ) : (
              sessionHits.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    onSelectSession(s.id);
                    onClose();
                  }}
                  className="flex w-full items-center gap-2 rounded-md border border-transparent p-2 text-left hover:border-[#E8E4DE] hover:bg-[#F2F0EB]"
                >
                  <MessagesSquare className="h-4 w-4 shrink-0 text-zinc-400" />
                  <span className="font-mono text-xs font-medium">{s.id}</span>
                </button>
              ))
            )}
          </section>
          <section>
            <div className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              <FileText className="h-3 w-3" /> Vault notes
            </div>
            {notesError ? (
              <div className="px-2 py-3 text-center text-xs text-red-600">{notesError}</div>
            ) : noteHits.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-zinc-500">
                No notes yet — the vault graph lands fully in W4.
              </div>
            ) : (
              noteHits.map((n) => (
                <div
                  key={n.id}
                  className="flex w-full items-center gap-2 rounded-md border border-transparent p-2 text-left"
                >
                  <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
                  <div>
                    <div className="text-xs font-medium">{n.title}</div>
                    <div className="font-mono text-[11px] text-zinc-500">{n.id}</div>
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
        <div className="flex justify-between border-t border-[#E8E4DE] p-2 text-[11px] text-zinc-400">
          <span>Enter opens first hit · Esc closes</span>
          <span>
            {sessionHits.length} sessions · {noteHits.length} notes
          </span>
        </div>
      </div>
    </div>
  );
}
