#!/usr/bin/env bun
/**
 * REQ-191 — live probe for the design system catalog.
 *
 * Proves the DEPLOYED server on the wire (not a unit test): the catalog
 * route answers the REAL directory, install from a local package works
 * end to end, activation lands in the project `.lokma/` dir that
 * `GET /api/design/guard` already reads, and the SSRF guard refuses a
 * loopback install BEFORE git is ever reached.
 *
 * Zero model cost: nothing here generates an artifact.
 *
 * Run from the repo root with the API up (lokma-server :3456):
 *   bun scripts/probe-design-system-catalog.cjs [--base http://127.0.0.1:3456]
 *
 * The login gate stays ON — a superadmin Bearer is minted, never the gate
 * flipped (see the lokma-harness headless-probe rule). Everything the probe
 * creates is deleted afterwards, with a stays-gone re-check.
 */
const { mkdtemp, mkdir, writeFile, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

// Probe-created state, declared at MODULE scope on purpose: cleanup() runs
// from `finally`, and a throw before `work`/`PKG_ID` were assigned would
// otherwise leave the temp dir behind (a swallowed cleanup error looks
// exactly like a clean run).
const args = process.argv.slice(2);
const baseArg = args.indexOf('--base');
const BASE = (baseArg >= 0 && args[baseArg + 1]) || process.env.LOKMA_BASE || 'http://127.0.0.1:3456';
const TOKEN_FILE = '/tmp/lokma-req191-token.sh';

let work = null;
let PKG_ID = null;
let token = null;

let passed = 0;
let failed = 0;

function check(label, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log('PASS: ' + label);
  } else {
    failed += 1;
    console.log('FAIL: ' + label + (detail ? ' — ' + detail : ''));
  }
}

// ── cleanup ────────────────────────────────────────────────────────────────
// The probe installs into the REAL catalog dir, so cleanup removes the
// package it created and re-lists to prove it stayed gone. This runs in the
// caller's finally: a mid-probe throw used to leak the temp dir, and the
// next run then found a half-installed package.
async function api(pathname, init = {}) {
  const res = await fetch(BASE + pathname, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
      ...(init.headers || {}),
    },
  });
  let body = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { _raw: text.slice(0, 200) };
  }
  return { status: res.status, body };
}

async function cleanup() {
  const { homedir } = require('node:os');
  if (PKG_ID) await rm(join(homedir(), '.lokma', 'design', 'systems', PKG_ID), { recursive: true, force: true });
  if (work) await rm(work, { recursive: true, force: true });
  if (!work) return;
  // Stays-gone: an in-flight write can resurrect the dir on the next list.
  for (let i = 0; i < 3; i++) {
    const res = await api('/api/design/systems');
    const row = (res.body?.systems || []).find((r) => r.id === PKG_ID);
    if (!row) {
      check('the probe package is gone from the catalog (cleanup verified)', true);
      return;
    }
    await cleanup();
  }
  check('the probe package is gone from the catalog (cleanup verified)', false, 'still listed after 3 attempts');
}

async function mintToken() {
  // The token script is root-only and never echoed; only its stdout is used
  // in-memory as a header value.
  let out;
  try {
    out = await execFileAsync('bash', [TOKEN_FILE], { timeout: 30_000 });
  } catch (e) {
    throw new Error(
      'Could not mint a superadmin token. Create ' +
        TOKEN_FILE +
        ' (chmod 700) that prints a Bearer for: HOME=/root bun scripts/mint-e2e-token.mjs [email]\n' +
        String(e.stderr || e.message),
    );
  }
  const token = String(out.stdout).trim();
  if (!token || token.length < 20) throw new Error('minted token looks empty: ' + token.length + ' chars');
  return token;
}

