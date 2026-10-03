/**
 * Design SKILL catalog (REQ-192) — the second, deliberately separate axis
 * beside the design-system catalog in `systems.ts`.
 *
 * Why a second catalog: a design SYSTEM is a palette + type scale (what the
 * artifact looks like), a design SKILL is a `SKILL.md` instruction set (how
 * the artifact is built), and a TEMPLATE is the output skeleton. Conflating
 * them is what makes "make it feel like Stripe" impossible today — the user
 * has to type the style into the brief by hand.
 *
 * Contract:
 * - Rows come from the REAL skill registry (`scan()` over `skills/` and
 *   `~/.lokma/skills`), filtered to `scope: design`. A scopeless skill is
 *   never listed: the picker must not offer something the generation path
 *   cannot honour, and the honest answer is "install it with `scope: design`".
 * - `resolveDesignSkills()` returns the SELECTED SKILL.md BODIES, not their
 *   names. A skill named in the prompt teaches the model nothing; the
 *   instructions themselves are what lands in the design prompt.
 * - Everything is capped and jailed: the ids come from the registry (never a
 *   caller-supplied path), each body passes the shared 256KB `SKILL_FILE_CAP`.
 */

import { readFile, stat } from 'node:fs/promises';
import { SKILL_FILE_CAP, scan } from '../skills/registry.js';
import { DesignError } from './types.js';

/** The scope a skill must declare to appear in the Design Studio picker. */
export const DESIGN_SKILL_SCOPE = 'design';

/** Max skills listed by the picker (rows, not a virtual list). */
export const DESIGN_SKILL_LIST_CAP = 200;
/** Max skills one generation may carry into its prompt. */
export const DESIGN_SKILL_SELECT_CAP = 8;
/** Accepted id/name length — an id is short by construction, this bounds junk. */
const SKILL_ID_CAP = 200;

/** Picker groups, in display order. Unknown frontmatter groups land on `Other`. */
export const DESIGN_SKILL_GROUPS = [
  'Style',
  'Layout',
  'Accessibility',
  'Component',
  'Content',
  'Brand',
  'Other',
] as const;
export type DesignSkillGroup = (typeof DESIGN_SKILL_GROUPS)[number];

/** One picker row. `hasBody` is honest about whether content can be read. */
export type DesignSkillRow = {
  id: string;
  name: string;
  description: string;
  group: DesignSkillGroup;
  category: string;
  /** SKILL.md bytes — the size a user sees before selecting. */
  bytes: number;
  linkedFiles: string[];
  /** False when SKILL.md is missing/unreadable/oversized: selectable, but useless. */
  hasBody: boolean;
  /** Why `hasBody` is false, in one honest sentence. */
  problem?: string;
};

/** A skill carried INTO a generation: id + the actual instruction body. */
export type DesignSkillPayload = {
  id: string;
  name: string;
  content: string;
};

/** Map a free-text frontmatter `group:` onto the taxonomy. */
export function normalizeSkillGroup(raw: unknown): DesignSkillGroup {
  const text = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!text) return 'Other';
  for (const g of DESIGN_SKILL_GROUPS) {
    if (g.toLowerCase() === text) return g;
  }
  const flat = text.replace(/[_\-/]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const g of DESIGN_SKILL_GROUPS) {
    if (g.toLowerCase() === flat) return g;
  }
  if (/^a11y|access/.test(flat)) return 'Accessibility';
  if (/^brand|identity|voice/.test(flat)) return 'Brand';
  if (/^typ|color|colour|palette|style|motion/.test(flat)) return 'Style';
  if (/^layout|grid|space|spacing|responsive/.test(flat)) return 'Layout';
  if (/^comp|widget|control/.test(flat)) return 'Component';
  if (/^copy|content|writing|micro/.test(flat)) return 'Content';
  return 'Other';
}

/**
 * REQ-192 — pure: coerce a generate request's `skills` field into clean
 * skill ids. Accepts a list of ids/names; rejects anything else with an
 * honest 400 rather than silently dropping it (a silently-ignored selection
 * is exactly the "my skill was ignored" bug this REQ exists to kill).
 */
