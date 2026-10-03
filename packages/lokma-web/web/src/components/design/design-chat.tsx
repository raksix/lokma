import * as React from 'react';
import { Loader2, RotateCcw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SelectMenu, type SelectMenuGroup, type SelectMenuOption } from '@/components/ui/select-menu';
import { COMPOSER_ENTER_HINT, COMPOSER_SHELL_CLASS, ComposerInput } from '@/components/chat/composer-input';
import { useProviderStore, useSessionStore } from '@/stores';
import { enabledModels, groupByProvider } from '@/components/providers/models';
import { emitToast } from '@/components/shell';
import { cn } from '@/lib/utils';
import {
  DESIGN_TYPES,
  DESIGN_SKILL_SELECT_CAP,
  formatUpdated,
  groupSkillRows,
  overallLabel,
  projectLabel,
  skillSelectionLabel,
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
  // REQ-191 — the System picker reads the INSTALLED CATALOG, grouped by the
  // OpenDesign taxonomy (AI & LLM, Developer Tools, Fintech…) and searchable.
  // The previous flat list came from the frozen `DESIGN_SYSTEMS` table, i.e.
  // the user could never reach Stripe/Linear/Claude. Bundled preset rows are
  // still offered when the catalog dir is empty, but they are LABELLED as
  // presets rather than presented as a package.
  const systemGroups = React.useMemo<SelectMenuGroup[]>(() => {
    const byCategory = new Map<string, SelectMenuOption[]>();
    for (const row of s.systems) {
      const bucket = byCategory.get(row.category) ?? [];
      bucket.push({
        value: row.id,
        label: row.origin === 'catalog' ? row.label : `${row.label} (preset)`,
      });
      byCategory.set(row.category, bucket);
    }
    return [...byCategory.entries()].map(([label, options]) => ({ label, options }));
  }, [s.systems]);
  const hasCatalog = s.systemsSource === 'catalog' && s.systems.length > 0;
  // REQ-192 — the design-SKILL picker. A SECOND axis beside System, deliberately
  // not merged into it: a system is the palette, a skill is the SKILL.md
  // instruction set the model follows while producing. Rows are grouped by the
  // server's taxonomy (Style / Layout / Accessibility / …) and searchable.
  const skillGroups = React.useMemo<SelectMenuGroup[]>(
    () =>
      groupSkillRows(s.skills, s.skillGroups).map((group) => ({
        label: group.label,
        options: group.rows.map((row) => ({ value: row.id, label: row.name })),
      })),
    [s.skills, s.skillGroups],
  );
  const skillNames = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const row of s.skills) map.set(row.id, row.name);
    return map;
  }, [s.skills]);
  const selectedSkills = React.useMemo(
    () =>
      s.form.skills
        .map((id) => s.skills.find((row) => row.id === id))
        .filter((row): row is NonNullable<typeof row> => Boolean(row)),
    [s.form.skills, s.skills],
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
            groups={systemGroups}
            searchable
            searchPlaceholder="Search design systems"
            menuClassName="max-h-[320px] min-w-[15rem]"
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
        {/* REQ-192 — the SKILL axis. Multi-select on purpose: one brief can ask
            for a style AND a layout AND accessibility rules, and the prompt
            carries all of them. The trigger summarises the set honestly, the
            chips below are the per-skill remove + read affordances. */}
        <div className="mt-2 border-t border-line pt-2" data-design-skills>
          <div className="flex items-end gap-1.5">
            <div className="min-w-0 flex-1">
              <SelectMenu
                label={`Design skills (${s.form.skills.length}/${DESIGN_SKILL_SELECT_CAP})`}
                value=""
                onChange={s.toggleSkill}
                groups={skillGroups}
                multi
                multiValues={s.form.skills}
                multiLabel={skillSelectionLabel(s.form.skills, skillNames)}
                searchable
                searchPlaceholder="Search design skills"
                menuClassName="max-h-[320px] min-w-[15rem]"
                triggerAttrs={{ 'data-design-composer-skills': '' }}
              />
            </div>
            <button
              type="button"
              data-design-skills-reset
              onClick={s.resetSkills}
              disabled={s.form.skills.length === 0}
              title="Clear every selected skill"
              className="mb-px flex h-7 shrink-0 items-center gap-1 rounded-md border border-line bg-white px-1.5 text-[10px] text-zinc-500 hover:bg-[#F7F5F1] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-[#0F0F11] dark:text-zinc-400 dark:hover:bg-[#242427]"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          </div>
          {s.skills.length === 0 && s.skillsUnscoped > 0 ? (
            <p data-design-skills-empty className={cn('mt-1 text-[10px]', META_CLASS)}>
              No design-scoped skills installed — {s.skillsUnscoped} skill(s) were skipped because they declare no
              {' `scope: design`'} in their frontmatter.
            </p>
          ) : null}
          {s.skills.length === 0 && s.skillsUnscoped === 0 ? (
            <p data-design-skills-empty className={cn('mt-1 text-[10px]', META_CLASS)}>
              No design skills found in this workspace.
            </p>
          ) : null}
          {selectedSkills.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {selectedSkills.map((row) => (
                <span
                  key={row.id}
                  data-design-skill-chip={row.id}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-1.5 py-0.5 text-[10px] text-ink dark:bg-[#0F0F11] dark:text-white"
                >
                  <button
                    type="button"
                    title={'Read ' + row.name + ' (SKILL.md)'}
                    data-design-skill-read={row.id}
                    onClick={() => s.previewSkill(row.id)}
                    className="max-w-[9rem] truncate"
                  >
                    {row.name}
                  </button>
                  <button
                    type="button"
                    title={'Remove ' + row.name}
                    aria-label={'Remove ' + row.name}
                    data-design-skill-remove={row.id}
                    onClick={() => s.toggleSkill(row.id)}
                    className="text-zinc-400 hover:text-rose-600 dark:hover:text-rose-300"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          {s.skillPreview || s.skillPreviewLoading || s.skillPreviewError ? (
            <div data-design-skill-preview className="mt-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className={cn('truncate text-[10px] font-medium', META_CLASS)}>
                  {s.skillPreviewLoading
                    ? 'Reading SKILL.md…'
                    : (s.skillPreview?.name ?? 'SKILL.md')}
                </p>
                <button
                  type="button"
                  data-design-skill-preview-close
                  title="Close preview"
                  aria-label="Close skill preview"
                  onClick={() => s.previewSkill(null)}
                  className="text-zinc-400 hover:text-rose-600 dark:hover:text-rose-300"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              {s.skillPreviewError ? (
                <p className="mt-1 text-[10px] text-rose-600 dark:text-rose-300">{s.skillPreviewError}</p>
              ) : null}
              {s.skillPreview ? (
                <pre
                  data-design-skill-preview-body
                  className="mt-1 max-h-40 overflow-y-auto rounded-md border border-line bg-white p-1.5 font-mono text-[10px] leading-4 whitespace-pre-wrap text-zinc-600 dark:bg-[#0F0F11] dark:text-zinc-400"
                >
                  {s.skillPreview.content}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
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
