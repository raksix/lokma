/**
 * Design TEMPLATE catalog (REQ-192 slice 3) — the THIRD axis, deliberately
 * separate from the system catalog (`systems.ts`) and the skill catalog
 * (`skills.ts`).
 *
 * The three are not the same thing and merging them is what made "make it a
 * pitch deck" impossible to express:
 *   - a design SYSTEM is a palette + type scale (what it looks like),
 *   - a design SKILL is a SKILL.md instruction set (how it is built),
 *   - a design TEMPLATE is the OUTPUT SKELETON (which document shape ships).
 *
 * OpenDesign's model is the reference: `skills/` and `design-templates/` are
 * separate roots with separate registry endpoints (`/api/skills` vs
 * `/api/design-templates`) even though both files are `SKILL.md`. See
 * `Docs/raw/38-opendesign-ham-arastirma.md` §3.3/§3.4.
 *
 * Contract:
 * - Rows are born from a REAL directory scan (`design-templates/` in the repo
 *   plus `~/.lokma/design/templates` for machine-local ones), exactly like the
 *   skill catalog scans the real registry. There is no frozen const table: a
 *   picker fed by a hardcoded array is a catalog that cannot grow.
 * - Each template dir carries `template.json` (the entry point) and, when it
 *   ships one, a `SKILL.md` body. A missing body is reported as
 *   `hasBody: false` with a reason, never hidden and never faked.
 * - `template` is a SINGLE choice, unlike the multi-select skills: a document
 *   has one skeleton, and composing two of them is not a user intent the
 *   harness can honour honestly.
 * - Ids come from the directory name (the jail), never from the request.
 */

import { execFile } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expandHome } from '../utils/fs.js';
import { DesignError, type DesignType } from './types.js';
import { assertInstallSource, systemIdFromSource, SYSTEM_ID_PATTERN } from './systems.js';

const execFileAsync = promisify(execFile);

/** Installed, machine-local template root (mirrors `~/.lokma/design/systems`). */
export const DESIGN_TEMPLATES_DIR = '~/.lokma/design/templates';
/** Repo-shipped template root — the same split OpenDesign uses. */
export const DESIGN_TEMPLATES_BUNDLED_DIR = 'design-templates';

/**
 * How far up from this module the repo root may sit. `src/design/` and
 * `dist/design/` both live four levels under the package root, so five is a
 * generous bound that still cannot escape into a parent user's project.
 */
const BUNDLED_ROOT_WALK_LEVELS = 5;

/**
 * Candidate roots for the repo-shipped `design-templates/`, module-relative
 * FIRST (walking up from THIS file) and cwd-relative as the last fallback
 * (a plain checkout run from its own root). Ordered and de-duplicated.
 *
 * It MUST NOT be cwd-only: the server happens to run from the repo root today,
 * but `lokma design template list` run from `~` would then silently report an
 * EMPTY catalog — the exact "picker fed by a table that is not there" failure
 * this catalog exists to avoid. The unit probe caught it (it runs from
 * `packages/lokma-core`, so a cwd-relative path finds nothing there).
 */
function bundledRootCandidates(): string[] {
  const out: string[] = [];
  const push = (p: string) => {
    if (!out.includes(p)) out.push(p);
  };
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i <= BUNDLED_ROOT_WALK_LEVELS; i += 1) {
    push(join(dir, DESIGN_TEMPLATES_BUNDLED_DIR));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  push(join(process.cwd(), DESIGN_TEMPLATES_BUNDLED_DIR));
  return out;
}

/** Dirs that actually exist, in priority order. One stat each, per call. */
async function existingBundledRoots(): Promise<string[]> {
  const out: string[] = [];
  for (const dir of bundledRootCandidates()) {
    try {
      const st = await stat(dir);
      if (st.isDirectory()) out.push(dir);
    } catch {
      // absent — next candidate
    }
  }
  return out;
}

/** One `template.json`, all fields optional except `id`. */
export type TemplateManifest = {
  id?: unknown;
  label?: unknown;
  description?: unknown;
  /** Which artifact kind the skeleton is written for. */
  mode?: unknown;
  /** Free-form lowercase filter slug (OD's `category`). */
  category?: unknown;
  /** OD's `example_prompt` — the one-line brief this template suits. */
  example_prompt?: unknown;
};

/** Result of parsing a manifest: a row, or the reason it is unusable. */
export type TemplateParseResult =
  | { ok: true; id: string; label: string; description: string; mode: DesignType; category: string; examplePrompt: string }
  | { ok: false; reason: string };

