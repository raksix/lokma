import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
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
