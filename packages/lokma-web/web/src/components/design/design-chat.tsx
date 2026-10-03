import * as React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SelectMenu, type SelectMenuGroup, type SelectMenuOption } from '@/components/ui/select-menu';
import { COMPOSER_ENTER_HINT, COMPOSER_SHELL_CLASS, ComposerInput } from '@/components/chat/composer-input';
import { useProviderStore, useSessionStore } from '@/stores';
import { enabledModels, groupByProvider } from '@/components/providers/models';
import { emitToast } from '@/components/shell';
import { cn } from '@/lib/utils';
import {
  DESIGN_SYSTEMS,
  DESIGN_TYPES,
  formatUpdated,
  overallLabel,
  projectLabel,
  type DesignEvent,
  type NormalizedArtifact,
} from './design';
import { DESIGN_SLASH_COMMANDS, applyDesignSlash } from './design-slash';
import type { DesignStudio } from './use-design-studio';

/**
 * DesignChat (REQ-172) — the left column of the Design Studio. What used to
 * be two stacked cards ("Brief" + "Artifacts") is now a single message flow:
 * every artifact reads as a user brief with its status chips, session events
 * ("Generated …", "HTML saved") land as narration chips, and the composer at
 * the bottom owns Project / Type / System / Model / brief — Generate is the
 * send action.
 *
 * REQ-179 — the composer controls are the app's own SelectMenu: no native
 * <select>, so the OS blue highlight is gone in both themes; labels and meta
 * text sit on passing contrast tokens (zinc-500 on cream, zinc-400 on the
 * dark panels). The composer also gained a title row ("New artifact" + the
 * shortcut hint) and a divided brief group, and the empty thread renders a
 * guiding card instead of a lone line.
 */

const EVENT_CLASS: Record<DesignEvent['kind'], string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  info: 'border-line bg-muted/40 text-zinc-500 dark:text-zinc-400',
  error: 'border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300',
};

const CHIP_CLASS =
  'rounded-full border border-line bg-white px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-[#1E1E21] dark:text-zinc-400';

const LABEL_CLASS = 'block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400';
const META_CLASS = 'text-zinc-500 dark:text-zinc-400';

function ArtifactMessage({
  row,
  active,
  onSelect,
}: {
  row: NormalizedArtifact;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className={cn('text-[10px] font-medium uppercase tracking-wide', META_CLASS)}>You</p>
      <button
        data-design-msg={row.id}
        onClick={() => onSelect(row.id)}
        title={row.type + ' · ' + row.system + ' · ' + overallLabel(row.overall)}
        className={cn(
          'block w-full rounded-xl border px-2.5 py-2 text-left text-[12px] leading-5',
          active
            ? 'border-terracotta/50 bg-terracotta/10'
            : 'border-line bg-white hover:bg-[#F7F5F1] dark:bg-[#1E1E21] dark:hover:bg-[#242427]',
        )}
      >
        {row.brief}
      </button>
      <div className="flex flex-wrap items-center gap-1 pl-0.5">
        <span className={CHIP_CLASS}>{row.type}</span>
        <span className={CHIP_CLASS}>{row.system}</span>
        {row.project ? (
          <span data-design-msg-project title={row.project} className={CHIP_CLASS}>
            {projectLabel(row.project)}
          </span>
        ) : null}
        <span className={CHIP_CLASS}>{overallLabel(row.overall)}</span>
        <span className={cn('text-[10px]', META_CLASS)}>{formatUpdated(row.updatedAt)}</span>
      </div>
    </div>
  );
}

