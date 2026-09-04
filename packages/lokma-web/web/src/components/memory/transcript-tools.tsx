import * as React from 'react';
import { FileSearch, History, Play, Search, Shrink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  ApiError,
  api,
  type CompactionRunRes,
  type CompactionStatusRes,
  type SessionSearchRes,
  type SessionSummary,
} from '@/lib/api';
import {
  compactionTone,
  formatCompactionStatus,
  formatLastRun,
  formatRunResult,
  hitRoleLabel,
  searchEngineLabel,
  searchErrorHint,
  sessionOptionLabel,
  validateTranscriptSearch,
} from './transcripts';

function errMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Request failed';
}

/**
 * TranscriptTools — wave 3b sections inside the Memory tab (Docs/28
 * session_search + §1.3 shrink): full-text search over one project's
 * session transcripts (FTS5, engine reported honestly) with jump-to-session,
 * plus per-session two-tier compaction (status → run hygiene/full → report).
 * Every control is live; below-threshold runs report an honest no-op.
 */
export function TranscriptTools({ onOpenSession }: { onOpenSession?: (id: string) => void }) {
  // --- transcript search state ---
  const [query, setQuery] = React.useState('');
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [searchHint, setSearchHint] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<SessionSearchRes | null>(null);

  // --- compaction state ---
  const [sessions, setSessions] = React.useState<SessionSummary[]>([]);
  const [sessionsError, setSessionsError] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState('');
  const [status, setStatus] = React.useState<CompactionStatusRes | null>(null);
  const [statusBusy, setStatusBusy] = React.useState(false);
  const [runBusy, setRunBusy] = React.useState<'hygiene' | 'full' | null>(null);
  const [runResult, setRunResult] = React.useState<CompactionRunRes | null>(null);
  const [compactError, setCompactError] = React.useState<string | null>(null);

  const loadSessions = React.useCallback(async () => {
    setSessionsError(null);
    try {
      const res = await api.listSessions();
      setSessions(res.sessions);
      if (res.sessions.length > 0) setSelectedId((prev) => prev || res.sessions[0].id);
    } catch (e) {
      setSessionsError(errMessage(e));
    }
  }, []);

  React.useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const loadStatus = React.useCallback(async (id: string) => {
    if (!id) return;
    setStatusBusy(true);
    setCompactError(null);
    setRunResult(null);
    try {
      setStatus(await api.getCompactionStatus(id));
    } catch (e) {
      setCompactError(errMessage(e));
      setStatus(null);
    } finally {
      setStatusBusy(false);
    }
  }, []);

  React.useEffect(() => {
    if (selectedId) void loadStatus(selectedId);
    else setStatus(null);
  }, [selectedId, loadStatus]);

  const runSearch = React.useCallback(async () => {
    const invalid = validateTranscriptSearch({ query });
    if (invalid) {
      setSearchError(invalid);
      setSearchHint(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    setSearchHint(null);
    try {
      setResult(await api.searchSessions(query.trim()));
    } catch (e) {
      setResult(null);
      setSearchError(errMessage(e));
      setSearchHint(e instanceof ApiError ? searchErrorHint(e.code) || null : null);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const runMode = React.useCallback(
    async (mode: 'hygiene' | 'full') => {
      if (!selectedId) return;
      setRunBusy(mode);
      setCompactError(null);
      try {
        const res = await api.runCompaction(selectedId, { mode });
        setRunResult(res);
        setStatus(await api.getCompactionStatus(selectedId));
      } catch (e) {
        setCompactError(errMessage(e));
      } finally {
        setRunBusy(null);
      }
    },
    [selectedId],
  );

  const tone = status ? compactionTone(status) : 'default';

  return (
    <div className="space-y-3">
      <div className="rounded border p-2.5">
        <div className="flex items-center gap-2">
          <FileSearch className="h-3.5 w-3.5 text-terracotta" />
          <label htmlFor="transcript-search" className="text-[11px] font-medium">
            Search transcripts
          </label>
          {result && (
            <span className="ml-auto text-[11px] text-muted-foreground">
              {result.count} {result.count === 1 ? 'hit' : 'hits'} · {searchEngineLabel(result.engine)}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              id="transcript-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runSearch();
              }}
              placeholder="E.g. deploy walkthrough"
              className="h-7 w-full rounded border bg-background pl-7 pr-2 text-xs"
            />
          </div>
          <Button size="sm" className="h-7 text-[11px]" onClick={() => void runSearch()} disabled={searching}>
            {searching ? 'Searching' : 'Search'}
          </Button>
        </div>
        {searchError && (
          <p className="mt-1.5 text-[11px] text-destructive">
            {searchError}
            {searchHint ? ` — ${searchHint}` : ''}
          </p>
        )}
        {result && result.hits.length === 0 && !searchError && (
          <div className="mt-1.5 rounded border border-dashed p-2.5 text-xs text-muted-foreground">
            No transcript mentions that — try fewer or shorter words.
          </div>
        )}
        {result && result.hits.length > 0 && (
          <ul className="mt-1.5 space-y-1.5">
            {result.hits.map((hit) => (
              <li key={`${hit.sessionId}:${hit.index}`} className="rounded border p-2">
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">{hitRoleLabel(hit)}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] font-medium" title={hit.sessionId}>
                    {hit.title}
                  </span>
                  {onOpenSession && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 shrink-0 px-1.5 text-[11px]"
                      onClick={() => onOpenSession(hit.sessionId)}
                    >
                      Open
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hit.excerpt}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded border p-2.5">
        <div className="flex items-center gap-2">
          <Shrink className="h-3.5 w-3.5 text-terracotta" />
          <label htmlFor="compaction-session" className="text-[11px] font-medium">
            Compact a session
          </label>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-5 px-1.5 text-[11px]"
            onClick={() => void loadSessions()}
          >
            Refresh list
          </Button>
        </div>
        {sessionsError ? (
          <p className="mt-1.5 text-[11px] text-destructive">Could not list sessions: {sessionsError}</p>
        ) : sessions.length === 0 ? (
          <div className="mt-1.5 rounded border border-dashed p-2.5 text-xs text-muted-foreground">
            No sessions yet — start a chat first, then compact it here.
          </div>
        ) : (
          <>
            <select
              id="compaction-session"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="mt-1.5 h-7 w-full rounded border bg-background px-2 text-xs"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {sessionOptionLabel(s)}
                </option>
              ))}
            </select>
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
              <History className="h-3 w-3 text-muted-foreground" />
              <span className={tone === 'destructive' ? 'text-destructive' : tone === 'warning' ? 'text-amber-600' : 'text-muted-foreground'}>
                {statusBusy ? 'Loading status' : status ? formatCompactionStatus(status) : 'Pick a session'}
              </span>
            </div>
            {status && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">Last run: {formatLastRun(status.last)}</p>
            )}
            <div className="mt-1.5 flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-6 gap-1.5 text-[11px]"
                onClick={() => void runMode('hygiene')}
                disabled={!selectedId || runBusy !== null || statusBusy}
              >
                <Play className="h-3 w-3" />
                {runBusy === 'hygiene' ? 'Compacting' : 'Run hygiene'}
              </Button>
              <Button
                size="sm"
                className="h-6 gap-1.5 text-[11px]"
                onClick={() => void runMode('full')}
                disabled={!selectedId || runBusy !== null || statusBusy}
              >
                <Play className="h-3 w-3" />
                {runBusy === 'full' ? 'Compacting' : 'Run full'}
              </Button>
            </div>
            {compactError && <p className="mt-1.5 text-[11px] text-destructive">{compactError}</p>}
            {runResult && (
              <p className="mt-1.5 rounded border p-2 text-[11px]">{formatRunResult(runResult)}</p>
            )}
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Hygiene trims whitespace and merges repeats; full also summarizes older messages into one anchor block.
              Originals are archived first — nothing is lost.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
