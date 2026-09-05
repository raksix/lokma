import * as React from 'react';
import { Brain, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError, api, type MemoryTarget, type MemoryUsageRes } from '@/lib/api';
import {
  charsLeft,
  errorHint,
  filterEntries,
  targetHint,
  targetLabel,
  usageRatio,
  MEMORY_TARGETS,
} from './memory';
import { validateAddForm, validateReplaceForm } from './memory';
import { TranscriptTools } from './transcript-tools';

function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('lokma-toast', { detail: message }));
}

function errMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
}

function errHint(e: unknown): string {
  return e instanceof ApiError ? errorHint(e.code) : '';
}

/**
 * MemoryPane — the global §-delimited MEMORY.md / USER.md store (wave 2,
 * Docs/28 §5.2) plus the wave 3b transcript tools (session_search over
 * transcripts + per-session two-tier compaction). Every control is live over
 * `GET/POST/PATCH/DELETE` `/api/memory`, `GET /api/sessions/search`, and
 * `GET|POST /api/sessions/:id/compaction`. The per-agent SOUL.md /
 * MEMORY.md editors stay in the Agents tab (different store — agent-scoped).
 * NOT ported: nothing — the concept has no memory pane, so there is no
 * mock to drop.
 */
export function MemoryPane({ onOpenSession }: { onOpenSession?: (id: string) => void }) {
  const [target, setTarget] = React.useState<MemoryTarget>('memory');
  const [data, setData] = React.useState<MemoryUsageRes | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [draft, setDraft] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState('');
  const [armed, setArmed] = React.useState<string | null>(null);
  const [rowBusy, setRowBusy] = React.useState<string | null>(null);
  const [rowError, setRowError] = React.useState<string | null>(null);
  const [rowHint, setRowHint] = React.useState<string | null>(null);

  const load = React.useCallback(async (t: MemoryTarget) => {
    setLoading(true);
    setLoadError(null);
    try {
      setData(await api.getMemory(t));
    } catch (e) {
      setLoadError(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load(target);
  }, [target, load]);

  // Switching target resets all row-local state (entries belong to one store).
  const switchTarget = React.useCallback((t: MemoryTarget) => {
    setTarget(t);
    setQuery('');
    setDraft('');
    setFormError(null);
    setEditing(null);
    setEditText('');
    setArmed(null);
    setRowError(null);
    setRowHint(null);
  }, []);

  const addEntry = React.useCallback(async () => {
    const invalid = validateAddForm({ content: draft });
    if (invalid) {
      setFormError(invalid);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await api.addMemory({ target, content: draft.trim() });
      setData(res);
      setDraft('');
      toast('Memory entry added');
    } catch (e) {
      const hint = errHint(e);
      setFormError(hint ? `${errMessage(e)} — ${hint}` : errMessage(e));
    } finally {
      setSaving(false);
    }
  }, [draft, target]);

  const saveEdit = React.useCallback(async (oldText: string) => {
    const invalid = validateReplaceForm({ oldText, content: editText });
    if (invalid) {
      setRowError(invalid);
      setRowHint(null);
      return;
    }
    setRowBusy(oldText);
    setRowError(null);
    setRowHint(null);
    try {
      const res = await api.replaceMemory({ target, old_text: oldText, content: editText.trim() });
      setData(res);
      setEditing(null);
      setEditText('');
      toast('Memory entry updated');
    } catch (e) {
      setRowError(errMessage(e));
      setRowHint(errHint(e) || null);
    } finally {
      setRowBusy(null);
    }
  }, [editText, target]);

  const deleteEntry = React.useCallback(async (entry: string) => {
    if (armed !== entry) {
      setArmed(entry);
      return;
    }
    setRowBusy(entry);
    setRowError(null);
    setRowHint(null);
    try {
      const res = await api.deleteMemory({ target, old_text: entry });
      setData(res);
      setArmed(null);
      if (editing === entry) {
        setEditing(null);
        setEditText('');
      }
      toast('Memory entry deleted');
    } catch (e) {
      setRowError(errMessage(e));
      setRowHint(errHint(e) || null);
    } finally {
      setRowBusy(null);
    }
  }, [armed, editing, target]);

  const entries = React.useMemo(
    () => filterEntries(data?.entries ?? [], query),
    [data, query],
  );
  const ratio = usageRatio(data?.chars ?? 0, data?.limit ?? 1);
  const left = charsLeft(data?.chars ?? 0, data?.limit ?? 1);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Brain className="h-3.5 w-3.5 text-terracotta" />
        <h3 className="text-xs font-semibold">Memory</h3>
        <span className="text-[11px] text-muted-foreground">
          {data ? `${data.count} ${data.count === 1 ? 'entry' : 'entries'}` : loading ? 'Loading' : ''}
        </span>
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1.5 text-[11px]"
            onClick={() => void load(target)}
            disabled={loading}
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex gap-1">
        {MEMORY_TARGETS.map((t) => (
          <Button
            key={t}
            variant={target === t ? 'default' : 'ghost'}
            size="sm"
            className="h-6 flex-1 text-[11px]"
            onClick={() => switchTarget(t)}
          >
            {targetLabel(t)}
          </Button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">{targetHint(target)}</p>

      {loadError ? (
        <div className="rounded border border-destructive/40 p-3 text-xs">
          <p>Could not load {targetLabel(target)}: {loadError}</p>
          <Button variant="outline" size="sm" className="mt-2 h-6 text-[11px]" onClick={() => void load(target)}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded border p-2.5">
            <div className="flex items-baseline justify-between text-[11px]">
              <label htmlFor="memory-usage-bar" className="font-medium">Store usage</label>
              <span className="text-muted-foreground">
                {data ? `${data.chars.toLocaleString()} / ${data.limit.toLocaleString()} chars · ${left.toLocaleString()} left` : '…'}
              </span>
            </div>
            <div
              id="memory-usage-bar"
              role="progressbar"
              aria-valuenow={Math.round(ratio * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-terracotta" style={{ width: `${Math.round(ratio * 100)}%` }} />
            </div>
            {data && <p className="mt-1 text-[11px] text-muted-foreground">{data.usage}</p>}
          </div>

          <div>
            <label htmlFor="memory-search" className="mb-1 block text-[11px] font-medium">Search entries</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input
                id="memory-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by text…"
                className="h-7 w-full rounded border bg-background pl-7 pr-2 text-xs"
              />
            </div>
          </div>

          <div>
            <label htmlFor="memory-add" className="mb-1 block text-[11px] font-medium">
              Add to {targetLabel(target)}
            </label>
            <div className="flex gap-1.5">
              <input
                id="memory-add"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addEntry();
                }}
                placeholder="E.g. User prefers concise replies"
                className="h-7 flex-1 rounded border bg-background px-2 text-xs"
              />
              <Button size="sm" className="h-7 gap-1.5 text-[11px]" onClick={() => void addEntry()} disabled={saving}>
                <Plus className="h-3 w-3" />
                {saving ? 'Adding' : 'Add'}
              </Button>
            </div>
            {formError && <p className="mt-1 text-[11px] text-destructive">{formError}</p>}
          </div>

          {rowError && (
            <p className="rounded border border-destructive/40 p-2 text-[11px] text-destructive">
              {rowError}{rowHint ? ` — ${rowHint}` : ''}
            </p>
          )}

          {entries.length === 0 ? (
            <div className="rounded border border-dashed p-3 text-xs text-muted-foreground">
              {data && data.count > 0 ? 'No entries match this filter.' : `${targetLabel(target)} is empty — add the first durable fact above.`}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {entries.map((entry, idx) => (
                <li key={entry} className="rounded border p-2">
                  {editing === entry ? (
                    <div className="space-y-1.5">
                      <label htmlFor={`memory-edit-${idx}`} className="block text-[11px] font-medium">
                        Edit entry
                      </label>
                      <textarea
                        id={`memory-edit-${idx}`}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={2}
                        className="w-full rounded border bg-background p-1.5 text-xs"
                      />
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          className="h-6 text-[11px]"
                          onClick={() => void saveEdit(entry)}
                          disabled={rowBusy === entry}
                        >
                          {rowBusy === entry ? 'Saving' : 'Save'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[11px]"
                          onClick={() => {
                            setEditing(null);
                            setEditText('');
                            setRowError(null);
                            setRowHint(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-1.5">
                      <p className="flex-1 text-xs leading-relaxed">{entry}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 shrink-0 p-0"
                        title="Edit entry"
                        onClick={() => {
                          setEditing(entry);
                          setEditText(entry);
                          setArmed(null);
                          setRowError(null);
                          setRowHint(null);
                        }}
                       aria-label="Edit entry">
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant={armed === entry ? 'destructive' : 'ghost'}
                        size="sm"
                        className="h-5 shrink-0 gap-1 px-1.5 text-[11px]"
                        title={armed === entry ? 'Click again to confirm delete' : 'Delete entry'}
                        onClick={() => void deleteEntry(entry)}
                        disabled={rowBusy === entry}
                      >
                        <Trash2 className="h-3 w-3" />
                        {armed === entry ? (rowBusy === entry ? 'Deleting' : 'Confirm') : ''}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-muted-foreground">
            Per-agent SOUL.md / MEMORY.md files live in the Agents tab — this store is the global cross-session memory.
          </p>
          <TranscriptTools onOpenSession={onOpenSession} />
        </>
      )}
    </div>
  );
}