/** One picker row. `hasBody` is honest about whether content can be read. */
export type DesignTemplateRow = {
  id: string;
  label: string;
  description: string;
  /** Which artifact type the skeleton targets. */
  mode: DesignType;
  category: string;
  examplePrompt: string;
  /** SKILL.md bytes — the size a user sees before selecting. */
  bytes: number;
  /** False when SKILL.md is missing/unreadable/oversized: selectable, but empty. */
  hasBody: boolean;
  /** `bundled` ships with the repo, `installed` lives under `~/.lokma`. */
  origin: 'bundled' | 'installed';
  /** Why `hasBody` is false, in one honest sentence. */
  problem?: string;
};

/** A template carried INTO a generation: id + the actual skeleton body. */
export type DesignTemplatePayload = {
  id: string;
  label: string;
  mode: DesignType;
  content: string;
};

/** Max templates listed by the picker (rows, not a virtual list). */
export const DESIGN_TEMPLATE_LIST_CAP = 200;
/** Max `template.json` bytes — it is metadata, never the body. */
export const TEMPLATE_MANIFEST_CAP = 64 * 1024;
/** Max SKILL.md bytes per template — the shared skill cap, one constant. */
export const TEMPLATE_BODY_CAP = 256 * 1024;
/** Accepted template id length — the directory pattern already bounds it. */
const TEMPLATE_ID_CAP = 64;
/**
 * git clone timeout. Deliberately the same 60s budget as the system catalog's
 * install: an install that hangs is worse than one that fails, and a template
 * is the same size of repo as a system package.
 */
const CLONE_TIMEOUT_MS = 60_000;

const TYPE_SET: readonly DesignType[] = [
  'prototype',
  'deck',
  'mobile',
  'image',
  'document',
  'hyperframe',
];

/** Absolute install root on this machine. */
export function templatesRoot(): string {
  return expandHome(DESIGN_TEMPLATES_DIR);
}

/**
 * Resolve the install root. `rootOverride` exists for the unit probe, which
 * must never write the real `~/.lokma/design/templates` — `os.homedir()` is
 * CACHED by the runtime, so overriding `process.env.HOME` inside a test is
 * NOT enough (same reason `systems.ts` injects instead of pretending).
 */
function rootOf(rootOverride?: string): string {
  return rootOverride ? resolvePath(rootOverride) : templatesRoot();
}

/**
 * REQ-192 — pure: coerce a generate request's `template` field into at most
 * one template id. A list of one is accepted (the picker may send an array);
 * a list of many is a 400, because one artifact has ONE skeleton and picking
 * two is not something the generation path can honour honestly.
 */
export function parseTemplateSelection(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const items = Array.isArray(raw) ? raw : [raw];
  if (items.length > 1) {
    throw new DesignError(
      'too_many_templates',
      'Pick at most one template — a template is the output skeleton, not a style',
      400,
    );
  }
  const first = items[0];
  if (typeof first !== 'string' || !first.trim()) {
    throw new DesignError('bad_template', '`template` must be a template id', 400);
  }
  const id = first.trim();
  if (id.length > TEMPLATE_ID_CAP) {
    throw new DesignError('bad_template', 'template id is too long', 400);
  }
  if (!SYSTEM_ID_PATTERN.test(id)) {
    throw new DesignError(
      'bad_template',
      'template id must be lowercase letters, digits, dot, dash or underscore',
      400,
    );
  }
  return id;
}

/** Map a free-text `mode:` onto a real artifact kind; unknown becomes `prototype`. */
export function normalizeTemplateMode(raw: unknown): DesignType {
  const text = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  for (const t of TYPE_SET) {
    if (t === text) return t;
  }
  if (text === 'slide' || text === 'slides' || text === 'presentation') return 'deck';
  if (text === 'app' || text === 'phone' || text === 'screen') return 'mobile';
  if (text === 'doc' || text === 'page' || text === 'landing') return 'prototype';
  return 'prototype';
}

/** REQ-192 — pure: parse `template.json`. Anything malformed is refused loudly. */
export function parseTemplateManifest(raw: unknown): TemplateParseResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, reason: 'template.json must be a JSON object' };
  }
  const m = raw as TemplateManifest;
  const id = typeof m.id === 'string' ? m.id.trim() : '';
  if (!id) return { ok: false, reason: 'template.json has no id' };
  if (!SYSTEM_ID_PATTERN.test(id)) {
    return { ok: false, reason: 'id must be lowercase letters, digits, dot, dash or underscore' };
  }
  const label = typeof m.label === 'string' && m.label.trim() ? m.label.trim() : id;
  const description = typeof m.description === 'string' ? m.description.trim() : '';
  const category = typeof m.category === 'string' && m.category.trim() ? m.category.trim().toLowerCase() : '';
  const examplePrompt =
    typeof m.example_prompt === 'string' ? m.example_prompt.trim() : '';
  return { ok: true, id, label, description, mode: normalizeTemplateMode(m.mode), category, examplePrompt };
}

