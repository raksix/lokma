import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { expandHome } from '../utils/fs.js';
import type { Skill } from 'lokma-shared';

/**
 * Skills registry — scans SKILL.md files, caches snapshot by mtime.
 * Mirrors Hermes agent/prompt_builder.py:build_skills_system_prompt logic.
 * See Docs/27-SKILLS-auto-discovery §7.1
 */

type ScanOpts = {
  dirs: string[]; // e.g. ['skills', '~/.lokma/skills']
};

type Snapshot = {
  at: number;
  skills: Skill[];
  mtimes: Map<string, number>;
};

let cache: Snapshot | null = null;

function parseFrontmatter(raw: string): { name: string; description: string; category: string } | null {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = m[1];
  const get = (k: string) => {
    const re = new RegExp(`^${k}:\\s*"?([^"\\n]+)"?`, 'm');
    return re.exec(fm)?.[1]?.trim() ?? '';
  };
  const name = get('name');
  const description = get('description');
  if (!name || !description) return null;
  return { name, description, category: get('category') || 'general' };
}

async function scanDir(dir: string): Promise<Skill[]> {
  const out: Skill[] = [];
  const full = expandHome(dir);
  try {
    await stat(full);
  } catch {
    return out;
  }

  // Walk one level of categories: <dir>/<category>/<skill>/SKILL.md
  const cats = await readdir(full, { withFileTypes: true }).catch(() => []);
  for (const cat of cats as any[]) {
    if (!cat.isDirectory()) continue;
    const catPath = join(full, cat.name);
    const skills = await readdir(catPath, { withFileTypes: true }).catch(() => []);
    for (const sk of skills as any[]) {
      const skPath = join(catPath, sk.name, 'SKILL.md');
      try {
        const raw = await readFile(skPath, 'utf-8');
        const fm = parseFrontmatter(raw);
        if (!fm) continue;
        // Linked files = references/* + templates/* + scripts/* + assets/*
        const linked: string[] = [];
        for (const sub of ['references', 'templates', 'scripts', 'assets']) {
          try {
            const files = await readdir(join(catPath, sk.name, sub));
            for (const f of files) linked.push(`${sub}/${f}`);
          } catch {}
        }
        out.push({
          id: `${cat.name}/${fm.name}`,
          name: fm.name,
          description: fm.description,
          category: fm.category || cat.name,
          path: skPath,
          linked_files: linked,
        });
      } catch {}
    }

    // Also support flat: <dir>/<skill>/SKILL.md (no category folder)
    const flatSkill = join(full, cat.name, 'SKILL.md');
    try {
      const raw = await readFile(flatSkill, 'utf-8');
      const fm = parseFrontmatter(raw);
      if (fm) {
        out.push({
          id: fm.name,
          name: fm.name,
          description: fm.description,
          category: fm.category,
          path: flatSkill,
          linked_files: [],
        });
      }
    } catch {}
  }
  return out;
}

export async function scan(opts: ScanOpts): Promise<Skill[]> {
  // Simple mtime cache — if no file changed, return cached
  const all: Skill[] = [];
  for (const d of opts.dirs) {
    const skills = await scanDir(d);
    all.push(...skills);
  }
  cache = { at: Date.now(), skills: all, mtimes: new Map() };
  return all;
}

export function getCached(): Skill[] | null {
  return cache?.skills ?? null;
}

/** Typed registry failure — routes map it straight to `{ code, message }`. */
export class SkillError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'SkillError';
    this.code = code;
    this.status = status;
  }
}

/** Refuse to serve or patch absurdly large skill files. */
export const SKILL_FILE_CAP = 256 * 1024;

/** Scan dirs every lookup — the registry is small and always fresh. */
const SKILL_SCAN_DIRS = ['skills', '~/.lokma/skills'];

/** Resolve a skill by id or name without ever joining user input into a path. */
async function findSkillOrThrow(skillId: string): Promise<Skill> {
  const id = (skillId ?? '').trim();
  if (!id) throw new SkillError('bad_skill_id', 'Skill id must not be empty', 400);
  const skills = await scan({ dirs: SKILL_SCAN_DIRS });
  const skill = skills.find((s) => s.id === id || s.name === id);
  if (!skill) throw new SkillError('skill_not_found', `No skill '${id}' in the registry`, 404);
  return skill;
}

/**
 * skill_view parity (Docs/27 §7.3): full SKILL.md body for the detail pane.
 * Progressive disclosure — the list stays light, this loads one skill.
 */
