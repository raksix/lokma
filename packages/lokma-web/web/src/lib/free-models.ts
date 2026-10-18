/**
 * REQ-205 slice 1 — keyless FREE model catalog (client-side).
 *
 * The client-free runner (slice 2) talks to OmniRoute DIRECTLY from the
 * browser: no API key, no server hop. This module owns the catalog half:
 * fetch `{base}/models` keyless, keep only free ids, collapse the alias
 * prefixes that list the SAME route several times (measured 18 Oct 2026:
 * 46 free ids shrink to 21 canonical models — `cmd/` ≡ `command-code/`,
 * `opencode-zen/` ≡ `opencode/` ≡ `oc/`, `veo-free/` ≡ `veoaifree-web/`,
 * confirmed by identical upstream errors across the aliases), and cache the
 * result in localStorage with a TTL.
 *
 * Honesty rules (REQ-205 §5): a failed fetch answers `ok: false` — the UI
 * says the free catalog is unavailable; a stale cache is never served as if
 * fresh after a failed refetch, and a fabricated list is NEVER produced.
 *
 * Single configuration point (REQ-205 §8): `FREE_BASE_URL` is the only base
 * URL constant; every call site takes an optional override so a future
 * same-origin proxy can be swapped in without touching consumers.
 *
 * Covered by `free-models.test.ts` (`bun src/lib/free-models.test.ts`).
 */

/** The only base URL in the client-free path (slice 1 configuration point). */
export const FREE_BASE_URL = 'https://omniroute.fermag.com.tr/v1';

/** How long a cached catalog counts as fresh (10 minutes). */
export const FREE_CATALOG_TTL_MS = 10 * 60 * 1000;

/** localStorage key — namespaced like every other lokma key. */
export const FREE_CATALOG_KEY = 'lokma:free-catalog:v1';

/** One canonical free model (alias duplicates already collapsed). */
export type FreeModel = {
  /** The id the free runner sends to the API. */
  id: string;
  /** Display label — identical to the id so the screen never lies. */
  label: string;
  /** Other ids that route to the same model (alias badge count). */
  aliases: string[];
  contextLength: number | null;
  reasoning: boolean;
  vision: boolean;
};

/** Catalog outcome — the error branch carries a human-readable reason. */
export type FreeCatalogResult =
  | { ok: true; models: FreeModel[]; fetchedAt: number; cached: boolean }
  | { ok: false; error: string };

/** Browser storage handle (structurally localStorage; injectable for probes). */
export type FreeCatalogStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/**
 * Is this catalog id a free one? Measured shapes across the 821-entry live
 * catalog (0 false positives on the current upstream): `opencode-zen/x-free`,
 * `cmd/x:free`, `free-opencode`, `auto/best-free`, `veoaifree-web/*`.
 */
export function isFreeId(id: string): boolean {
  return id.toLowerCase().includes('free');
}

/**
 * Alias prefixes that list the SAME route under several names. `rank` picks
 * the canonical spelling (lower wins — the most explicit name first); the
 * family groups the prefixes that measured to the same upstream.
 */
const ALIAS_FAMILIES: ReadonlyArray<{ prefix: string; family: string; rank: number }> = [
  { prefix: 'command-code/', family: 'code', rank: 0 },
  { prefix: 'cmd/', family: 'code', rank: 1 },
  { prefix: 'opencode-zen/', family: 'zen', rank: 0 },
  { prefix: 'opencode/', family: 'zen', rank: 1 },
  { prefix: 'oc/', family: 'zen', rank: 2 },
  { prefix: 'veo-free/', family: 'veo', rank: 0 },
  { prefix: 'veoaifree-web/', family: 'veo', rank: 1 },
];

type AliasHit = { family: string; rank: number; base: string };

/** Resolve an id's alias family — null when the id carries no known prefix. */
function aliasOf(id: string): AliasHit | null {
  for (const entry of ALIAS_FAMILIES) {
    if (id.startsWith(entry.prefix)) {
      return { family: entry.family, rank: entry.rank, base: id.slice(entry.prefix.length) };
    }
  }
  return null;
}

type CatalogRow = {
  id: string;
  contextLength: number | null;
  reasoning: boolean;
  vision: boolean;
};

type CatalogMember = CatalogRow & {
  family: string | null;
  rank: number;
  base: string;
};

/**
 * Pull `{ data: [{ id, context_length, capabilities }] }` rows out of an
 * OpenAI-shaped payload. Defensive by design: any malformed row is skipped,
 * a malformed payload yields an empty list (callers treat empty as failure).
 */
function modelRows(payload: unknown): CatalogRow[] {
  const rec = payload as { data?: unknown; models?: unknown } | null | undefined;
  const arr = Array.isArray(rec?.data) ? rec.data : Array.isArray(rec?.models) ? rec.models : null;
  if (!arr) return [];
  const rows: CatalogRow[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as Record<string, unknown>;
    const id = typeof m.id === 'string' ? m.id.trim() : '';
    if (!id) continue;
    const caps = (m.capabilities && typeof m.capabilities === 'object' ? m.capabilities : {}) as Record<string, unknown>;
    rows.push({
      id,
      contextLength: typeof m.context_length === 'number' ? m.context_length : null,
      reasoning: caps.reasoning === true || caps.thinking === true,
      vision: caps.vision === true,
    });
  }
  return rows;
}

