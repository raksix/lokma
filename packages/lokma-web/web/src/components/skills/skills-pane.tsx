import * as React from 'react';
import {
  BookOpen,
  ChevronRight,
  Download,
  FileText,
  History,
  Pencil,
  Puzzle,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, type MarketplaceItem, type SkillUsage } from '@/lib/api';
import { formatStars, initials } from '../plugins/plugins';
import {
  buildAvailableSkills,
  emptyPatchForm,
  filterSkills,
  formatUsage,
  normalizeSkills,
  validatePatchForm,
  type NormalizedSkill,
  type PatchForm,
} from './skills';

/**
 * SkillsPane — live skill registry over the real `registry.scan()` index (W4-16).
 * Concept layout 1:1 (header + searchable list + skill_view detail), but
 * every pixel is live: rows come from `GET /api/skills` (repo `skills/` +
 * `~/.lokma/skills`), the preview is the real SKILL.md body from
 * `GET /api/skills/:id`, linked files load through
 * `GET /api/skills/:id/file?path=`, the Patch editor writes through
 * `PATCH /api/skills/:id` (single-occurrence guard), and the telemetry
 * card shows the real `.usage.json` counters (`used N · viewed M ·
 * patched K`, zeros when the skill was never touched — never invented).
 * NOT ported: the concept's hardcoded SKILLS rows + rank figures, the
 * toast-only `/skills` palette + Marketplace buttons (Refresh does a real
 * reload instead), and the enabled/disabled dot (the registry has no
 * enabled flag — patches, not toggles, are the curator contract).
 */

const inputClass =
  'h-7 rounded-md border border-line bg-white px-2 text-xs focus:outline-none focus:border-terracotta/30 dark:bg-[#1E1E21]';

function toast(message: string): void {
  window.dispatchEvent(new CustomEvent('lokma-toast', { detail: message }));
}

function SourceBadge({ source }: { source: 'bundled' | 'user' }) {
  return source === 'bundled' ? (
    <span className="px-1 py-0 rounded text-[10px] border bg-zinc-100 border-line text-zinc-600">
      bundled
    </span>
  ) : (
    <span className="px-1 py-0 rounded text-[10px] border bg-terracotta text-white border-terracotta">
      user
    </span>
  );
}

