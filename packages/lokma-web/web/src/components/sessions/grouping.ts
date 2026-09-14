import type { SessionSummary } from '@/lib/api';

/**
 * Pure list helpers for the Sessions sidebar — grouping, filtering, labels.
 * No DOM, no server: every function below is covered by `sessions.test.ts`.
 * Ported from `concept/.../layout/SidebarLeft.tsx` (Today/Yesterday/Earlier
 * + by-project), now operating on real `GET /api/sessions` summaries.
 */

export type DayGroup = 'Today' | 'Yesterday' | 'Earlier';

const DAY_MS = 86_400_000;

/** Calendar-day start (local time) for day-bucket comparisons. */
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Bucket one ISO timestamp into Today / Yesterday / Earlier. */
export function dayGroup(iso: string | undefined, now: number = Date.now()): DayGroup {
  if (!iso) return 'Earlier';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return 'Earlier';
  const diffDays = Math.round((startOfDay(now) - startOfDay(ts)) / DAY_MS);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return 'Earlier';
}

/** Short relative label: `2m ago`, `3h ago`, `Yesterday`, `4d ago`, `12 Jan`. */
export function relativeTime(iso: string | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diff = now - ts;
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24 && startOfDay(now) === startOfDay(ts)) return `${hours}h ago`;
  const diffDays = Math.round((startOfDay(now) - startOfDay(ts)) / DAY_MS);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Compact one-token activity badge for session rows (REQ-051): `5m`,
 * `3h`, `2d` — minutes / hours / day-bucket days, `now` under a minute,
 * short date past 30 days, empty when the timestamp is missing.
 * The full `relativeTime` string stays available as the badge tooltip.
 */
export function activityBadge(iso: string | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '';
  const diff = now - ts;
  if (diff < 0) return 'now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24 && startOfDay(now) === startOfDay(ts)) return `${hours}h`;
  const diffDays = Math.round((startOfDay(now) - startOfDay(ts)) / DAY_MS);
  if (diffDays < 30) return `${diffDays}d`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Newest-first comparator on `updatedAt` (REQ-051: latest prompt on top). */
function byRecency(a: SessionSummary, b: SessionSummary): number {
  const ta = a.updatedAt ? Date.parse(a.updatedAt) : Number.NaN;
  const tb = b.updatedAt ? Date.parse(b.updatedAt) : Number.NaN;
  const na = Number.isNaN(ta) ? 0 : ta;
  const nb = Number.isNaN(tb) ? 0 : tb;
  return nb - na;
}

/** Display title — server title, else the raw id (never an empty row). */
export function displayTitle(s: SessionSummary): string {
  const t = (s.title ?? '').trim();
  return t || s.id;
}

/**
 * REQ-138 — the virtual project that holds every session belonging to no
 * project record: a session with no cwd, or one whose cwd matches no project.
 * It renders like any other project group (top of the sidebar, first in
 * "By project" mode) instead of being scattered across Today/Yesterday.
 */
export const HOME_PROJECT = 'Home';

/** Project label from the session cwd (last path segment, `~`-aware). */
export function projectOf(s: SessionSummary): string {
  const cwd = (s.cwd ?? '').replace(/\/+$/, '');
  if (!cwd) return HOME_PROJECT;
  if (cwd === '~') return HOME_PROJECT;
  const parts = cwd.split('/');
  return parts[parts.length - 1] || cwd;
}

/**
 * Tolerant cwd equality (REQ-087): trailing slashes must not split one
 * project into two groups. `/x/proj` and `/x/proj/` are the same project
 * (they only differ because older records stored the raw typed path).
 */
export function sameCwd(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (v: string | null | undefined): string => {
    const t = (v ?? '').trim();
    if (!t) return '';
    if (t === '~' || t === '~/') return '~';
    return t.length > 1 ? t.replace(/\/+$/, '') : t;
  };
  return norm(a) === norm(b);
}

/** Sidebar count label with correct singular (`1 msg`, otherwise `N msgs`). */
export function messageCountLabel(count: number): string {
  return count === 1 ? '1 msg' : `${count} msgs`;
}

/**
 * REQ-138 — split the session list against the known project records:
 * `home` holds everything that matches no project (no cwd at all, or a cwd
 * nobody has claimed), `inProjects` holds the rest. The sidebar renders `home`
 * as the Home project and keeps `inProjects` for the time/by-project lists, so
 * a session shows up exactly once.
 */
export function splitByProjects(
  sessions: SessionSummary[],
  projectCwds: (string | null | undefined)[],
): { home: SessionSummary[]; inProjects: SessionSummary[] } {
  // A project record with no cwd is not a location: it must not claim every
  // cwd-less session, because `sameCwd('', '')` is true by design.
  const cwds = projectCwds.filter((c): c is string => Boolean((c ?? '').trim()));
  const home: SessionSummary[] = [];
  const inProjects: SessionSummary[] = [];
  for (const s of sessions) {
    if (cwds.some((c) => sameCwd(s.cwd, c))) inProjects.push(s);
    else home.push(s);
  }
  return { home, inProjects };
}

/** Case-insensitive substring match over title + id + model. */
export function filterSessions(sessions: SessionSummary[], query: string): SessionSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return sessions;
  return sessions.filter((s) =>
    `${s.title ?? ''} ${s.id} ${s.model ?? ''}`.toLowerCase().includes(q),
  );
}

export type SessionGroup = { key: string; label: string; items: SessionSummary[] };

/**
 * Group sessions for the sidebar list.
 * `time` → Today / Yesterday / Earlier (non-empty only, newest first);
 * `project` → one group per cwd basename, most sessions first.
 * Every group lists sessions newest-first by `updatedAt` (REQ-051: the
 * session with the latest prompt/activity always sits on top).
 */
export function groupSessions(
  sessions: SessionSummary[],
  mode: 'time' | 'project',
  now: number = Date.now(),
): SessionGroup[] {
  if (mode === 'project') {
    const byProject = new Map<string, SessionSummary[]>();
    for (const s of sessions) {
      const p = projectOf(s);
      const arr = byProject.get(p);
      if (arr) arr.push(s);
      else byProject.set(p, [s]);
    }
    return [...byProject.entries()]
      .map(([key, items]) => ({ key, label: key, items: [...items].sort(byRecency) }))
      // REQ-138 — Home is pinned first, like a real project: it is the default
      // landing group, not just the biggest pile.
      .sort((a, b) => {
        if (a.key === HOME_PROJECT) return -1;
        if (b.key === HOME_PROJECT) return 1;
        return b.items.length - a.items.length || a.key.localeCompare(b.key);
      });
  }
  const buckets: Record<DayGroup, SessionSummary[]> = { Today: [], Yesterday: [], Earlier: [] };
  for (const s of sessions) buckets[dayGroup(s.updatedAt, now)].push(s);
  return (Object.keys(buckets) as DayGroup[])
    .filter((g) => buckets[g].length > 0)
    .map((g) => ({ key: g, label: g, items: buckets[g].sort(byRecency) }));
}