async function main() {
try {
  token = await mintToken();




// ── the gate must still be ON after the probe ───────────────────────────────
{
  const anon = await fetch(BASE + '/api/design/systems');
  check('tokenless catalog read is refused (gate stays ON)', anon.status === 401, 'status ' + anon.status);
}

// ── the catalog answers the directory + carries the taxonomy ─────────────────
{
  const res = await api('/api/design/systems');
  check('GET /api/design/systems is 200', res.status === 200, 'status ' + res.status);
  const s = res.body?.systems;
  check('the response carries a systems array', Array.isArray(s), JSON.stringify(res.body).slice(0, 160));
  check('the response carries a count', typeof res.body?.count === 'number');
  check('the response declares its source (catalog|bundled)', ['catalog', 'bundled'].includes(res.body?.source), String(res.body?.source));
  check('the taxonomy ships for the grouped picker', Array.isArray(res.body?.categories) && res.body.categories.length > 0);
  const first = Array.isArray(s) ? s[0] : null;
  check(
    'every row carries id/label/category/description',
    !!first && typeof first.id === 'string' && typeof first.label === 'string' && typeof first.category === 'string' && 'description' in first,
  );
  check('no row claims to be catalog-origin while source=bundled', res.body?.source === 'catalog' || s.every((r) => r.origin === 'bundled'));
  console.log('  catalog source=' + res.body?.source + ' count=' + res.body?.count);
}

// ── install a real package, then activate it into a throwaway project ──────
// Unique per run: a crashed earlier probe leaves an installed package behind,
// and a fixed id would make the next run answer 409 instead of measuring.
work = await mkdtemp(join(tmpdir(), 'lokma-req191-'));
PKG_ID = 'probepkg-' + Date.now().toString(36);
const pkgDir = join(work, PKG_ID);
const projDir = join(work, 'probe-project');
await mkdir(pkgDir, { recursive: true });
await mkdir(projDir, { recursive: true });
await writeFile(join(pkgDir, 'manifest.json'), JSON.stringify({ id: PKG_ID, name: 'Probe Brand', category: 'Fintech' }), 'utf-8');
await writeFile(join(pkgDir, 'tokens.css'), ':root{--probe-brand:#0af00f}', 'utf-8');
await writeFile(join(pkgDir, 'DESIGN.md'), '# Probe Brand\n\n## one\n## two\n', 'utf-8');

{
  const res = await api('/api/design/systems', {
    method: 'POST',
    body: JSON.stringify({ source: pkgDir }),
  });
  check('POST install from a local package is 200', res.status === 200, 'status ' + res.status + ' ' + JSON.stringify(res.body).slice(0, 160));
  check('install echoes the package id', res.body?.id === PKG_ID, String(res.body?.id));

  const again = await api('/api/design/systems', { method: 'POST', body: JSON.stringify({ source: pkgDir }) });
  check('installing the same id twice is 409', again.status === 409, 'status ' + again.status);

  const listed = await api('/api/design/systems');
  const row = (listed.body?.systems || []).find((r) => r.id === PKG_ID);
  check('the installed package is listed from the directory', !!row);
  check('the installed row is catalog-origin', row?.origin === 'catalog', String(row?.origin));
  check('the installed row kept its taxonomy group', row?.category === 'Fintech', String(row?.category));
  check('the installed row reports its files', Array.isArray(row?.files) && row.files.includes('tokens.css'));
}

// ── SSRF: refused BEFORE git is reached ─────────────────────────────────────
for (const bad of ['https://127.0.0.1/pkg', 'https://169.254.169.254/latest/meta-data', 'http://example.com/pkg']) {
  const res = await api('/api/design/systems', { method: 'POST', body: JSON.stringify({ source: bad }) });
  check('install refuses ' + bad, res.status === 400, 'status ' + res.status);
}

// ── activation writes the brand files into the project ──────────────────────
{
  const res = await api('/api/design/systems/' + PKG_ID + '/use', {
    method: 'POST',
    body: JSON.stringify({ cwd: projDir }),
  });
  check('POST use is 200', res.status === 200, 'status ' + res.status + ' ' + JSON.stringify(res.body).slice(0, 160));
  check('use copies DESIGN.md + tokens.css', Array.isArray(res.body?.copied) && res.body.copied.length === 2, JSON.stringify(res.body?.copied));

  // The proof that matters: the guard — the real production reader — now
  // sees the activated package.
  const guard = await api('/api/design/guard?cwd=' + encodeURIComponent(projDir));
  check('the design guard now sees the activated DESIGN.md', guard.body?.guard?.present === true, JSON.stringify(guard.body?.guard).slice(0, 160));
  const tokens = await readFile(join(projDir, '.lokma', 'tokens.css'), 'utf-8');
  check('the activated tokens.css is on disk', tokens.includes('#0af00f'));
}

{
  const bad = await api('/api/design/systems/no-such-system/use', { method: 'POST', body: JSON.stringify({ cwd: projDir }) });
  check('activating an unknown system is 404', bad.status === 404, 'status ' + bad.status);
  const trav = await api('/api/design/systems/..%2Fescape/use', { method: 'POST', body: JSON.stringify({ cwd: projDir }) });
  check('activating a traversal id is refused', trav.status === 400 || trav.status === 404, 'status ' + trav.status);
}


} finally {
  await cleanup().catch((e) => console.error('CLEANUP ERROR: ' + (e && e.message ? e.message : String(e))));
}
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('PROBE ERROR: ' + (e && e.message ? e.message : String(e)));
  process.exit(1);
});