export function parseSkillSelection(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new DesignError('bad_skills', '`skills` must be an array of skill ids', 400);
  }
  if (raw.length > DESIGN_SKILL_SELECT_CAP) {
    throw new DesignError(
      'too_many_skills',
      `Pick at most ${DESIGN_SKILL_SELECT_CAP} skills (got ${raw.length})`,
      400,
    );
  }
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !item.trim()) {
      throw new DesignError('bad_skills', '`skills` entries must be non-empty skill ids', 400);
    }
    const id = item.trim();
    if (id.length > SKILL_ID_CAP) {
      throw new DesignError('bad_skills', 'skill id is too long', 400);
    }
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

/** Body size for the picker row; a missing file reports 0, never a fake size. */
async function bodyBytes(path: string): Promise<{ bytes: number; readable: boolean }> {
  try {
    const st = await stat(path);
    return { bytes: st.size, readable: st.isFile() && st.size <= SKILL_FILE_CAP };
  } catch {
    return { bytes: 0, readable: false };
  }
}

/**
 * REQ-192 — the catalog behind `GET /api/design/skills`. Scoped-only, grouped,
 * sorted by group order then name. Scans are injected so the unit probe never
 * reads the real `skills/` tree.
 */
export async function listDesignSkills(
  scanOverride?: () => Promise<Awaited<ReturnType<typeof scan>>>,
): Promise<{
  skills: DesignSkillRow[];
  count: number;
  scope: string;
  groups: readonly DesignSkillGroup[];
  /** How many scanned skills were excluded for lacking `scope: design`. */
  unscoped: number;
  /** How many scanned skills declared `scope: design` but are broken. */
  invalid: number;
}> {
  const skills = await (scanOverride ?? (() => scan({ dirs: ['skills', '~/.lokma/skills'] })))();
  const rows: DesignSkillRow[] = [];
  let unscoped = 0;
  for (const s of skills) {
    if ((s.scope ?? '').toLowerCase() !== DESIGN_SKILL_SCOPE) {
      unscoped += 1;
      continue;
    }
    if (rows.length >= DESIGN_SKILL_LIST_CAP) break;
    const { bytes, readable } = await bodyBytes(s.path);
    rows.push({
      id: s.id,
      name: s.name,
      description: s.description,
      group: normalizeSkillGroup(s.group),
      category: s.category,
      bytes,
      linkedFiles: s.linked_files,
      hasBody: readable,
      ...(readable ? {} : { problem: 'SKILL.md is missing, unreadable or over the 256KB cap' }),
    });
  }
  const order = new Map(DESIGN_SKILL_GROUPS.map((g, i) => [g, i]));
  rows.sort((a, b) => {
    const d = (order.get(a.group) ?? 99) - (order.get(b.group) ?? 99);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
  return {
    skills: rows,
    count: rows.length,
    scope: DESIGN_SKILL_SCOPE,
    groups: DESIGN_SKILL_GROUPS,
    unscoped,
    invalid: rows.filter((r) => !r.hasBody).length,
  };
}

/**
 * REQ-192 — the load-bearing half: turn selected ids into the SKILL.md
 * BODIES the design prompt actually carries. An id that is not a scoped,
 * installed skill is a 404 (`skill_not_found`), and a scoped-but-broken one
 * is a 409 (`skill_unusable`) — never a silent drop that would let the UI
 * claim a skill was applied when nothing reached the model.
 */
export async function resolveDesignSkills(
  ids: string[],
  scanOverride?: () => Promise<Awaited<ReturnType<typeof scan>>>,
): Promise<DesignSkillPayload[]> {
  if (ids.length === 0) return [];
  const skills = await (scanOverride ?? (() => scan({ dirs: ['skills', '~/.lokma/skills'] })))();
  const out: DesignSkillPayload[] = [];
  for (const id of ids) {
    const hit = skills.find((s) => s.id === id || s.name === id);
    if (!hit) {
      throw new DesignError('skill_not_found', `No skill '${id}' is installed on this machine`, 404);
    }
    if ((hit.scope ?? '').toLowerCase() !== DESIGN_SKILL_SCOPE) {
      throw new DesignError(
        'skill_not_design',
        `Skill '${id}' has no \`scope: design\` — it cannot be used in the Design Studio`,
        400,
      );
    }
    let content: string;
    try {
      content = await readFile(hit.path, 'utf-8');
    } catch {
      throw new DesignError('skill_unusable', `SKILL.md for '${id}' cannot be read`, 409);
    }
    if (content.length > SKILL_FILE_CAP) {
      throw new DesignError('skill_unusable', `SKILL.md for '${id}' exceeds the 256KB cap`, 409);
    }
    out.push({ id: hit.id, name: hit.name, content });
  }
  return out;
}