/** Body size + readability; a missing file reports 0, never a fake size. */
async function bodyBytes(path: string): Promise<{ bytes: number; readable: boolean }> {
  try {
    const st = await stat(path);
    return { bytes: st.size, readable: st.isFile() && st.size <= TEMPLATE_BODY_CAP };
  } catch {
    return { bytes: 0, readable: false };
  }
}

/**
 * Read one template dir. A missing `template.json` means it is not a template
 * at all (skipped silently, like `readPackage` in systems.ts); one that reads
 * but is invalid is listed with `hasBody: false` and an honest reason so the
 * user can fix their own directory.
 */
async function readTemplateDir(
  dir: string,
  id: string,
  origin: 'bundled' | 'installed',
): Promise<DesignTemplateRow | null> {
  const manifestPath = join(dir, 'template.json');
  let raw: string;
  try {
    const st = await stat(manifestPath);
    if (!st.isFile()) return null;
    if (st.size > TEMPLATE_MANIFEST_CAP) {
      return invalidRow(id, origin, `template.json too large (>${TEMPLATE_MANIFEST_CAP} bytes)`);
    }
    raw = await readFile(manifestPath, 'utf-8');
  } catch {
    return null;
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return invalidRow(id, origin, 'template.json is not valid JSON');
  }
  const parsed = parseTemplateManifest(parsedJson);
  if (!parsed.ok) return invalidRow(id, origin, parsed.reason);
  const bodyPath = join(dir, 'SKILL.md');
  const { bytes, readable } = await bodyBytes(bodyPath);
  return {
    id: parsed.id,
    label: parsed.label,
    description: parsed.description,
    mode: parsed.mode,
    category: parsed.category,
    examplePrompt: parsed.examplePrompt,
    bytes,
    hasBody: readable,
    origin,
    ...(readable ? {} : { problem: 'SKILL.md is missing, unreadable or over the 256KB cap' }),
  };
}

/** One shared constructor so invalid rows carry the same shape as valid ones. */
function invalidRow(id: string, origin: 'bundled' | 'installed', reason: string): DesignTemplateRow {
  return {
    id,
    label: id,
    description: '',
    mode: 'prototype',
    category: '',
    examplePrompt: '',
    bytes: 0,
    hasBody: false,
    origin,
    problem: reason,
  };
}

/**
 * REQ-192 — the catalog behind `GET /api/design/templates`. Two roots: the
 * repo-shipped `design-templates/` and the machine's
 * `~/.lokma/design/templates`. An installed row with the same id WINS over the
 * bundled one (the user overrode the default) — and the dedupe is by id, so
 * the two roots can never present the same template twice.
 */
