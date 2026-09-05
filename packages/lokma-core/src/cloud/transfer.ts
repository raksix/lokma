import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import { ensureDir, expandHome, writeAtomic } from '../utils/fs.js';
import { buildStoredZip, readStoredZip, ZipError } from '../utils/zip.js';

/**
 * Portable cloud transfer — pack the whole `~/.lokma` home into one zip so a
 * harness can move to a cloud box (Docs/03 Phase 3 "cloud prep", wave 1).
 * Export covers the GLOBAL home only; per-project `.lokma/` travels with the
 * project checkout (the pane footer says so — no silent gaps).
 *
 * Secrets NEVER travel: `credentials.json` (provider keys) and `auth/`
 * (scrypt hashes + HMAC secret) are excluded from the export and rejected on
 * import, even in a hand-crafted bundle. Derived indexes (`.fts5/`) are
 * skipped — the stores rebuild them on demand.
 */

/** Bundle format version — import refuses anything else. */
export const CLOUD_EXPORT_VERSION = 1;
/** Manifest is always the first entry of an export bundle. */
export const CLOUD_MANIFEST_NAME = 'manifest.json';
/** Largest single file that rides along (matches the vault ingest cap). */
export const CLOUD_MAX_FILE_BYTES = 512 * 1024;
/** Largest bundle accepted on either end (stored entries ≈ raw bytes). */
export const CLOUD_MAX_TOTAL_BYTES = 256 * 1024 * 1024;
/** Most entries accepted on either end. */
export const CLOUD_MAX_ENTRIES = 5000;
/** Largest import POST the server accepts (base64 inflates ~4/3). */
export const CLOUD_MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

/** Portable top-level files under `~/.lokma`. */
const EXPORT_TOP_FILES = ['config.json'] as const;
/** Portable subtrees under `~/.lokma` (walked recursively). */
const EXPORT_DIRS = [
  'skills',
  'agents',
  'bots',
  'vault',
  'archify',
  'design',
  'test-runs',
  'shares',
  'cron',
  'plugins',
  'projects',
  'memories',
] as const;
/** Never exported, never imported — listed in the manifest + pane footer. */
const EXCLUDED_PATHS = ['credentials.json', 'auth/'] as const;

/** Typed transfer failure — routes map it straight to `{ code, message }`. */
export class CloudError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'CloudError';
    this.code = code;
    this.status = status;
  }
}

/** One file described in the export manifest (integrity-checked on import). */
export type CloudManifestEntry = { path: string; bytes: number; sha256: string };
/** One file left out of an export, with the reason (honest, not silent). */
export type CloudSkippedEntry = { path: string; reason: string };

/** Export manifest — first entry of every bundle. */
export type CloudManifest = {
  tool: 'lokma-cloud-transfer';
  version: typeof CLOUD_EXPORT_VERSION;
  exportedAt: string;
  host: string;
  entries: CloudManifestEntry[];
  skipped: CloudSkippedEntry[];
  excluded: string[];
};

/** Per-file outcome of an import (nothing is ever deleted). */
export type CloudImportResult = {
  created: string[];
  skipped: string[];
  overwritten: string[];
  rejected: CloudSkippedEntry[];
  count: number;
};

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** True for derived or transient paths that must not ride along. */
function isDerivedRelPath(rel: string): boolean {
  return rel.split('/').some((seg) => seg.startsWith('.')) || /\.tmp\.\d+$/.test(rel);
}

type CollectedFile = { rel: string; data: Buffer };