export function DesignChat({ studio }: { studio: DesignStudio }) {
  const s = studio;
  // REQ-177 — the composer's model picker speaks from the same catalog as
  // the chat composer (only enabled models; Models tab owns the flags).
  const storeModels = useProviderStore((state) => state.models);
  // REQ-178 — the project picker lists the saved project records (same
  // source as session creation); only entries with a real cwd can scope
  // the design root.
  const storeProjects = useSessionStore((state) => state.projects);
  const projects = React.useMemo(
    () => storeProjects.filter((p) => p.cwd.trim() !== ''),
    [storeProjects],
  );
  const modelGroups = React.useMemo(
    () => groupByProvider(enabledModels(storeModels)),
    [storeModels],
  );
  const modelInCatalog = React.useMemo(
    () => modelGroups.some((group) => group.models.some((m) => m.id === s.form.model)),
    [modelGroups, s.form.model],
  );

  // REQ-179 — the SelectMenu options carry the labels the old <option> rows
  // used, including the honest fallbacks ('not saved' / 'not in catalog').
  const projectOptions = React.useMemo<SelectMenuOption[]>(() => {
    const rows: SelectMenuOption[] = [{ value: '', label: 'Global (~)' }];
    for (const p of projects) rows.push({ value: p.cwd, label: p.name + ' — ' + p.cwd });
    if (s.projectCwd && !projects.some((p) => p.cwd === s.projectCwd)) {
      rows.push({ value: s.projectCwd, label: projectLabel(s.projectCwd) + ' — not saved' });
    }
    return rows;
  }, [projects, s.projectCwd]);
  const typeOptions = React.useMemo<SelectMenuOption[]>(
    () => DESIGN_TYPES.map((t) => ({ value: t, label: t })),
    [],
  );
  const systemOptions = React.useMemo<SelectMenuOption[]>(
    () => DESIGN_SYSTEMS.map((system) => ({ value: system, label: system })),
    [],
  );
  const modelOptions = React.useMemo<SelectMenuOption[]>(() => {
    const rows: SelectMenuOption[] = [{ value: '', label: 'Default (auto)' }];
    if (s.form.model && !modelInCatalog) {
      rows.push({ value: s.form.model, label: s.form.model + ' — not in catalog' });
    }
    return rows;
  }, [s.form.model, modelInCatalog]);
  const modelGrouped = React.useMemo<SelectMenuGroup[]>(
    () =>
      modelGroups.map((group) => ({
        label: group.provider,
        options: group.models.map((m) => ({ value: m.id, label: m.label })),
      })),
    [modelGroups],
  );

  const threadRef = React.useRef<HTMLDivElement>(null);
  // Keep the newest line in view as artifacts/events/generating land.
  React.useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [s.items.length, s.events.length, s.generating]);
  // The server list is newest-first; the thread reads oldest-first.
  const ordered = React.useMemo(() => [...s.items].reverse(), [s.items]);
  return (
    <aside
      data-design-chat
      className="flex max-h-[45vh] w-full shrink-0 flex-col border-b border-line bg-[#FDFCFB] md:h-full md:max-h-none md:w-[340px] md:border-b-0 md:border-r lg:w-[380px] dark:bg-[#1E1E21]"
    >
      <div ref={threadRef} data-design-thread className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {s.loading && s.items.length === 0 ? (
          <p className={cn('text-[11px]', META_CLASS)}>Loading artifacts…</p>
        ) : null}
        {!s.loading && s.error ? (
          <p className="text-[11px] text-rose-600 dark:text-rose-300">
            {s.error}{' '}
            <button className="underline" onClick={s.reload}>
              Retry
            </button>
          </p>
        ) : null}
        {!s.loading && !s.error && ordered.length === 0 && s.events.length === 0 && !s.generating ? (
          <div
            data-design-thread-empty
            className="rounded-xl border border-dashed border-line bg-white/70 p-3 dark:bg-[#0F0F11]/50"
          >
            <p className="text-[12px] font-medium text-ink dark:text-white">No artifacts yet</p>
            <p className={cn('mt-1 text-[11px] leading-5', META_CLASS)}>
              Describe the artifact below — Type and System set the style; Generate renders it on the canvas and saves
              it to {projectLabel(s.projectCwd)}.
            </p>
          </div>
        ) : null}
        {ordered.map((row) => (
          <ArtifactMessage key={row.id} row={row} active={row.id === s.selected} onSelect={s.setSelected} />
        ))}
        {s.events.map((e) => (
          <div
            key={e.id}
            data-design-event
            className={cn('inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[10px]', EVENT_CLASS[e.kind])}
          >
            <span className="truncate">{e.text}</span>
          </div>
        ))}
        {s.generating ? (
          <div
            data-design-event
            className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]', EVENT_CLASS.info)}
          >
            <Loader2 className="h-3 w-3 animate-spin" /> Generating…
          </div>
        ) : null}
      </div>
      <div data-design-composer className="shrink-0 border-t border-line bg-[#FDFCFB] p-3 dark:bg-[#1E1E21]">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="font-serif text-[13px] text-ink dark:text-white">New artifact</p>
          <span className={cn('text-[10px]', META_CLASS)}>@file · / for commands</span>
        </div>
        <SelectMenu
          label="Project"
          value={s.projectCwd}
          onChange={s.changeProject}
          options={projectOptions}
          triggerAttrs={{ 'data-design-composer-project': '' }}
        />
        {projects.length === 0 ? (
          <p className={cn('mt-1 text-[10px]', META_CLASS)}>
            No saved projects yet — Global writes to ~/.lokma/design.
          </p>
        ) : null}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <SelectMenu
            label="Type"
            value={s.form.type}
            onChange={(value) => s.setForm((f) => ({ ...f, type: value }))}
            options={typeOptions}
            triggerAttrs={{ 'data-design-composer-type': '' }}
          />
          <SelectMenu
            label="System"
            value={s.form.system}
            onChange={(value) => s.setForm((f) => ({ ...f, system: value }))}
            options={systemOptions}
            triggerAttrs={{ 'data-design-composer-system': '' }}
          />
        </div>
        <SelectMenu
          className="mt-2"
          label="Model"
          value={s.form.model}
          onChange={(value) => s.setForm((f) => ({ ...f, model: value }))}
          options={modelOptions}
          groups={modelGrouped}
          triggerAttrs={{ 'data-design-composer-model': '' }}
        />
        <div className="mt-3 border-t border-line pt-2.5">
          <label htmlFor="design-brief" className={LABEL_CLASS}>
            Brief
          </label>
          <div className={cn('mt-1', COMPOSER_SHELL_CLASS)} data-design-composer-input>
            <ComposerInput
              id="design-brief"
              ariaLabel="Design brief"
              placeholder="e.g. pricing page, 3 tiers, terracotta, Stripe polish…"
              value={s.form.brief}
              onChange={(value) => s.setForm((f) => ({ ...f, brief: value }))}
              onSubmit={() => void s.runGenerate()}
              commands={DESIGN_SLASH_COMMANDS}
              onSlash={(id, args) => {
                const result = applyDesignSlash(id, args, s.form, s.setForm, s.applySample);
                emitToast('message' in result ? result.message : result.error);
              }}
              hintId="design-brief-hint"
              attrs={{ 'data-design-brief': '' }}
              minHeight={56}
              maxHeight={200}
              disabled={s.generating}
            >
              <div className="mt-1 flex items-center gap-1.5 px-1 pb-0.5">
                <span id="design-brief-hint" className="min-w-0 truncate text-[10px] text-zinc-400">
                  {COMPOSER_ENTER_HINT}
                </span>
              </div>
            </ComposerInput>
          </div>
          {s.formError ? (
            <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-300">{s.formError}</p>
          ) : null}
          <Button
            data-design-generate
            size="sm"
            className="mt-2 h-9 w-full gap-1.5 text-[12px]"
            onClick={() => void s.runGenerate()}
            disabled={s.generating || !s.form.brief.trim()}
          >
            <Sparkles className="h-3.5 w-3.5" /> {s.generating ? 'Generating…' : 'Generate'}
          </Button>
          {s.generating ? (
            <p className={cn('mt-1.5 text-center text-[10px]', META_CLASS)}>
              Generating — the composer is locked until the artifact lands.
            </p>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
