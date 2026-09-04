import { MarketplaceItemSchema, type MarketplaceItem } from 'lokma-shared';

/**
 * Remote plugin marketplace — GitHub `lokma-plugin` topic search
 * (Docs/23 §9, Phase 2 marketplace wiring). The `plugins.lokma.sh`
 * registry does not exist yet, so the GitHub topic is the live remote:
 * every hit is a real repo, stars/descriptions come from the API, and the
 * `url` feeds the existing add-from-URL installer directly (github.com is
 * a public https host, so validation passes).
 *
 * SSRF surface: the host is fixed to `api.github.com` (no user-controlled
 * host), 10s timeout, 10 results max, optional `GITHUB_TOKEN` bearer for
 * higher rate limits. No filesystem or registry writes happen here.
 */

export const MARKETPLACE_TOPIC = 'lokma-plugin';
const MARKETPLACE_HOST = 'api.github.com';
const MARKETPLACE_TIMEOUT_MS = 10_000;
const MARKETPLACE_PER_PAGE = 10;
const QUERY_CAP = 100;

/** Typed error — routes map `code`/`status` straight into `{ code, message }`. */
export class MarketplaceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'MarketplaceError';
    this.code = code;
    this.status = status;
  }
}

/** Normalize the raw `q` param — empty means "browse the whole topic". */
export function normalizeMarketplaceQuery(raw: unknown): string {
  if (raw === undefined || raw === null || raw === '') return '';
  if (typeof raw !== 'string') {
    throw new MarketplaceError('bad_query', 'q must be a string', 400);
  }
  const query = raw.trim().slice(0, QUERY_CAP);
  if (/[\u0000-\u001f\u007f]/.test(query)) {
    throw new MarketplaceError('bad_query', 'q must not contain control characters', 400);
  }
  return query;
}

/**
 * Build the GitHub Search API URL — pure (probe-covered). The topic filter
 * always applies; the user query narrows with `+` AND semantics, stars sort
 * so the best-known plugins surface first.
 */
export function buildMarketplaceQuery(query: string): string {
  const terms = query ? ` ${query}` : '';
  const q = `topic:${MARKETPLACE_TOPIC}${terms}`;
  const params = new URLSearchParams({
    q,
    sort: 'stars',
    order: 'desc',
    per_page: String(MARKETPLACE_PER_PAGE),
  });
  return `https://${MARKETPLACE_HOST}/search/repositories?${params.toString()}`;
}

/** Loose upstream shape — validated field by field, never trusted blindly. */
type GitHubRepo = {
  full_name?: unknown;
  name?: unknown;
  owner?: { login?: unknown };
  description?: unknown;
  stargazers_count?: unknown;
  html_url?: unknown;
  updated_at?: unknown;
};

/**
 * Parse one upstream repo into a marketplace hit — pure (probe-covered).
 * Returns null for malformed rows (skipped, never invented).
 */
export function parseMarketplaceRepo(repo: GitHubRepo | null | undefined): MarketplaceItem | null {
  if (typeof repo !== 'object' || repo === null) return null;
  const parsed = MarketplaceItemSchema.safeParse({
    repo: typeof repo.full_name === 'string' ? repo.full_name : '',
    name: typeof repo.name === 'string' ? repo.name : '',
    author:
      repo.owner && typeof repo.owner.login === 'string' ? repo.owner.login : '',
    description:
      typeof repo.description === 'string' && repo.description
        ? repo.description.slice(0, 500)
        : '',
    stars: typeof repo.stargazers_count === 'number' ? repo.stargazers_count : -1,
    url: typeof repo.html_url === 'string' ? repo.html_url : '',
    updatedAt: typeof repo.updated_at === 'string' ? repo.updated_at : '',
  });
  return parsed.success ? parsed.data : null;
}

/** Parse the full Search API body — `{ items }` or an error shape. */
export function parseMarketplaceResponse(body: unknown): MarketplaceItem[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return [];
  const items = (body as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const hits: MarketplaceItem[] = [];
  for (const entry of items) {
    if (typeof entry !== 'object' || entry === null) continue;
    const hit = parseMarketplaceRepo(entry as GitHubRepo);
    if (hit) hits.push(hit);
  }
  return hits;
}

export type MarketplaceResult = {
  items: MarketplaceItem[];
  count: number;
  source: string;
};

/**
 * Search the live remote marketplace. Throws `MarketplaceError`
 * (`marketplace_unavailable`, 503) on network failure, non-200 upstream
 * (rate limit included — the message says when to retry), or bad JSON.
 */
export async function searchMarketplace(rawQuery: unknown): Promise<MarketplaceResult> {
  const query = normalizeMarketplaceQuery(rawQuery);
  const url = buildMarketplaceQuery(query);
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'lokma-harness-plugin-marketplace',
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(MARKETPLACE_TIMEOUT_MS) });
  } catch {
    throw new MarketplaceError(
      'marketplace_unavailable',
      'Marketplace is unreachable (network error) — retry in a minute',
      503,
    );
  }
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get('x-ratelimit-reset');
    const when = reset ? ` — rate limit resets at ${new Date(Number(reset) * 1000).toISOString()}` : '';
    throw new MarketplaceError(
      'marketplace_unavailable',
      `Marketplace rate-limited by GitHub${when} — set GITHUB_TOKEN or retry later`,
      503,
    );
  }
  if (!res.ok) {
    throw new MarketplaceError(
      'marketplace_unavailable',
      `Marketplace answered HTTP ${res.status} — retry in a minute`,
      503,
    );
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new MarketplaceError(
      'marketplace_unavailable',
      'Marketplace answered with bad JSON — retry in a minute',
      503,
    );
  }
  const items = parseMarketplaceResponse(body);
  return { items, count: items.length, source: `github-topic:${MARKETPLACE_TOPIC}` };
}
