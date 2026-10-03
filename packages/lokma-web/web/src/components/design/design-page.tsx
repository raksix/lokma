import * as React from 'react';
import {
  Code2,
  Copy,
  Download,
  FolderKanban,
  Gauge,
  History,
  LayoutTemplate,
  MoreHorizontal,
  Paintbrush,
  Palette,
  RefreshCw,
  RotateCcw,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContextMenu, type ContextMenuEntry } from '@/components/ui/context-menu';
import { SelectMenu, type SelectMenuOption } from '@/components/ui/select-menu';
import { useProviderStore } from '@/stores';
import { enabledModels } from '@/components/providers/models';
import {
  DESIGN_SAMPLES,
  DESIGN_TWEAK_FIELDS,
  DESIGN_TWEAK_NOTE_CAP,
  buildFieldTweakNote,
  fieldControl,
  fieldCurrentValue,
  formatUpdated,
  projectLabel,
  scoreTone,
  versionLabel,
  type DesignExportFormat,
  type DesignTweakField,
} from './design';
import { DesignArtboards } from './design-artboards';
import { DesignChat } from './design-chat';
import { useDesignStudio, type DesignStudio } from './use-design-studio';

/**
 * DesignPage — REQ-168: the Design Studio as its OWN full page (the third
 * entry of the `lokma` · `Bots` · `Design` top switch). REQ-172 rebuilt the
 * layout after Google Stitch / Claude Design: two columns only — the left is
 * the brief/iteration CHAT (composer with Type/System chips, Generate as the
 * send action) and the right is the CANVAS (big sandboxed viewer, a Stitch
 * artboard strip of variants, a compact toolbar carrying Code / Critique /
 * Export / ⋯ actions). The old Brief card, Artifacts card, tab stack and
 * info cards are gone; every function still talks to the real endpoints.
 */

const TONE_CLASS: Record<'good' | 'warn' | 'bad', string> = {
  good: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  warn: 'bg-amber-100 text-amber-700 border-amber-200',
  bad: 'bg-rose-100 text-rose-700 border-rose-200',
};

/** Export menu rows — every stored format stays one click away. */
const EXPORT_MENU: { format: DesignExportFormat; label: string; scale?: 1 | 2 }[] = [
  { format: 'html', label: 'HTML' },
  { format: 'zip', label: 'ZIP (raw + viewer)' },
  { format: 'json', label: 'JSON manifest' },
  { format: 'png', label: 'PNG · 1x', scale: 1 },
  { format: 'png', label: 'PNG · 2x', scale: 2 },
  { format: 'webm', label: 'WebM · 2s clip' },
];

/**
 * REQ-189 — Esc closes the Artifacts panel, but ONLY while it is open: with the
 * panel closed the key must stay free for the composer and the rest of the
 * studio, so the listener is registered by this hook only for as long as the
 * panel is mounted — a closed panel holds no keydown handler at all.
 */
function useArtifactsPanelEscape(open: boolean, onClose: () => void) {
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}

