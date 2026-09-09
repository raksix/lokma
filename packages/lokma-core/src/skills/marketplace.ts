import { execFile } from 'node:child_process';
import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import { MarketplaceItemSchema, type MarketplaceItem } from '@lokma/shared';
import {
  MarketplaceError,
  normalizeMarketplaceQuery,
  parseMarketplaceResponse,
} from '../plugins/marketplace.js';
import { parseFrontmatter, scan, SkillError, type SkillPatchResult } from './registry.js';

/**
 * Skill marketplace + installer (REQ-028, Docs/27 §7.3 install contract).
 * Search mirrors the plugin marketplace over the live GitHub
 * `lokma-skill` topic (topic-agnostic parse/normalize helpers are reused
 * from `plugins/marketplace` — this file only adds the skill topic URL
 * builder and the fetcher). Install is a real `git clone --depth 1` into
 * `~/.lokma/skills/<slug>/` followed by a registry rescan — the skill
 * appears in `<available_skills>` next turn, no restart.
 *
 * SSRF surface: the search host is fixed to `api.github.com` (no
 * user-controlled host); install accepts https-only public URLs (same
 * rules as plugin add-from-URL: no credentials, no local/private hosts)
 * and `git` itself does the only network fetch, with `GIT_TERMINAL_PROMPT=0`
 * so private repos fail fast instead of hanging on an auth prompt.
 */

export const SKILL_MARKETPLACE_TOPIC = 'lokma-skill';
const SKILL_MARKETPLACE_HOST = 'api.github.com';
const SKILL_MARKETPLACE_TIMEOUT_MS = 10_000;
const SKILL_MARKETPLACE_PER_PAGE = 10;

const URL_CAP = 500;
const CLONE_TIMEOUT_MS = 60_000;

/** Slugs become directory names — keep them filesystem-safe. */
const SKILL_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

const execFileAsync = promisify(execFile);

function skillsRoot(): string {
  return join(homedir(), '.lokma', 'skills');
}

/**
 * Build the GitHub Search API URL — pure (probe-covered). The skill topic
 * filter always applies; the user query narrows with `+` AND semantics.
 */
export function buildSkillMarketQuery(query: string): string {
  const terms = query ? ` ${query}` : '';
  const q = `topic:${SKILL_MARKETPLACE_TOPIC}${terms}`;
  const params = new URLSearchParams({
    q,
    sort: 'stars',
    order: 'desc',
    per_page: String(SKILL_MARKETPLACE_PER_PAGE),
  });
  return `https://${SKILL_MARKETPLACE_HOST}/search/repositories?${params.toString()}`;
}

export type SkillMarketplaceResult = {
  items: MarketplaceItem[];
  count: number;
  source: string;
};

/**
 * Search the live remote skill marketplace. Throws `MarketplaceError`
 * (`marketplace_unavailable`, 503) on network failure, non-200 upstream,
 * or bad JSON — same contract as the plugin search.
 */
export async function searchSkillMarketplace(rawQuery: unknown): Promise<SkillMarketplaceResult> {
  const query = normalizeMarketplaceQuery(rawQuery);
  const url = buildSkillMarketQuery(query);
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'lokma-harness-skill-marketplace',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(SKILL_MARKETPLACE_TIMEOUT_MS) });
  } catch {
    throw new MarketplaceError(
      'marketplace_unavailable',
      'Skill marketplace is unreachable (network error) — retry in a minute',
      503,
    );
  }
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get('x-ratelimit-reset');
    const when = reset ? ` — rate limit resets at ${new Date(Number(reset) * 1000).toISOString()}` : '';
    throw new MarketplaceError(
      'marketplace_unavailable',
      `Skill marketplace rate-limited by GitHub${when} — set GITHUB_TOKEN or retry later`,
      503,
    );
  }
  if (!res.ok) {
    throw new MarketplaceError(
      'marketplace_unavailable',
      `Skill marketplace answered HTTP ${res.status} — retry in a minute`,
      503,
    );
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new MarketplaceError(
      'marketplace_unavailable',
      'Skill marketplace answered with bad JSON — retry in a minute',
      503,
    );
  }
  const items = parseMarketplaceResponse(body);
  return { items, count: items.length, source: `github-topic:${SKILL_MARKETPLACE_TOPIC}` };
}

