import * as React from 'react';
import {
  AlertTriangle,
  FileDiff,
  FolderGit2,
  GitBranch,
  GitCommit,
  GitMerge,
  Lock,
  RefreshCw,
  Unlock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, type GitFileChange, type GitLockRow, type GitLogEntry } from '@/lib/api';
import { emitToast } from '@/components/shell';
import {
  changeBadge,
  fileInWorktree,
  filterChanges,
  findLockForFile,
  pushLabel,
  shortHash,
  validateCommitMessage,
  type GitFilter,
} from './git';

/**
 * GitPane — real `git status` + log + commit + push for the session repo (W3-11).
 * Status/log/commit/push/gc all hit live `/api/git/*` endpoints scoped to the
 * session cwd; the 3-layer safe banner reads REAL advisory locks
 * (`GET /api/git/locks`) + worktrees (from the status payload) — never mock
 * `FILES`/`COMMITS` arrays. Concept toast-only buttons (Show, toast Commit /
 * Push / GC) are NOT ported: every button below runs real git.
 * Non-repos render an honest empty state (server answers `{ repo: false }`).
 */

function badgeClass(badge: string): string {
  if (badge === 'M') return 'bg-amber-500 text-white border-amber-500';
  if (badge === 'A') return 'bg-emerald-500 text-white border-emerald-500';
  if (badge === 'D') return 'bg-red-500 text-white border-red-500';
  if (badge === 'R') return 'bg-sky-500 text-white border-sky-500';
  return 'bg-zinc-100 text-zinc-600 border-line dark:bg-zinc-800 dark:text-zinc-300';
}

