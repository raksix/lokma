import type { ComposerSlash } from '@/components/chat/composer-input';
import {
  DESIGN_SAMPLES,
  DESIGN_SYSTEMS,
  DESIGN_TYPES,
  type DesignSample,
  type GenerateForm,
} from './design';

/**
 * REQ-188 — Design slash commands, expressed as data so the shared
 * `ComposerInput` palette can render them and ONE `onSlash` handler applies
 * them. Each command performs a real edit of the brief form; none is a stub.
 *
 * `/new` clears the draft, `/type` + `/system` set the two style axes,
 * `/sample` parks one of the canvas empty-state example briefs.
 */
export type DesignSlash = ComposerSlash;

/** `/system` + `/type` accept a name or a 1-based index (`/type 2` = deck). */
function pickByNameOrIndex(raw: string, values: readonly string[]): string | null {
  const q = raw.trim().toLowerCase();
  if (!q) return null;
  const byName = values.find((v) => v.toLowerCase() === q);
  if (byName) return byName;
  const n = Number.parseInt(q, 10);
  if (Number.isFinite(n) && n >= 1 && n <= values.length) return values[n - 1] ?? null;
  return null;
}

export const DESIGN_SLASH_COMMANDS: DesignSlash[] = [
  { id: 'new', name: '/new', hint: 'Clear the brief', usage: '/new' },
  { id: 'sample', name: '/sample', hint: 'Park an example brief', usage: '/sample' },
  { id: 'type', name: '/type', hint: 'Set the artifact type (prototype, deck, mobile, image, document, hyperframe)', usage: '/type <name|n>' },
  { id: 'system', name: '/system', hint: 'Set the design system (stripe-linear, omp-dark, paper-ink, minimal-geo)', usage: '/system <name|n>' },
];

/** What a Design slash command did — the caller reports it honestly. */
export type DesignSlashResult = { message: string } | { error: string };

/**
 * Apply one Design slash command to the form. Returns a short narration so
 * the surface can show what happened; `setForm` stays updater-shaped so a
 * chip/slash fill never clobbers a concurrent edit.
 */
export function applyDesignSlash(
  id: string,
  args: string,
  form: GenerateForm,
  setForm: (updater: (f: GenerateForm) => GenerateForm) => void,
  applySample?: (sample: DesignSample) => void,
): DesignSlashResult {
  if (id === 'new') {
    setForm((f) => ({ ...f, brief: '' }));
    return { message: 'Brief cleared' };
  }
  if (id === 'sample') {
    const sample = DESIGN_SAMPLES[0];
    if (!sample) return { error: 'No sample briefs available' };
    if (applySample) applySample(sample);
    else setForm((f) => ({ ...f, brief: sample.brief, type: sample.type }));
    return { message: 'Filled "' + sample.label + '"' };
  }
  if (id === 'type') {
    const next = pickByNameOrIndex(args, DESIGN_TYPES);
    if (!next) return { error: 'Unknown type — try: ' + DESIGN_TYPES.join(', ') };
    setForm((f) => ({ ...f, type: next }));
    return { message: 'Type set to ' + next };
  }
  if (id === 'system') {
    const next = pickByNameOrIndex(args, DESIGN_SYSTEMS);
    if (!next) return { error: 'Unknown system — try: ' + DESIGN_SYSTEMS.join(', ') };
    setForm((f) => ({ ...f, system: next }));
    return { message: 'System set to ' + next };
  }
  return { error: 'Unknown command /' + id };
}