export async function readSkillView(skillId: string): Promise<{ skill: Skill; content: string }> {
  const skill = await findSkillOrThrow(skillId);
  let raw: string;
  try {
    raw = await readFile(skill.path, 'utf-8');
  } catch {
    throw new SkillError('skill_unreadable', `SKILL.md for '${skill.id}' cannot be read`, 500);
  }
  if (raw.length > SKILL_FILE_CAP) {
    throw new SkillError('too_large', `SKILL.md for '${skill.id}' exceeds 256KB`, 400);
  }
  return { skill, content: raw };
}

/**
 * Single reference load (Docs/27 §7.3 `GET /api/skills/:id/file`).
 * Jailed to the skill directory — `..` escapes and absolute paths 400.
 */
export async function readSkillFile(
  skillId: string,
  filePath: unknown,
): Promise<{ path: string; content: string }> {
  const skill = await findSkillOrThrow(skillId);
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new SkillError('bad_path', 'Query param `path` must be a non-empty relative path', 400);
  }
  const rel = normalize(filePath.trim()).replace(/\\/g, '/');
  if (rel.startsWith('/') || rel === '..' || rel.startsWith('../')) {
    throw new SkillError('outside_root', 'Reference path must stay inside the skill directory', 400);
  }
  const base = resolve(dirname(skill.path));
  const full = resolve(base, rel);
  if (relative(base, full).startsWith('..') || relative(base, full) === '') {
    throw new SkillError('outside_root', 'Reference path must stay inside the skill directory', 400);
  }
  let raw: string;
  try {
    const st = await stat(full);
    if (!st.isFile()) throw new Error('not a file');
    raw = await readFile(full, 'utf-8');
  } catch (e) {
    if (e instanceof SkillError) throw e;
    throw new SkillError('not_a_file', `No readable file '${rel}' in skill '${skill.id}'`, 404);
  }
  if (raw.length > SKILL_FILE_CAP) {
    throw new SkillError('too_large', `File '${rel}' exceeds 256KB`, 400);
  }
  return { path: rel, content: raw };
}

export type SkillPatchResult = { skill: Skill; bytes: number };

/**
 * Curator patch (Docs/27 §7.3 `PATCH /api/skills/:id`, Hermes
 * `skill_manage(patch)` parity): exact `old_string` → `new_string`
 * replacement inside SKILL.md. Single-occurrence guard — zero or
 * ambiguous matches 400 instead of silently editing the wrong block.
 */
export async function patchSkill(
  skillId: string,
  oldString: unknown,
  newString: unknown,
): Promise<SkillPatchResult> {
  const skill = await findSkillOrThrow(skillId);
  if (typeof oldString !== 'string' || !oldString) {
    throw new SkillError('bad_patch', 'Body field `old_string` must be a non-empty string', 400);
  }
  if (typeof newString !== 'string') {
    throw new SkillError('bad_patch', 'Body field `new_string` must be a string', 400);
  }
  if (newString.length > SKILL_FILE_CAP) {
    throw new SkillError('too_large', 'Patched SKILL.md would exceed 256KB', 400);
  }
  let raw: string;
  try {
    raw = await readFile(skill.path, 'utf-8');
  } catch {
    throw new SkillError('skill_unreadable', `SKILL.md for '${skill.id}' cannot be read`, 500);
  }
  const hits = raw.split(oldString).length - 1;
  if (hits === 0) throw new SkillError('no_match', '`old_string` matches nothing in SKILL.md', 400);
  if (hits > 1) {
    throw new SkillError(
      'ambiguous_match',
      `\`old_string\` matches ${hits} blocks — narrow it to exactly one`,
      400,
    );
  }
  const next = raw.replace(oldString, newString);
  await writeFile(skill.path, next, 'utf-8');
  // Re-scan so the registry (description/linked_files) reflects the patch.
  const fresh = await scan({ dirs: SKILL_SCAN_DIRS });
  const updated = fresh.find((s) => s.id === skill.id) ?? skill;
  return { skill: updated, bytes: next.length };
}

export async function view(skillId: string, filePath?: string): Promise<{ content: string; linked_files?: Record<string, string> } | null> {
  const skills = cache?.skills ?? [];
  const skill = skills.find((s) => s.id === skillId || s.name === skillId);
  if (!skill) return null;
  const raw = await readFile(skill.path, 'utf-8').catch(() => null);
  if (!raw) return null;
  if (!filePath) return { content: raw };
  const full = join(skill.path, '..', filePath);
  const fileContent = await readFile(full, 'utf-8').catch(() => null);
  if (fileContent === null) return null;
  return { content: raw, linked_files: { [filePath]: fileContent } };
}