export function GitPane({ sessionId }: { sessionId?: string }) {
  const [cwd, setCwd] = React.useState('');
  const [isRepo, setIsRepo] = React.useState(true);
  const [branch, setBranch] = React.useState('');
  const [upstream, setUpstream] = React.useState<string | null>(null);
  const [ahead, setAhead] = React.useState(0);
  const [behind, setBehind] = React.useState(0);
  const [files, setFiles] = React.useState<GitFileChange[]>([]);
  const [worktrees, setWorktrees] = React.useState<string[]>([]);
  const [locks, setLocks] = React.useState<GitLockRow[]>([]);
  const [commits, setCommits] = React.useState<GitLogEntry[]>([]);
  const [filter, setFilter] = React.useState<GitFilter>('all');
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState<'commit' | 'push' | 'gc' | null>(null);
  const [lastError, setLastError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async (dir: string) => {
    setLoading(true);
    try {
      const [status, log, lockRes] = await Promise.all([
        api.getGitStatus(dir || undefined),
        api.getGitLog(dir || undefined),
        api.getGitLocks(dir || undefined),
      ]);
      if (!status.repo) {
        setIsRepo(false);
        setFiles([]);
        setCommits([]);
        setLocks([]);
        setWorktrees([]);
      } else {
        setIsRepo(true);
        setBranch(status.branch);
        setUpstream(status.upstream);
        setAhead(status.ahead);
        setBehind(status.behind);
        setFiles(status.files);
        setWorktrees(status.worktrees);
        setCommits(log.commits);
        setLocks(lockRes.locks);
      }
      setLastError(null);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : 'git status failed');
    } finally {
      setLoading(false);
    }
  }, []);

  // Session scope: resolve the repo root from the session, like FileBrowser.
  React.useEffect(() => {
    if (!sessionId) {
      setCwd('');
      void refresh('');
      return;
    }
    api
      .getSession(sessionId)
      .then((detail) => {
        setCwd(detail.cwd ?? '');
        void refresh(detail.cwd ?? '');
      })
      .catch(() => {
        setCwd('');
        void refresh('');
      });
  }, [sessionId, refresh]);

  const lockedPaths = React.useMemo(() => new Set(locks.map((l) => l.path)), [locks]);
  const worktreePaths = React.useMemo(() => {
    const root = cwd || '';
    return new Set(files.filter((f) => root && fileInWorktree(root, f.path, worktrees)).map((f) => f.path));
  }, [files, cwd, worktrees]);
  const visible = filterChanges(files, filter, lockedPaths, worktreePaths);
  const lockedCount = files.filter((f) => lockedPaths.has(f.path)).length;

  async function runCommit() {
    const problem = validateCommitMessage(message);
    if (problem) {
      setLastError(problem);
      return;
    }
    setBusy('commit');
    setLastError(null);
    try {
      const res = await api.commitGit(message.trim(), cwd || undefined);
      setMessage('');
      emitToast(`Committed ${res.short}`);
      await refresh(cwd);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : 'commit failed');
    } finally {
      setBusy(null);
    }
  }

  async function runPush() {
    setBusy('push');
    setLastError(null);
    try {
      const res = await api.pushGit(cwd || undefined);
      emitToast(res.output ? `Pushed — ${res.output.split('\n').pop()}` : 'Pushed');
      await refresh(cwd);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : 'push failed');
    } finally {
      setBusy(null);
    }
  }

  async function runGc() {
    setBusy('gc');
    setLastError(null);
    try {
      await api.gcGit(cwd || undefined);
      emitToast('Worktrees pruned');
      await refresh(cwd);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : 'gc failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0 overflow-x-auto">
        <GitBranch className="w-3 h-3 text-zinc-500" />
        <span className="text-xs font-semibold">Git</span>
        {isRepo && branch && (
          <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px]">
            {branch}
          </span>
        )}
        {isRepo && (
          <span className="ml-1 hidden sm:inline text-[11px] text-zinc-400">
            {files.length} changed · {lockedCount} locked · {worktrees.length} worktree{worktrees.length === 1 ? '' : 's'}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            title="Refresh status"
            onClick={() => void refresh(cwd)}
          >
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button
            variant={filter === 'all' ? 'default' : 'ghost'}
            size="sm"
            className="h-5 px-2 text-[11px]"
            onClick={() => setFilter('all')}
          >
            all
          </Button>
          <Button
            variant={filter === 'locked' ? 'default' : 'ghost'}
            size="sm"
            className="h-5 px-2 text-[11px]"
            onClick={() => setFilter('locked')}
          >
            locked
          </Button>
          <Button
            variant={filter === 'worktree' ? 'default' : 'ghost'}
            size="sm"
            className="h-5 px-2 text-[11px]"
            onClick={() => setFilter('worktree')}
          >
            worktree
          </Button>
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-3 text-xs text-zinc-400">Reading git status…</div>
        ) : !isRepo ? (
          <div className="m-2 p-3 rounded-md border border-dashed border-line text-xs text-zinc-500">
            <span className="font-medium">Not a git repository.</span> The session cwd
            {cwd ? (
              <>
                {' '}(<code className="px-1 py-0 rounded bg-white border border-line font-mono">{cwd}</code>)
              </>
            ) : null}{' '}
            has no <code className="px-1 py-0 rounded bg-white border border-line font-mono">.git</code> — open a
            session inside a repo to use this pane.
          </div>
        ) : (
          <>
            <div className="p-2 space-y-1.5">
              {visible.length === 0 && (
                <div className="p-3 rounded-md border border-dashed border-line text-[11px] text-zinc-500">
                  {files.length === 0
                    ? 'Working tree is clean — nothing to commit.'
                    : `No files match the “${filter}” filter.`}
                </div>
              )}
              {visible.map((f) => {
                const lock = findLockForFile(f.path, locks);
                const inWorktree = cwd ? fileInWorktree(cwd, f.path, worktrees) : false;
                const badge = changeBadge(f);
                return (
                  <div
                    key={f.path}
                    className="flex items-center gap-2 p-2 rounded-lg border border-line bg-white dark:bg-[#1E1E21] hover:border-terracotta/20 transition group"
                  >
                    <FileDiff
                      className={`w-3 h-3 shrink-0 ${badge === 'M' ? 'text-amber-600' : badge === 'A' ? 'text-emerald-600' : 'text-zinc-400'}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono truncate flex items-center gap-1.5">
                        {f.path}
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${lock ? 'bg-amber-500' : 'bg-zinc-300'}`}
                          title={lock ? `locked by ${lock.owner}` : 'unlocked'}
                        />
                        {inWorktree && (
                          <span className="hidden sm:inline px-1 py-0 rounded text-[10px] border bg-[#EEF2FF] border-[#C7D2FE] text-[#4F46E5]">
                            worktree
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                        {lock ? <Lock className="w-3 h-3 text-amber-600" /> : <Unlock className="w-3 h-3 text-zinc-300" />}
                        {lock ? (
                          <span>
                            {lock.owner} · lease renews by heartbeat
                          </span>
                        ) : (
                          'no lock · shared cwd — 3-way merge on sha mismatch'
                        )}
                        {(f.staged || f.worktree) && (
                          <span className="hidden md:inline ml-1 font-mono">
                            {f.staged ? `staged ${f.staged}` : ''}
                            {f.staged && f.worktree ? ' · ' : ''}
                            {f.worktree ? `unstaged ${f.worktree}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 ${badgeClass(badge)}`}>
                      {badge}
                    </span>
                  </div>
                );
              })}
              <div className="p-2 rounded-md bg-muted/30 border border-dashed border-line text-[11px] text-zinc-500">
                <span className="font-medium">3-layer safe:</span> lease ({locks.length} live lock{locks.length === 1 ? '' : 's'}
                {locks.length > 0 ? ` — ${[...new Set(locks.map((l) => l.owner))].slice(0, 3).join(', ')}` : ''}) → expectedSha
                guard → worktree isolation ({worktrees.length} worktree{worktrees.length === 1 ? '' : 's'})
              </div>
            </div>

            <div className="mx-2 rounded-lg border border-line overflow-hidden">
              <div className="h-7 flex items-center gap-1.5 px-3 bg-[#FDFCFB] dark:bg-[#1E1E21] border-b border-line text-xs font-medium">
                <GitCommit className="w-3 h-3" /> Log
                <span className="ml-auto hidden sm:inline text-[11px] font-normal text-zinc-400">
                  <FolderGit2 className="w-3 h-3 inline" /> {pushLabel(ahead, behind, upstream)}
                </span>
              </div>
              <div className="divide-y divide-line/50">
                {commits.length === 0 && (
                  <div className="px-3 py-2 text-[11px] text-zinc-400">No commits yet.</div>
                )}
                {commits.map((c) => (
                  <div key={c.hash} className="flex gap-2 px-3 py-2 hover:bg-muted/30 transition" title={c.hash}>
                    <GitCommit className="w-3 h-3 text-zinc-400 mt-1 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{c.message}</div>
                      <div className="text-[11px] text-zinc-400">
                        <span className="font-mono">{shortHash(c.hash)}</span> · {c.author} ·{' '}
                        {c.date ? new Date(c.date).toLocaleString() : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="m-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
                <div className="text-xs font-medium flex items-center gap-1">
                  <GitMerge className="w-3 h-3 text-terracotta" /> Merge — coordinator
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">
                  coordinator mediates <code className="px-1 py-0 rounded bg-muted border border-line">merge.request</code>{' '}
                  when hunks overlap → diff3/AST driver
                </div>
              </div>
              <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
                <div className="text-xs font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-600" /> expectedSha guard
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">
                  <code className="px-1 py-0 rounded bg-muted border border-line">edit_file expectedSha</code> rejects
                  stale → re-read → 3-way merge
                </div>
              </div>
            </div>

            <div className="m-2 space-y-1.5">
              <label htmlFor="git-commit-message" className="text-[11px] font-medium text-zinc-500">
                Commit message (stages all changes)
              </label>
              <div className="flex gap-1.5">
                <input
                  id="git-commit-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void runCommit();
                  }}
                  placeholder="feat(web): what changed"
                  className="flex-1 h-7 px-2 text-xs rounded-md border border-line bg-white dark:bg-[#1E1E21] placeholder:text-zinc-400"
                />
                <Button size="sm" className="h-7 text-xs" disabled={busy !== null} onClick={() => void runCommit()}>
                  {busy === 'commit' ? 'Committing…' : 'Commit'}
                </Button>
              </div>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  disabled={busy !== null}
                  onClick={() => void runPush()}
                >
                  {busy === 'push' ? 'Pushing…' : 'Push'}
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={busy !== null} onClick={() => void runGc()}>
                  {busy === 'gc' ? 'Pruning…' : 'GC'}
                </Button>
              </div>
              {lastError && <div className="text-[11px] text-red-600 dark:text-red-400">{lastError}</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