export function SkillsPane() {
  const [q, setQ] = React.useState('');
  const [skills, setSkills] = React.useState<NormalizedSkill[]>([]);
  const [usage, setUsage] = React.useState<Record<string, SkillUsage>>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [content, setContent] = React.useState<string | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [linkedPath, setLinkedPath] = React.useState<string | null>(null);
  const [linkedContent, setLinkedContent] = React.useState<string | null>(null);
  const [linkedLoading, setLinkedLoading] = React.useState(false);
  const [patchOpen, setPatchOpen] = React.useState(false);
  const [patchForm, setPatchForm] = React.useState<PatchForm>(emptyPatchForm);
  const [patchError, setPatchError] = React.useState<string | null>(null);
  const [patching, setPatching] = React.useState(false);
  const [recordingUse, setRecordingUse] = React.useState(false);
  const [view, setView] = React.useState<'registry' | 'market'>('registry');
  // Remote skill marketplace (live GitHub topic — no local state until Install).
  const [mquery, setMquery] = React.useState('');
  const [mitems, setMitems] = React.useState<MarketplaceItem[] | null>(null);
  const [msource, setMsource] = React.useState('');
  const [mloading, setMloading] = React.useState(false);
  const [merror, setMerror] = React.useState<string | null>(null);
  const [minstalling, setMinstalling] = React.useState<Record<string, boolean>>({});
  const reloadRef = React.useRef(0);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const loadList = React.useCallback(async () => {
    const run = (reloadRef.current += 1);
    setLoading(true);
    try {
      const res = await api.listSkills();
      if (reloadRef.current !== run) return;
      setSkills(normalizeSkills(res.skills));
      setUsage(res.usage && typeof res.usage === 'object' ? res.usage : {});
      setError(null);
    } catch (e) {
      if (reloadRef.current !== run) return;
      setSkills([]);
      setUsage({});
      setError(e instanceof Error ? e.message : 'skills list failed');
    } finally {
      if (reloadRef.current === run) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = React.useCallback(async (id: string) => {
    const run = (reloadRef.current += 1);
    setDetailLoading(true);
    setDetailError(null);
    setContent(null);
    setLinkedPath(null);
    setLinkedContent(null);
    setPatchOpen(false);
    setPatchForm(emptyPatchForm);
    setPatchError(null);
    try {
      const res = await api.getSkill(id);
      if (reloadRef.current !== run) return;
      setSkills((prev) => {
        const row = normalizeSkills([res.skill])[0];
        if (!row) return prev;
        return prev.some((s) => s.id === row.id)
          ? prev.map((s) => (s.id === row.id ? row : s))
          : [...prev, row];
      });
      setContent(res.content);
      // A detail view is a view event — refresh the counters silently.
      try {
        const list = await api.listSkills();
        if (reloadRef.current === run && list.usage) setUsage(list.usage);
      } catch {
        // Counters are advisory; the preview already landed.
      }
    } catch (e) {
      if (reloadRef.current !== run) return;
      setDetailError(e instanceof Error ? e.message : 'skill_view failed');
    } finally {
      if (reloadRef.current === run) setDetailLoading(false);
    }
  }, []);

  // Selecting a row loads the real SKILL.md (progressive disclosure).
  React.useEffect(() => {
    if (selected) void loadDetail(selected);
  }, [selected, loadDetail]);

  const openLinkedFile = React.useCallback(
    async (path: string) => {
      if (!selected) return;
      setLinkedLoading(true);
      try {
        const res = await api.getSkillFile(selected, path);
        setLinkedPath(res.path);
        setLinkedContent(res.content);
      } catch (e) {
        toast(e instanceof Error ? e.message : 'reference load failed');
      } finally {
        setLinkedLoading(false);
      }
    },
    [selected],
  );

  const applyPatch = React.useCallback(async () => {
    if (!selected) return;
    const local = validatePatchForm(patchForm);
    if (local) {
      setPatchError(local);
      return;
    }
    setPatching(true);
    setPatchError(null);
    try {
      const res = await api.patchSkill(selected, {
        old_string: patchForm.old_string,
        new_string: patchForm.new_string,
      });
      setContent(null);
      toast(`Patched ${res.skill.id} (${res.bytes} bytes)`);
      // Reload the preview + counters from the server (never assume).
      await loadDetail(selected);
      const list = await api.listSkills();
      setSkills(normalizeSkills(list.skills));
      if (list.usage) setUsage(list.usage);
      setPatchOpen(false);
      setPatchForm(emptyPatchForm);
    } catch (e) {
      setPatchError(e instanceof Error ? e.message : 'patch failed');
    } finally {
      setPatching(false);
    }
  }, [selected, patchForm, loadDetail]);

  const markUsed = React.useCallback(async () => {
    if (!selected || recordingUse) return;
    setRecordingUse(true);
    try {
      await api.recordSkillUse(selected);
      const list = await api.listSkills();
      if (list.usage) setUsage(list.usage);
      toast(`Recorded use of ${selected}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'record use failed');
    } finally {
      setRecordingUse(false);
    }
  }, [selected, recordingUse]);

  const searchMarket = React.useCallback(async (query: string) => {
    setMloading(true);
    setMerror(null);
    try {
      const res = await api.searchSkillMarketplace(query.trim());
      setMitems(res.items);
      setMsource(res.source);
    } catch (e) {
      setMerror(e instanceof Error ? e.message : 'marketplace search failed');
    } finally {
      setMloading(false);
    }
  }, []);

  const openMarket = React.useCallback(() => {
    setView('market');
    // Browse the whole topic on first open (empty q = no filter).
    if (mitems === null && !mloading && merror === null) void searchMarket('');
  }, [mitems, mloading, merror, searchMarket]);

  const installFromMarket = async (item: MarketplaceItem) => {
    setMinstalling((prev) => ({ ...prev, [item.repo]: true }));
    try {
      const res = await api.installSkill(item.url);
      toast(`${res.skill.name} installed — in the registry as ${res.skill.id}`);
      // Reload the registry so the new row appears without a manual refresh.
      const list = await api.listSkills();
      setSkills(normalizeSkills(list.skills));
      if (list.usage) setUsage(list.usage);
    } catch (e) {
      toast(`Install failed — ${e instanceof Error ? e.message : 'install failed'}`);
    } finally {
      setMinstalling((prev) => ({ ...prev, [item.repo]: false }));
    }
  };

  const filtered = React.useMemo(() => filterSkills(skills, q), [skills, q]);
  const sel = selected ? (skills.find((s) => s.id === selected) ?? null) : null;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#161618] rounded-lg overflow-hidden border border-line">
      <div className="h-7 flex items-center gap-1.5 px-3 border-b border-line bg-[#FDFCFB] dark:bg-[#1E1E21] shrink-0">
        <Puzzle className="w-3 h-3 text-terracotta" />
        <span className="text-xs font-semibold">Skills</span>
        <span className="ml-1 text-[11px] text-zinc-400 hidden @min-[320px]:inline">
          auto-discovery · Use when · skill_view · curator
        </span>
        <span className="ml-auto flex gap-1">
          <Button
            variant={view === 'registry' ? 'default' : 'ghost'}
            size="sm"
            className="h-5 text-[11px]"
            onClick={() => setView('registry')}
          >
            Registry
          </Button>
          <Button
            variant={view === 'market' ? 'default' : 'ghost'}
            size="sm"
            className="h-5 text-[11px]"
            onClick={() => void openMarket()}
          >
            Marketplace
          </Button>
          {view === 'registry' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[11px] gap-1"
            onClick={() => searchRef.current?.focus()}
          >
            <Search className="w-3 h-3" /> /skills
          </Button>
          )}
        </span>
      </div>

      {view === 'market' ? (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="p-2 border-b border-line/50 space-y-2">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <label htmlFor="skill-marketplace-search" className="sr-only">
                Search the skill marketplace
              </label>
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
              <Input
                id="skill-marketplace-search"
                placeholder="Search GitHub lokma-skill repos…"
                value={mquery}
                onChange={(e) => setMquery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void searchMarket(mquery);
                }}
                className="pl-7 h-7 text-xs"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => void searchMarket(mquery)}
              disabled={mloading}
            >
              <Search className="w-3 h-3" />
              {mloading ? 'Searching…' : 'Search'}
            </Button>
          </div>
          <div className="text-[11px] text-zinc-400">
            Live GitHub <span className="font-mono">lokma-skill</span> topic{msource ? ` — ${msource}` : ''} · Install clones
            the repo into <span className="font-mono">~/.lokma/skills/</span> and rescans — no restart.
          </div>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1.5">
          {merror && (
            <div className="p-3 rounded-lg border border-red-200 text-xs text-red-600">
              {merror}{' '}
              <button type="button" className="underline" onClick={() => void searchMarket(mquery)}>
                Retry
              </button>
            </div>
          )}
          {mloading && mitems === null && !merror && (
            <div className="p-6 text-center text-xs text-zinc-400">Searching the marketplace…</div>
          )}
          {(mitems ?? []).map((item) => {
            const busy = minstalling[item.repo] ?? false;
            return (
              <div
                key={item.repo}
                className="flex gap-3 p-2.5 rounded-lg border border-line bg-white dark:bg-[#1E1E21] hover:border-terracotta/20 hover:shadow-sm transition"
              >
                <span className="w-8 h-8 rounded-lg bg-[#262624] dark:bg-white text-white dark:text-black grid place-items-center text-[10px] font-bold shrink-0">
                  {initials(item.name)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold flex items-center gap-1.5 flex-wrap">
                    {item.name}
                    <span className="text-[11px] font-normal text-zinc-400">· {item.author}</span>
                    <span className="flex items-center gap-0.5 text-[11px] font-normal text-zinc-400">
                      <Star className="w-3 h-3" /> {formatStars(item.stars)}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 leading-4 line-clamp-2" title={item.description || 'No description upstream.'}>
                    {item.description || 'No description upstream.'}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-400 font-mono truncate">{item.repo}</div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs px-2 gap-1"
                    onClick={() => void installFromMarket(item)}
                    disabled={busy}
                    title={`Install ${item.repo}`}
                  >
                    <Download className="w-3 h-3" />
                    {busy ? 'Adding…' : 'Install'}
                  </Button>
                  <a
                    className="text-[11px] text-zinc-400 underline text-center"
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Repo
                  </a>
                </div>
              </div>
            );
          })}
          {!mloading && !merror && mitems !== null && mitems.length === 0 && (
            <div className="p-6 text-center text-xs text-zinc-400">
              No skills carry the lokma-skill topic yet — publish a repo with that topic to list it here.
            </div>
          )}
        </div>
        <div className="p-2 border-t border-line bg-muted/20 text-[11px] text-zinc-500">
          Install = <span className="font-mono">git clone --depth 1</span> + SKILL.md check + rescan · community repos are
          unvetted — inspect the repo before installing
        </div>
      </div>
      ) : (
      <>
      {/* Narrow containers stack list over detail (same pattern as archify/bots). */}
      <div className="flex flex-1 min-h-0 @max-[380px]:flex-col @max-[380px]:overflow-auto">
        <div className="w-[42%] min-w-[180px] border-r border-line flex flex-col @max-[380px]:w-full @max-[380px]:min-w-0 @max-[380px]:border-r-0 @max-[380px]:border-b @max-[380px]:max-h-72 @max-[380px]:shrink-0">
          <div className="p-2 border-b border-line/50">
            <label htmlFor="skills-search" className="sr-only">
              Search skills
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-400" />
              <Input
                id="skills-search"
                ref={searchRef as React.Ref<HTMLInputElement>}
                placeholder="Search skills — Use when..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-7 h-7 text-xs"
              />
            </div>
            <div className="mt-1.5 flex gap-1 text-[11px] text-zinc-500">
              <span className="px-1.5 py-0.5 rounded bg-muted border border-line">
                {filtered.length} skills
              </span>
              <span className="px-1.5 py-0.5 rounded bg-white border border-line">
                registry.scan() · trie
              </span>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-1.5 space-y-1">
            {loading ? (
              <div className="p-4 text-center text-xs text-zinc-400">Scanning registry…</div>
            ) : error ? (
              <div className="p-3 text-xs text-red-600 dark:text-red-400">
                {error}{' '}
                <button className="underline" onClick={() => void loadList()}>
                  Retry
                </button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-zinc-400">
                {skills.length === 0
                  ? 'No skills in the registry — add SKILL.md files under skills/ or ~/.lokma/skills/'
                  : 'No match'}
              </div>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelected(s.id)}
                  className={`w-full text-left p-2 rounded-md border flex gap-2 transition ${selected === s.id ? 'bg-[#FDF0E6] border-[#F2D5C2] dark:bg-[#2A1E15] dark:border-[#3A2A1A]' : 'bg-white dark:bg-[#1E1E21] border-line hover:border-terracotta/20'}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium flex items-center gap-1 min-w-0">
                      <span className="truncate" title={s.name}>{s.name}</span>
                      <span className="shrink-0"><SourceBadge source={s.source} /></span>
                    </div>
                    <div className="text-[11px] text-zinc-500 truncate" title={s.description}>{s.description}</div>
                    <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                      <History className="w-3 h-3" /> {formatUsage(usage[s.id] ?? usage[s.name])}
                    </div>
                  </div>
                  <ChevronRight
                    className={`w-3 h-3 mt-1 shrink-0 ${selected === s.id ? 'text-terracotta' : 'text-zinc-300'}`}
                  />
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t border-line/50">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-6 text-xs gap-1"
              onClick={() => void loadList()}
            >
              <RefreshCw className="w-3 h-3" /> Refresh registry
            </Button>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 bg-[#FAF9F5]/50 dark:bg-[#0F0F11]/50">
          {sel ? (
            <>
              <div className="p-3 border-b border-line/50 bg-white dark:bg-[#1E1E21]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{sel.name}</span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted border border-line">
                    {sel.id}
                  </span>
                  <SourceBadge source={sel.source} />
                </div>
                <div className="mt-1 text-[11px] font-mono text-terracotta bg-[#FDF0E6] dark:bg-[#2A1E15] border border-[#F2D5C2] rounded px-1.5 py-1">
                  {sel.description}
                </div>
                <div className="text-[11px] text-zinc-400 mt-1">
                  first 57 chars routing · no embeddings in hot path · progressive disclosure via
                  skill_view
                </div>
                <div className="mt-2 flex gap-1 flex-wrap">
                  <Button
                    size="sm"
                    className="h-6 text-xs gap-1"
                    onClick={() => void loadDetail(sel.id)}
                  >
                    <BookOpen className="w-3 h-3" /> skill_view
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => setPatchOpen((v) => !v)}
                  >
                    Patch
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    disabled={recordingUse}
                    onClick={() => void markUsed()}
                  >
                    {recordingUse ? 'Recording…' : 'Record use'}
                  </Button>
                </div>
                {sel.linked_files.length > 0 ? (
                  <div className="mt-2 flex gap-1 flex-wrap items-center">
                    <FileText className="w-3 h-3 text-zinc-400" />
                    {sel.linked_files.map((f) => (
                      <button
                        key={f}
                        disabled={linkedLoading}
                        onClick={() => void openLinkedFile(f)}
                        className={`text-[11px] px-1.5 py-0.5 rounded border transition ${linkedPath === f ? 'bg-[#FDF0E6] border-[#F2D5C2] text-terracotta' : 'bg-white dark:bg-[#1E1E21] border-line text-zinc-500 hover:border-terracotta/30'}`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex-1 overflow-auto p-3 space-y-2">
                {detailLoading ? (
                  <div className="p-4 text-center text-xs text-zinc-400">Loading SKILL.md…</div>
                ) : detailError ? (
                  <div className="p-3 text-xs text-red-600 dark:text-red-400">
                    {detailError}{' '}
                    <button className="underline" onClick={() => void loadDetail(sel.id)}>
                      Retry
                    </button>
                  </div>
                ) : content !== null ? (
                  <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
                    <div className="text-xs font-medium flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-terracotta" /> SKILL.md preview
                    </div>
                    <pre className="mt-2 p-2 rounded bg-muted border border-line text-[11px] leading-5 overflow-auto whitespace-pre-wrap">
                      {content}
                    </pre>
                  </div>
                ) : null}
                {linkedPath && linkedContent !== null ? (
                  <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
                    <div className="text-xs font-medium flex items-center gap-1">
                      <FileText className="w-3 h-3 text-terracotta" /> {linkedPath}
                    </div>
                    <pre className="mt-2 p-2 rounded bg-muted border border-line text-[11px] leading-5 overflow-auto whitespace-pre-wrap">
                      {linkedContent}
                    </pre>
                  </div>
                ) : null}
                {patchOpen ? (
                  <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
                    <div className="text-xs font-medium flex items-center gap-1">
                      <Pencil className="w-3 h-3 text-terracotta" /> Curator patch
                    </div>
                    <label
                      htmlFor="skill-patch-old"
                      className="mt-2 block text-[11px] text-zinc-500"
                    >
                      old_string (must match exactly one block)
                    </label>
                    <textarea
                      id="skill-patch-old"
                      value={patchForm.old_string}
                      onChange={(e) =>
                        setPatchForm((f) => ({ ...f, old_string: e.target.value }))
                      }
                      rows={4}
                      className={`${inputClass} mt-1 w-full h-auto font-mono text-[11px] py-1.5`}
                    />
                    <label
                      htmlFor="skill-patch-new"
                      className="mt-2 block text-[11px] text-zinc-500"
                    >
                      new_string
                    </label>
                    <textarea
                      id="skill-patch-new"
                      value={patchForm.new_string}
                      onChange={(e) =>
                        setPatchForm((f) => ({ ...f, new_string: e.target.value }))
                      }
                      rows={4}
                      className={`${inputClass} mt-1 w-full h-auto font-mono text-[11px] py-1.5`}
                    />
                    {patchError ? (
                      <div className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">
                        {patchError}
                      </div>
                    ) : null}
                    <div className="mt-2 flex gap-1">
                      <Button
                        size="sm"
                        className="h-6 text-xs"
                        disabled={patching}
                        onClick={() => void applyPatch()}
                      >
                        {patching ? 'Patching…' : 'Apply patch'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => {
                          setPatchOpen(false);
                          setPatchForm(emptyPatchForm);
                          setPatchError(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
                <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
                  <div className="text-xs font-medium flex items-center gap-1">
                    <History className="w-3 h-3" /> Telemetry — .usage.json → curator ranking
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500">
                    {formatUsage(usage[sel.id] ?? usage[sel.name])} → auto-reorders
                    &lt;available_skills&gt;
                  </div>
                </div>
                <div className="rounded-lg border border-line bg-white dark:bg-[#1E1E21] p-2.5">
                  <div className="text-xs font-medium flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Injected every turn
                  </div>
                  <div className="mt-1 text-[11px] font-mono bg-[#0F0F11] text-white/90 p-2 rounded border border-white/10 overflow-auto whitespace-pre-wrap">
                    {buildAvailableSkills(skills)}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 grid place-items-center text-xs text-zinc-400 p-6 text-center">
              Select a skill → skill_view preview
              <br />
              <span className="text-[11px]">&lt;available_skills&gt; + trie + curator patch</span>
            </div>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}