function CodeDrawer({ studio }: { studio: DesignStudio }) {
  const s = studio;
  return (
    <div
      data-design-code-panel
      className="absolute inset-x-0 bottom-0 z-10 max-h-[55%] overflow-y-auto border-t border-line bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.08)] dark:bg-[#1E1E21]"
    >
      <div className="flex items-center gap-2 px-3 pt-2">
        <Code2 className="h-3 w-3 text-terracotta" />
        <span className="text-[11px] font-medium">artifact.html</span>
        <span className="hidden text-[10px] text-zinc-400 sm:inline">edits rebuild the viewer above</span>
        <button
          data-design-panel-close
          className="ml-auto rounded p-0.5 text-zinc-400 hover:bg-muted"
          aria-label="Close code panel"
          onClick={() => s.toggleDrawer('code')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-1.5 p-3 pt-2">
        <textarea
          data-design-code
          value={s.htmlEdit}
          onChange={(e) => s.setHtmlEdit(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder="<html>…"
          className="w-full rounded-md border border-line bg-white p-2 font-mono text-[11px] leading-4 focus:border-terracotta/30 focus:outline-none dark:bg-[#0F0F11]"
        />
        {s.htmlError ? <p className="text-[11px] text-rose-600">{s.htmlError}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            data-design-save
            size="sm"
            className="h-7 gap-1 text-[11px]"
            onClick={() => void s.runSave()}
            disabled={!s.selected || s.saving}
          >
            {s.saving ? 'Saving…' : 'Save HTML'}
          </Button>
          <span className="text-[10px] text-zinc-400">stored artifact is updated and the viewer rebuilt</span>
        </div>
      </div>
    </div>
  );
}

function CritiqueDrawer({ studio }: { studio: DesignStudio }) {
  const s = studio;
  return (
    <div
      data-design-critique-panel
      className="absolute inset-x-0 bottom-0 z-10 max-h-[55%] overflow-y-auto border-t border-line bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.08)] dark:bg-[#1E1E21]"
    >
      <div className="flex items-center gap-2 px-3 pt-2">
        <Gauge className="h-3 w-3 text-terracotta" />
        <span className="text-[11px] font-medium">Critique — structural signals</span>
        <Button
          data-design-critique-rerun
          variant="ghost"
          size="sm"
          className="ml-auto h-6 gap-1 px-2 text-[11px]"
          onClick={() => void s.runCritique()}
          disabled={!s.selected || s.critiquing}
        >
          <RefreshCw className="h-3 w-3" /> {s.critiquing ? 'Scoring…' : 'Re-run'}
        </Button>
        <button
          data-design-panel-close
          className="rounded p-0.5 text-zinc-400 hover:bg-muted"
          aria-label="Close critique panel"
          onClick={() => s.toggleDrawer('critique')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="p-3 pt-2">
        {!s.detail?.critique ? (
          <p className="text-[11px] text-zinc-400">No critique yet — select an artifact and Re-run.</p>
        ) : (
          <div className="space-y-1">
            {s.detail.critique.scores.map((score) => (
              <div key={score.dim} className="flex items-start gap-2 text-[11px]">
                <span className="w-20 shrink-0 capitalize text-zinc-500">{score.dim}</span>
                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${TONE_CLASS[scoreTone(score.score)]}`}>
                  {score.score}/10
                </span>
                <span className="text-zinc-500">{score.fixes.length > 0 ? score.fixes.join(' ') : 'Holds the bar.'}</span>
              </div>
            ))}
            <p className="pt-1 text-[10px] text-zinc-400">
              Heuristic structural signals over the stored HTML — never an LLM grade.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * REQ-190 — the TWEAK + HISTORY drawer: the Figma-ish "edit what is on screen"
 * surface. A short change sentence becomes the NEXT version of THIS artifact
 * (same id, so the list never grows), and the ledger below it is the only way
 * back: every entry is selectable and every non-current entry is revertible.
 *
 * The pre-REQ-190 state is honest — "No history yet" instead of a fabricated
 * v1 — and a revert is refused client-side for the version currently shown, so
 * the button can never spend a write on a no-op.
 */
function VersionsDrawer({ studio }: { studio: DesignStudio }) {
  const s = studio;
  const options: SelectMenuOption[] = s.versions.map((v) => ({
    value: String(v.n),
    label: versionLabel(v, s.currentVersion),
  }));
  const pick = options.find((o) => o.value === String(s.currentVersion)) ?? options[options.length - 1];
  const picked = pick ? Number(pick.value) : 0;
  const isCurrent = picked === s.currentVersion;
  return (
    <div
      data-design-versions-panel
      className="absolute inset-x-0 bottom-0 z-10 max-h-[55%] overflow-y-auto border-t border-line bg-white shadow-[0_-8px_24px_rgba(0,0,0,0.08)] dark:bg-[#1E1E21]"
    >
      <div className="flex items-center gap-2 px-3 pt-2">
        <History className="h-3 w-3 text-terracotta" />
        <span className="text-[11px] font-medium">Tweak</span>
        <span className="hidden text-[10px] text-zinc-400 sm:inline">
          becomes the next version of this design — nothing else changes
        </span>
        <button
          data-design-panel-close
          className="ml-auto rounded p-0.5 text-zinc-400 hover:bg-muted"
          aria-label="Close versions panel"
          onClick={() => s.toggleDrawer('versions')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-2 p-3 pt-2">
        <TweakFieldStrip studio={s} />
        <textarea
          data-design-tweak-input
          value={s.tweakNote}
          onChange={(e) => s.setTweakNote(e.target.value)}
          rows={2}
          maxLength={DESIGN_TWEAK_NOTE_CAP}
          placeholder="Make the primary button terracotta"
          aria-label="Describe the change"
          className="w-full rounded-md border border-line bg-white p-2 text-[11px] leading-4 focus:border-terracotta/30 focus:outline-none dark:bg-[#0F0F11]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            data-design-tweak-run
            size="sm"
            className="h-7 gap-1 text-[11px]"
            onClick={() => void s.runTweak()}
            disabled={!s.selected || s.tweaking || !s.tweakNote.trim()}
          >
            <Sparkles className="h-3 w-3" /> {s.tweaking ? 'Tweaking…' : 'Tweak'}
          </Button>
          <span data-design-tweak-counter className="text-[10px] text-zinc-400">
            {s.tweakNote.length}/{DESIGN_TWEAK_NOTE_CAP}
          </span>
        </div>
        {s.tweakError ? (
          <p data-design-tweak-error className="text-[11px] text-rose-600">
            {s.tweakError}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
          <span className="text-[11px] font-medium">History</span>
          <span data-design-versions-count className="text-[10px] text-zinc-400">
            {s.versions.length > 0 ? `v${s.currentVersion} · ${s.versions.length} version(s)` : 'No history yet'}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {s.versions.length > 0 ? (
              <>
                <SelectMenu
                  ariaLabel="Select a version"
                  size="xs"
                  align="end"
                  value={pick?.value ?? ''}
                  onChange={(value) => {
                    const n = Number(value);
                    if (Number.isInteger(n) && n !== s.currentVersion) void s.runRevert(n);
                  }}
                  options={options}
                  triggerClassName="w-[190px]"
                  triggerAttrs={{ 'data-design-versions-picker': '' }}
                />
                <Button
                  data-design-revert
                  size="sm"
                  variant="secondary"
                  className="h-6 gap-1 px-2 text-[11px]"
                  disabled={isCurrent || s.reverting !== null}
                  onClick={() => void s.runRevert(picked)}
                >
                  <RotateCcw className="h-3 w-3" /> {s.reverting !== null ? 'Reverting…' : 'Go to version'}
                </Button>
              </>
            ) : null}
          </div>
        </div>
        {s.versionsError ? (
          <p data-design-versions-error className="text-[11px] text-rose-600">
            {s.versionsError}
          </p>
        ) : null}
        {s.versionsLoading ? <p className="text-[10px] text-zinc-400">Loading history…</p> : null}
        {s.versions.length > 0 ? (
          <ol data-design-versions-list className="space-y-0.5">
            {s.versions
              .slice()
              .reverse()
              .map((v) => (
                <li key={v.n} className="flex items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
                  <span className="w-9 shrink-0 font-medium text-zinc-600 dark:text-zinc-300">v{v.n}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {v.note || v.origin}
                    {v.model ? ` · ${v.model}` : ''}
                  </span>
                  <span className="shrink-0">{formatUpdated(v.createdAt)}</span>
                  {v.n === s.currentVersion ? (
                    <span className="shrink-0 rounded-full border border-line px-1 text-[9px]">current</span>
                  ) : null}
                </li>
              ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}

/**
 * REQ-190 §3 — the editable field surfaces, one control per field.
 *
 * The free-text tweak box below already exists; this row is the Figma-flavoured
 * shortcut over the SAME write path — a field pick does not generate an
 * artifact, it fills the tweak sentence and runs it, so there is exactly one
 * metered write route in the drawer (the DRY rule from REQ-188's parity work).
 *
 * Honesty rules that shaped this:
 *  - `fieldCurrentValue` returns `null` for palette/density/content because the
 *    manifest does not record them. The chip then reads "—" (not the first
 *    option), so the surface never claims a current value it does not know.
 *  - a pick equal to the current value produces no note at all, so the button
 *    stays disabled instead of burning a metered rewrite that changes nothing.
 *  - Model options come from the LIVE catalog; with no catalog loaded the
 *    model control is disabled rather than offering an empty picker.
 */
function TweakFieldStrip({ studio }: { studio: DesignStudio }) {
  const s = studio;
  const [open, setOpen] = React.useState<DesignTweakField | null>(null);
  const [content, setContent] = React.useState('');
  const systemIds = React.useMemo(
    () => s.systems.map((x) => ({ id: x.id, name: x.label })),
    [s.systems],
  );
  // REQ-190 §3 — the model field reads the SAME catalog the composer's model
  // picker reads (enabled models from the provider store), never a second copy
  // of a model list.
  const storeModels = useProviderStore((st) => st.models);
  const modelIds = React.useMemo(
    () => enabledModels(storeModels).map((m) => ({ id: m.id, name: m.label })),
    [storeModels],
  );

  const manifest = s.detail?.manifest ?? null;
  const busy = s.tweaking || !s.selected;

  const apply = (field: DesignTweakField, value: string) => {
    const note = buildFieldTweakNote(field, value, fieldCurrentValue(field, manifest));
    if (!note) return;
    s.setTweakNote(note);
    setOpen(null);
    setContent('');
    void s.runTweakNote(note);
  };

  return (
    <div data-design-field-strip className="border-b border-line pb-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <SlidersHorizontal className="h-3 w-3 text-terracotta" />
        <span className="text-[10px] text-zinc-400">Edit fields</span>
        {DESIGN_TWEAK_FIELDS.map((field) => {
          const control = fieldControl(field, field === 'system' ? systemIds : modelIds);
          const current = fieldCurrentValue(field, manifest);
          const selected = open === field;
          if (control.kind === 'text') {
            return (
              <button
                key={field}
                data-design-field-toggle="content"
                aria-expanded={selected}
                disabled={busy}
                onClick={() => setOpen(selected ? null : 'content')}
                className="rounded border border-line px-1.5 py-0.5 text-[10px] hover:bg-muted disabled:opacity-40"
              >
                {control.label}
              </button>
            );
          }
          const disabled = busy || control.options.length === 0;
          return (
            <button
              key={field}
              data-design-field-toggle={field}
              aria-expanded={selected}
              disabled={disabled}
              title={control.options.length === 0 ? `No ${control.label.toLowerCase()} options loaded` : undefined}
              onClick={() => setOpen(selected ? null : field)}
              className="rounded border border-line px-1.5 py-0.5 text-[10px] hover:bg-muted disabled:opacity-40"
            >
              {control.label}
              <span className="ml-1 text-zinc-400">
                {current === null ? '—' : current}
              </span>
            </button>
          );
        })}
      </div>
      {open === 'content' ? (
        <div className="mt-1.5 flex items-end gap-1.5">
          <textarea
            data-design-field-content
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={2}
            placeholder="Paste the new copy for this design"
            aria-label="Replacement copy"
            className="min-w-0 flex-1 rounded-md border border-line bg-white p-1.5 text-[11px] leading-4 focus:border-terracotta/30 focus:outline-none dark:bg-[#0F0F11]"
          />
          <Button
            data-design-field-apply="content"
            size="sm"
            className="h-7 shrink-0 text-[11px]"
            disabled={busy || !content.trim()}
            onClick={() => apply('content', content)}
          >
            Apply
          </Button>
        </div>
      ) : null}
      {open !== null && open !== 'content'
        ? (() => {
            const control = fieldControl(open, open === 'system' ? systemIds : modelIds);
            const current = fieldCurrentValue(open, manifest);
            const rows: SelectMenuOption[] = control.options.map((o) => ({ value: o.value, label: o.label }));
            return (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {rows
                  .filter((o) => o.value !== current)
                  .map((o) => (
                    <Button
                      key={o.value}
                      data-design-field-apply={o.value}
                      size="sm"
                      variant="secondary"
                      className="h-6 px-2 text-[10px]"
                      disabled={busy}
                      onClick={() => apply(open, o.value)}
                    >
                      {o.label}
                    </Button>
                  ))}
                {rows.every((o) => o.value === current) ? (
                  <span className="text-[10px] text-zinc-400">Nothing else to pick here yet</span>
                ) : null}
              </div>
            );
          })()
        : null}
    </div>
  );
}

export function DesignPage() {
  const s = useDesignStudio();
  const [menu, setMenu] = React.useState<{ x: number; y: number; items: ContextMenuEntry[]; label: string } | null>(
    null,
  );
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  // REQ-189 — Esc is the keyboard exit, and opening the panel moves focus into
  // it so a keyboard user lands on the list instead of the canvas.
  useArtifactsPanelEscape(s.artifactsPanel, s.toggleArtifactsPanel);
  React.useEffect(() => {
    if (s.artifactsPanel) panelRef.current?.focus();
  }, [s.artifactsPanel]);

  const openAnchoredMenu = React.useCallback(
    (e: React.MouseEvent<HTMLElement>, label: string, items: ContextMenuEntry[]) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setMenu({ x: rect.left, y: rect.bottom + 4, items, label });
    },
    [],
  );

  const openExportMenu = (e: React.MouseEvent<HTMLElement>) => {
    const rows: ContextMenuEntry[] = [
      { type: 'header', label: s.selected ? `Export ${s.selected}` : 'Export — no artifact selected' },
    ];
    for (const item of EXPORT_MENU) {
      rows.push({
        type: 'item',
        label: item.label,
        icon: Download,
        hint: s.exporting === item.format ? '…' : undefined,
        disabled: !s.selected || s.exporting !== null,
        onSelect: () => void s.runExport(item.format, item.scale),
      });
    }
    openAnchoredMenu(e, 'Export artifact', rows);
  };

  const openArtifactMenu = (e: React.MouseEvent<HTMLElement>) => {
    const armed = Boolean(s.selected) && s.confirmDelete === s.selected;
    openAnchoredMenu(e, 'Artifact actions', [
      { type: 'header', label: s.selected ? `Artifact ${s.selected}` : 'No artifact selected' },
      {
        type: 'item',
        label: 'Copy artifact id',
        icon: Copy,
        disabled: !s.selected,
        onSelect: () => {
          if (!s.selected) return;
          void navigator.clipboard?.writeText(s.selected);
          window.dispatchEvent(new CustomEvent('lokma-toast', { detail: 'Artifact id copied' }));
        },
      },
      { type: 'separator' },
      {
        type: 'item',
        label: armed ? 'Confirm delete' : 'Delete artifact',
        icon: Trash2,
        danger: true,
        hint: armed ? 'click again' : undefined,
        disabled: !s.selected || s.deleting,
        onSelect: () => void s.runDelete(),
      },
    ]);
  };

  const guardChip = s.guard
    ? s.guard.present
      ? s.guard.ok
        ? {
            text: `DESIGN.md · ${s.guard.h2Count} sections`,
            cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
          }
        : {
            text: `DESIGN.md · ${s.guard.h2Count}/7 H2`,
            cls: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
          }
      : { text: 'No .lokma/DESIGN.md — bundled tokens', cls: 'border-line bg-muted/40 text-zinc-500' }
    : null;

  return (
    <div
      data-design-page
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-[#FDFCFB] px-3 py-2 dark:bg-[#1E1E21]">
        <Paintbrush className="h-4 w-4 text-terracotta" />
        <span className="font-serif text-[15px]">Design Studio</span>
        <span
          data-design-project-chip
          title={s.projectCwd || 'Global — ~/.lokma/design/artifacts'}
          className="inline-flex items-center gap-1 rounded-full border border-line bg-muted/40 px-1.5 py-0.5 text-[10px] text-zinc-500"
        >
          <FolderKanban className="h-2.5 w-2.5" /> {projectLabel(s.projectCwd)}
        </span>
        {guardChip ? (
          <span
            data-design-guard
            title="DESIGN.md guard status"
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${guardChip.cls}`}
          >
            <Palette className="h-2.5 w-2.5" /> {guardChip.text}
          </span>
        ) : null}
        <span className="hidden text-[11px] text-zinc-400 sm:inline">
          {s.items.length} artifacts · {s.systems.length}{' '}
          {s.systemsSource === 'catalog' ? 'installed systems' : 'preset systems'}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {s.detail?.critique ? (
            <span
              data-design-score
              className={`rounded-full border px-1.5 py-0.5 text-[10px] ${TONE_CLASS[scoreTone(s.detail.critique.overall)]}`}
            >
              {s.detail.critique.overall}/10
            </span>
          ) : null}
          <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px] text-zinc-500">BYOK</span>
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <DesignChat studio={s} />
        {/* REQ-189 — the canvas and the Artifacts panel are siblings now: the
            panel is a closable right column, so closing it hands its width back
            to the canvas instead of leaving a gap. `min-w-0` on the canvas is
            what keeps the row from overflowing at 1500px (REQ-157 trap). */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
          <section data-design-canvas className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div
            data-design-toolbar
            className="flex h-9 shrink-0 items-center gap-1.5 border-b border-line bg-[#FDFCFB] px-2 text-[11px] dark:bg-[#1E1E21]"
          >
            <LayoutTemplate className="h-3 w-3 shrink-0 text-zinc-400" />
            <span className="min-w-0 truncate text-zinc-500">
              {s.sel ? `${s.sel.type} · ${s.sel.system} · ${formatUpdated(s.sel.updatedAt)}` : 'No artifact selected'}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-1">
              <Button
                data-design-artifacts-toggle
                variant={s.artifactsPanel ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 gap-1 px-2 text-[11px]"
                aria-expanded={s.artifactsPanel}
                aria-controls="lokma-design-artifacts-panel"
                aria-label="Toggle artifacts panel"
                onClick={() => s.toggleArtifactsPanel()}
              >
                <LayoutTemplate className="h-3 w-3" />
                Artifacts
                <span
                  data-design-artifacts-badge
                  className="rounded-full border border-line px-1 text-[10px] text-zinc-500 dark:text-zinc-400"
                >
                  {s.items.length}
                </span>
              </Button>
              <Button
                data-design-versions-toggle
                variant={s.drawer === 'versions' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 gap-1 px-2 text-[11px]"
                disabled={!s.selected}
                onClick={() => s.toggleDrawer('versions')}
              >
                <History className="h-3 w-3" />
                Versions
                <span
                  data-design-versions-badge
                  className="rounded-full border border-line px-1 text-[10px] text-zinc-500 dark:text-zinc-400"
                >
                  {s.versions.length}
                </span>
              </Button>
              <Button
                data-design-code-toggle
                variant={s.drawer === 'code' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 gap-1 px-2 text-[11px]"
                disabled={!s.selected}
                onClick={() => s.toggleDrawer('code')}
              >
                <Code2 className="h-3 w-3" /> Code
              </Button>
              <Button
                data-design-critique-toggle
                variant={s.drawer === 'critique' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 gap-1 px-2 text-[11px]"
                disabled={!s.selected}
                onClick={() => s.toggleDrawer('critique')}
              >
                <Gauge className="h-3 w-3" /> Critique
              </Button>
              <Button
                data-design-export-toggle
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-[11px]"
                disabled={!s.selected}
                onClick={openExportMenu}
              >
                <Download className="h-3 w-3" /> Export
              </Button>
              <Button
                data-design-menu-toggle
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                aria-label="Artifact actions"
                onClick={openArtifactMenu}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </span>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden bg-white dark:bg-[#0F0F11]">
            <div data-design-viewer className="absolute inset-0 overflow-hidden">
              {s.viewerSrc ? (
                <iframe
                  key={s.viewerSrc + (s.detail?.manifest.updatedAt ?? '')}
                  data-design-viewer-frame
                  src={s.viewerSrc}
                  sandbox="allow-scripts allow-same-origin"
                  className="h-full w-full border-0 bg-white"
                  title="Design preview"
                />
              ) : (
                <div data-design-empty className="grid h-full place-items-center overflow-y-auto px-6 py-8">
                  <div className="w-full max-w-md text-center">
                    <Sparkles className="mx-auto h-5 w-5 text-terracotta" />
                    {s.detailLoading ? (
                      <p className="mt-2 font-serif text-[15px] text-ink dark:text-white">Loading…</p>
                    ) : s.detailError ? (
                      <p className="mt-2 text-[12px] leading-5 text-rose-600 dark:text-rose-300">{s.detailError}</p>
                    ) : (
                      <>
                        <p className="mt-2 font-serif text-[16px] text-ink dark:text-white">Start with a brief</p>
                        <p className="mx-auto mt-1 max-w-[42ch] text-[12px] leading-5 text-zinc-500 dark:text-zinc-400">
                          Write it on the left, then press{' '}
                          <span className="font-medium text-terracotta">Generate</span>. Or pick a sample — it fills
                          the brief for you:
                        </p>
                        <div data-design-samples className="mt-4 flex flex-wrap justify-center gap-1.5">
                          {DESIGN_SAMPLES.map((sample) => (
                            <button
                              key={sample.id}
                              type="button"
                              data-design-sample={sample.id}
                              title={sample.brief}
                              onClick={() => s.applySample(sample)}
                              className="rounded-full border border-line bg-white px-2.5 py-1 text-[11px] text-zinc-600 transition-colors hover:border-terracotta/50 hover:bg-[#F7F5F1] hover:text-ink dark:bg-[#1E1E21] dark:text-zinc-300 dark:hover:bg-[#242427] dark:hover:text-white"
                            >
                              {sample.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
            {s.drawer === 'code' ? <CodeDrawer studio={s} /> : null}
            {s.drawer === 'critique' ? <CritiqueDrawer studio={s} /> : null}
            {s.drawer === 'versions' ? <VersionsDrawer studio={s} /> : null}
          </div>
          </section>
          {s.artifactsPanel ? <DesignArtboards studio={s} panelRef={panelRef} /> : null}
        </div>
      </div>
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} label={menu.label} items={menu.items} onClose={() => setMenu(null)} />
      ) : null}
    </div>
  );
}