/** Dedupe a bucket by id, keeping the first occurrence (input order). */
function uniqueById(members: CatalogMember[]): CatalogMember[] {
  const seen = new Set<string>();
  const out: CatalogMember[] = [];
  for (const m of members) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

/**
 * Pure catalog normalizer: free filter + alias dedupe + deterministic order.
 * Group key is `family:base` for prefixed ids (so `cmd/x` and
 * `command-code/x` land together) and the raw id for everything else.
 */
export function normalizeFreeCatalog(payload: unknown): FreeModel[] {
  const buckets = new Map<string, CatalogMember[]>();
  for (const row of modelRows(payload)) {
    if (!isFreeId(row.id)) continue;
    const hit = aliasOf(row.id);
    const member: CatalogMember = {
      ...row,
      family: hit ? hit.family : null,
      rank: hit ? hit.rank : 0,
      base: hit ? hit.base : row.id,
    };
    const key = hit ? hit.family + ':' + hit.base : 'bare:' + row.id;
    const list = buckets.get(key);
    if (list) list.push(member);
    else buckets.set(key, [member]);
  }

  const models: FreeModel[] = [];
  for (const list of buckets.values()) {
    const sorted = uniqueById(list).sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
    const canonical = sorted[0];
    models.push({
      id: canonical.id,
      label: canonical.id,
      aliases: sorted.slice(1).map((m) => m.id),
      contextLength: canonical.contextLength,
      reasoning: canonical.reasoning,
      vision: canonical.vision,
    });
  }
  return models.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Join a base URL with an API path without a regex (trailing slashes
 * stripped). Shared by every client-free call site (slice 1 `/models`,
 * slice 2 `/chat/completions`) so the single-configuration-point rule holds.
 */
export function apiUrl(base: string, path: string): string {
  let trimmed = base.trim();
  while (trimmed.endsWith('/')) trimmed = trimmed.slice(0, -1);
  return trimmed + path;
}

/** `{base}/models` without a regex (trailing slashes stripped). */
export function modelsUrl(base: string): string {
  return apiUrl(base, '/models');
}

/** Human-readable failure text — never a fabricated catalog. */
function failureText(reason: string): string {
  return 'Free catalog unavailable: ' + reason;
}

/**
 * Fetch + normalize the keyless catalog. Never throws: network errors, HTTP
 * failures and empty/invalid payloads all land in the `{ ok: false }` branch,
 * because the UI must say "unavailable" instead of showing an invented list.
 */
export async function fetchFreeCatalog(
  base: string = FREE_BASE_URL,
  fetchFn: typeof fetch = fetch,
): Promise<FreeCatalogResult> {
  try {
    const res = await fetchFn(modelsUrl(base), { method: 'GET', headers: { accept: 'application/json' } });
    if (!res.ok) return { ok: false, error: failureText('HTTP ' + res.status) };
    const payload: unknown = await res.json();
    const models = normalizeFreeCatalog(payload);
    if (models.length === 0) return { ok: false, error: failureText('the upstream listed no free models') };
    return { ok: true, models, fetchedAt: Date.now(), cached: false };
  } catch (e) {
    return { ok: false, error: failureText(e instanceof Error ? e.message : 'network error') };
  }
}

type CachedCatalog = { fetchedAt: number; models: FreeModel[] };

/** localStorage when available (browser), otherwise null (cache off). */
function defaultStorage(): FreeCatalogStorage | null {
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') return localStorage;
  } catch {
    // Storage blocked (private mode) — the catalog simply never caches.
  }
  return null;
}

function readCache(storage: FreeCatalogStorage | null): CachedCatalog | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(FREE_CATALOG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCatalog;
    if (!parsed || typeof parsed.fetchedAt !== 'number' || !Array.isArray(parsed.models)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(storage: FreeCatalogStorage | null, catalog: CachedCatalog): void {
  if (!storage) return;
  try {
    storage.setItem(FREE_CATALOG_KEY, JSON.stringify(catalog));
  } catch {
    // Quota or serialization failure — caching is best-effort only.
  }
}

/**
 * TTL-cached catalog load. A fresh cache answers without any network call;
 * an expired cache refetches — and when THAT fails the result is an error,
 * not the stale list (REQ-205 §5 negative control).
 */
export async function loadFreeCatalog(
  opts: {
    base?: string;
    force?: boolean;
    fetchFn?: typeof fetch;
    storage?: FreeCatalogStorage | null;
  } = {},
): Promise<FreeCatalogResult> {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  if (!opts.force) {
    const cached = readCache(storage);
    if (cached && Date.now() - cached.fetchedAt < FREE_CATALOG_TTL_MS) {
      return { ok: true, models: cached.models, fetchedAt: cached.fetchedAt, cached: true };
    }
  }
  const res = await fetchFreeCatalog(opts.base, opts.fetchFn);
  if (res.ok) writeCache(storage, { fetchedAt: res.fetchedAt, models: res.models });
  return res;
}