/** Re-exported for the probe — one GitHub repo row, skill-schema-agnostic. */
export { MarketplaceItemSchema };

function isPrivateHost(host: string): boolean {
  const lower = host.toLowerCase().replace(/\.$/, '');
  if (lower === 'localhost' || lower === '::1' || lower === '[::1]') return true;
  if (/^127\./.test(lower) || lower === '0.0.0.0') return true;
  if (/^10\./.test(lower) || /^192\.168\./.test(lower)) return true;
  const m172 = lower.match(/^172\.(\d+)\./);
  if (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31) return true;
  return false;
}

/** Derive a filesystem-safe install dir from the repo URL path. */
export function slugFromSkillUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SkillError('bad_url', 'url is not a valid URL', 400);
  }
  if (url.protocol !== 'https:') {
    throw new SkillError('bad_url', 'Only https skill URLs are accepted', 400);
  }
  if (url.username || url.password || rawUrl.includes('@')) {
    throw new SkillError('bad_url', 'Skill URLs must not carry credentials', 400);
  }
  if (isPrivateHost(url.hostname)) {
    throw new SkillError('bad_url', 'Skill URLs must not target local/private hosts', 400);
  }
  const parts = url.pathname.split('/').filter(Boolean);
  const tail = parts.length > 0 ? parts[parts.length - 1] : '';
  const slug = tail
    .replace(/\.(git|tgz|tar\.gz|zip)$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 64);
  if (!SKILL_SLUG_PATTERN.test(slug)) {
    throw new SkillError('bad_url', 'Cannot derive a skill id from this URL path', 400);
  }
  return slug;
}

export type SkillInstallResult = {
  skill: SkillPatchResult['skill'];
  slug: string;
};

/**
 * Install a skill from a public git URL — `git clone --depth 1` into
 * `~/.lokma/skills/<slug>/`, then verify a parseable SKILL.md at the
 * clone root and rescan. Anything invalid rolls the directory back and
 * answers 400; an existing slug answers 409 `skill_exists`.
 */
export async function installSkillFromUrl(rawUrl: unknown): Promise<SkillInstallResult> {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > URL_CAP) {
    throw new SkillError('bad_url', 'url must be a non-empty https URL (max 500 chars)', 400);
  }
  const slug = slugFromSkillUrl(rawUrl);
  const target = join(skillsRoot(), slug);
  try {
    const st = await stat(target);
    if (st) throw new SkillError('skill_exists', `Skill '${slug}' is already installed`, 409);
  } catch (e) {
    if (e instanceof SkillError) throw e;
    // Missing path — the install proceeds.
  }
  try {
    await execFileAsync('git', ['clone', '--depth', '1', rawUrl, target], {
      timeout: CLONE_TIMEOUT_MS,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
  } catch (e) {
    await rm(target, { recursive: true, force: true });
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      throw new SkillError('git_missing', 'git is not installed on the server', 500);
    }
    throw new SkillError(
      'clone_failed',
      `git clone failed (${typeof code === 'string' ? code : 'exit'}) — is the URL a public repo?`,
      400,
    );
  }
  const { readFile } = await import('node:fs/promises');
  let fm: { name: string; description: string } | null = null;
  try {
    const raw = await readFile(join(target, 'SKILL.md'), 'utf-8');
    fm = parseFrontmatter(raw);
  } catch {
    fm = null;
  }
  if (!fm) {
    await rm(target, { recursive: true, force: true });
    throw new SkillError(
      'no_skill_md',
      'No parseable SKILL.md (name + description frontmatter) at the repo root',
      400,
    );
  }
  const skills = await scan({ dirs: ['skills', '~/.lokma/skills'] });
  const installed =
    skills.find((s) => s.path === join(target, 'SKILL.md') || s.path.startsWith(`${target}/`)) ??
    skills.find((s) => s.name === fm.name);
  if (!installed) {
    await rm(target, { recursive: true, force: true });
    throw new SkillError('skill_not_indexed', 'Cloned repo does not index as a skill', 500);
  }
  return { skill: installed, slug };
}