/** Recursively collect portable text files under one home subtree. */
async function collectDir(
  relDir: string,
  files: CollectedFile[],
  skipped: CloudSkippedEntry[],
  total: { bytes: number },
): Promise<void> {
  const full = join(homedir(), '.lokma', relDir);
  let names: string[];
  try {
    names = (await readdir(full)).sort();
  } catch {
    return; // Missing store — nothing to pack, not an error.
  }
  for (const name of names) {
    const rel = `${relDir}/${name}`;
    if (isDerivedRelPath(rel)) {
      skipped.push({ path: rel, reason: 'derived' });
      continue;
    }
    const abs = join(homedir(), '.lokma', rel);
    let st;
    try {
      // lstat: symlinks are never followed out of the home dir.
      const { lstat } = await import('node:fs/promises');
      st = await lstat(abs);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) {
      skipped.push({ path: rel, reason: 'symlink' });
      continue;
    }
    if (st.isDirectory()) {
      await collectDir(rel, files, skipped, total);
      continue;
    }
    if (!st.isFile()) continue;
    if (st.size > CLOUD_MAX_FILE_BYTES) {
      skipped.push({ path: rel, reason: 'too_large' });
      continue;
    }
    const data = await readFile(abs);
    if (data.includes(0)) {
      skipped.push({ path: rel, reason: 'binary' });
      continue;
    }
    total.bytes += data.length;
    if (total.bytes > CLOUD_MAX_TOTAL_BYTES || files.length >= CLOUD_MAX_ENTRIES) {
      throw new CloudError('export_too_large', 'state is larger than the portable transfer caps', 507);
    }
    files.push({ rel, data });
  }
}

/**
 * Pack the portable `~/.lokma` state into a stored-zip bundle.
 * Missing stores pack as zero entries — export never fails on a fresh home.
 */
export async function exportState(): Promise<{
  filename: string;
  contentType: string;
  body: Buffer;
  manifest: CloudManifest;
}> {
  const files: CollectedFile[] = [];
  const skipped: CloudSkippedEntry[] = [];
  const total = { bytes: 0 };
  for (const top of EXPORT_TOP_FILES) {
    const abs = join(homedir(), '.lokma', top);
    try {
      const st = await stat(abs);
      if (st.isFile() && st.size <= CLOUD_MAX_FILE_BYTES) {
        const data = await readFile(abs);
        if (data.includes(0)) {
          skipped.push({ path: top, reason: 'binary' });
        } else {
          total.bytes += data.length;
          files.push({ rel: top, data });
        }
      } else if (st.isFile()) {
        skipped.push({ path: top, reason: 'too_large' });
      }
    } catch {
      // Missing — fine on a fresh home.
    }
  }
  for (const dir of EXPORT_DIRS) await collectDir(dir, files, skipped, total);
  files.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  const manifest: CloudManifest = {
    tool: 'lokma-cloud-transfer',
    version: CLOUD_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    host: hostname(),
    entries: files.map((f) => ({ path: f.rel, bytes: f.data.length, sha256: sha256(f.data) })),
    skipped,
    excluded: [...EXCLUDED_PATHS],
  };
  const body = buildStoredZip([
    { name: CLOUD_MANIFEST_NAME, content: JSON.stringify(manifest, null, 2) },
    ...files.map((f) => ({ name: f.rel, content: f.data.toString('utf-8') })),
  ]);
  const stamp = manifest.exportedAt.slice(0, 10);
  return { filename: `lokma-state-${stamp}.zip`, contentType: 'application/zip', body, manifest };
}

/**
 * Validate one import entry name against the portable allowlist — absolute
 * paths, `..` escapes, dot-segments and anything outside the export set fail
 * closed (a crafted bundle can never write `auth/` or `credentials.json`).
 */
export function assertImportableName(name: string): void {
  if (!name || name.includes('\\') || name.startsWith('/') || name === CLOUD_MANIFEST_NAME) {
    throw new CloudError('bad_entry', `rejected bundle path: ${name || '(empty)'}`);
  }
  const segs = name.split('/');
  if (segs.some((s) => s === '' || s === '.' || s === '..' || s.startsWith('.'))) {
    throw new CloudError('bad_entry', `rejected bundle path: ${name}`);
  }
  const topAllowed = (EXPORT_TOP_FILES as readonly string[]).includes(name);
  const dirAllowed = (EXPORT_DIRS as readonly string[]).some((d) => name.startsWith(`${d}/`));
  if (!topAllowed && !dirAllowed) {
    throw new CloudError('bad_entry', `path is outside the portable set: ${name}`);
  }
}