export async function listDesignTemplates(rootOverride?: string): Promise<{
  templates: DesignTemplateRow[];
  count: number;
  root: string;
  origins: readonly ('bundled' | 'installed')[];
  /** How many template dirs were listed but unusable. */
  invalid: number;
}> {
  const root = rootOf(rootOverride);
  const installed = [{ dir: root, origin: 'installed' as const }];
  const bundled = (await existingBundledRoots()).map((dir) => ({ dir, origin: 'bundled' as const }));
  const rows: DesignTemplateRow[] = [];
  const seen = new Set<string>();
  // Installed first so its ids claim the map; bundled fills the gaps.
  for (const entry of [...installed, ...bundled]) {
    let names: string[] = [];
    try {
      names = await readdir(entry.dir);
    } catch {
      names = [];
    }
    for (const name of names.sort()) {
      if (rows.length >= DESIGN_TEMPLATE_LIST_CAP) break;
      if (name.startsWith('.') || !SYSTEM_ID_PATTERN.test(name)) continue;
      if (seen.has(name)) continue;
      const row = await readTemplateDir(join(entry.dir, name), name, entry.origin);
      if (!row) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }
  rows.sort((a, b) => a.mode.localeCompare(b.mode) || a.label.localeCompare(b.label));
  return {
    templates: rows,
    count: rows.length,
    root,
    origins: ['bundled', 'installed'],
    invalid: rows.filter((r) => !r.hasBody).length,
  };
}

/**
 * REQ-192 — the load-bearing half: turn a chosen id into the skeleton body the
 * design prompt carries. An id that is not installed is a 404
 * (`template_not_found`) and one whose SKILL.md cannot be read is a 409
 * (`template_unusable`) — never a silent drop that would let the UI claim a
 * template shaped the artifact when nothing reached the model.
 */
export async function resolveDesignTemplate(
  id: string,
  rootOverride?: string,
): Promise<DesignTemplatePayload> {
  const root = rootOf(rootOverride);
  // Same precedence as the catalog: installed shadows bundled.
  const searchRoots = [
    { dir: root, origin: 'installed' as const },
    ...(await existingBundledRoots()).map((dir) => ({ dir, origin: 'bundled' as const })),
  ];
  for (const entry of searchRoots) {
    const row = await readTemplateDir(join(entry.dir, id), id, entry.origin);
    if (!row) continue;
    if (!row.hasBody) {
      throw new DesignError('template_unusable', `Template '${id}' has no readable SKILL.md`, 409);
    }
    let content: string;
    try {
      content = await readFile(join(entry.dir, id, 'SKILL.md'), 'utf-8');
    } catch {
      throw new DesignError('template_unusable', `Template '${id}' cannot be read`, 409);
    }
    if (content.length > TEMPLATE_BODY_CAP) {
      throw new DesignError(
        'template_unusable',
        `Template '${id}' exceeds the ${Math.round(TEMPLATE_BODY_CAP / 1024)}KB cap`,
        409,
      );
    }
    return { id: row.id, label: row.label, mode: row.mode, content };
  }
  throw new DesignError('template_not_found', `No design template '${id}' is installed`, 404);
}

/**
 * REQ-192 slice 4 — install a template into `~/.lokma/design/templates/<id>/`.
 *
 * A local path is copied, an https URL is cloned shallowly. The package must
 * carry a parseable `template.json` AND a readable `SKILL.md`, or the install
 * ROLLS BACK: an unusable directory would list forever as a row whose body
 * cannot reach the model, and the picker would then claim a template shaped an
 * artifact that nothing was shaped by. An existing id is a 409, exactly like
 * the system catalog — installed shadows bundled on purpose.
 *
 * The source guard and the id jail are REUSED (`assertInstallSource` +
 * `systemIdFromSource`), never a second copy: a drifted SSRF predicate or a
 * looser id regex here would be a new hole in the same feature.
 */
export async function installDesignTemplate(
  rawSource: unknown,
  rootOverride?: string,
): Promise<{ id: string; mode: DesignType; label: string; files: string[]; source: string }> {
  const src = assertInstallSource(rawSource);
  const id = systemIdFromSource(
    src.kind === 'url' ? new URL(src.url).pathname.replace(/\/+$/, '') : src.path,
  );
  const root = rootOf(rootOverride);
  const target = join(root, id);
  try {
    const st = await stat(target);
    if (st) throw new DesignError('template_exists', `Design template '${id}' is already installed`, 409);
  } catch (e) {
    if (e instanceof DesignError) throw e;
    // Missing path — the install proceeds.
  }
  await mkdir(root, { recursive: true });
  if (src.kind === 'path') {
    let st;
    try {
      st = await stat(src.path);
    } catch {
      throw new DesignError('source_not_found', `No such template directory: ${src.path}`, 404);
    }
    if (!st.isDirectory()) {
      throw new DesignError('bad_source', `Source is not a directory: ${src.path}`, 400);
    }
    try {
      await cp(src.path, target, { recursive: true, force: false });
    } catch (e) {
      await rm(target, { recursive: true, force: true });
      throw new DesignError('copy_failed', `Could not copy the template: ${(e as Error).message}`, 400);
    }
  } else {
    try {
      await execFileAsync('git', ['clone', '--depth', '1', src.url, target], {
        timeout: CLONE_TIMEOUT_MS,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
    } catch (e) {
      await rm(target, { recursive: true, force: true });
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') {
        throw new DesignError('git_missing', 'git is not installed on the server', 500);
      }
      throw new DesignError('clone_failed', `git clone failed (${typeof code === 'string' ? code : 'exit'}) — is the source a public repo?`, 400);
    }
  }
  const row = await readTemplateDir(target, id, 'installed');
  if (!row) {
    await rm(target, { recursive: true, force: true });
    throw new DesignError('no_manifest', 'The package has no template.json (not found)', 400);
  }
  if (!row.hasBody) {
    await rm(target, { recursive: true, force: true });
    throw new DesignError('no_manifest', `The package has no usable SKILL.md (${row.problem ?? 'unreadable'})`, 400);
  }
  return {
    id: row.id,
    mode: row.mode,
    label: row.label,
    files: ['template.json', 'SKILL.md'],
    source: typeof rawSource === 'string' ? rawSource : '',
  };
}