/**
 * Restore a bundle produced by `exportState` into this home. Existing files
 * are kept by default (`overwrite: true` replaces them); rejected entries are
 * reported, never written; nothing is ever deleted.
 */
export async function importState(input: Buffer, opts?: { overwrite?: boolean }): Promise<CloudImportResult> {
  if (!Buffer.isBuffer(input) || input.length < 22) {
    throw new CloudError('bad_zip', 'import needs the raw bytes of a lokma state bundle');
  }
  if (input.length > CLOUD_MAX_UPLOAD_BYTES) {
    throw new CloudError('bad_zip', 'bundle is larger than the 64MB import cap', 413);
  }
  let entries;
  try {
    entries = readStoredZip(input);
  } catch (e) {
    if (e instanceof ZipError) throw new CloudError(e.code, e.message, e.status);
    throw e;
  }
  if (entries.length > CLOUD_MAX_ENTRIES + 1) {
    throw new CloudError('bad_zip', 'bundle holds more entries than the import cap', 413);
  }
  const manifestRaw = entries.find((e) => e.name === CLOUD_MANIFEST_NAME);
  if (!manifestRaw) throw new CloudError('bad_manifest', 'bundle has no manifest.json — only lokma state bundles can be imported');
  let manifest: CloudManifest;
  try {
    manifest = JSON.parse(manifestRaw.data.toString('utf-8')) as CloudManifest;
  } catch {
    throw new CloudError('bad_manifest', 'bundle manifest.json does not parse');
  }
  if (manifest.tool !== 'lokma-cloud-transfer' || manifest.version !== CLOUD_EXPORT_VERSION) {
    throw new CloudError('bad_manifest', 'bundle was not produced by this lokma transfer version');
  }
  const byPath = new Map(manifest.entries.map((e) => [e.path, e]));
  const result: CloudImportResult = { created: [], skipped: [], overwritten: [], rejected: [], count: 0 };
  let total = 0;
  for (const entry of entries) {
    if (entry.name === CLOUD_MANIFEST_NAME) continue;
    total += entry.data.length;
    if (total > CLOUD_MAX_TOTAL_BYTES) {
      throw new CloudError('bad_zip', 'bundle contents exceed the 256MB import cap', 413);
    }
    try {
      assertImportableName(entry.name);
    } catch {
      result.rejected.push({ path: entry.name, reason: 'outside_portable_set' });
      continue;
    }
    if (entry.data.length > CLOUD_MAX_FILE_BYTES) {
      result.rejected.push({ path: entry.name, reason: 'too_large' });
      continue;
    }
    if (entry.data.includes(0)) {
      result.rejected.push({ path: entry.name, reason: 'binary' });
      continue;
    }
    const expected = byPath.get(entry.name);
    if (!expected || expected.bytes !== entry.data.length || expected.sha256 !== sha256(entry.data)) {
      result.rejected.push({ path: entry.name, reason: 'manifest_mismatch' });
      continue;
    }
    const target = `~/.lokma/${entry.name}`;
    const full = expandHome(target);
    let exists = false;
    try {
      exists = (await stat(full)).isFile();
    } catch {
      exists = false;
    }
    if (exists && !opts?.overwrite) {
      result.skipped.push(entry.name);
      continue;
    }
    await ensureDir(`~/.lokma/${entry.name.split('/').slice(0, -1).join('/') || '.'}`);
    await writeAtomic(target, entry.data.toString('utf-8'));
    if (exists) result.overwritten.push(entry.name);
    else result.created.push(entry.name);
  }
  result.count = result.created.length + result.overwritten.length;
  return result;
}
