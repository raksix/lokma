#!/usr/bin/env node
/**
 * REQ-190 - live probe: a tweak edits an artifact IN PLACE and is reversible.
 *
 * The Design Studio could only ever produce a NEW artifact from a brief,
 * so "make the button terracotta" meant rewriting the whole brief. This
 * probe drives the DEPLOYED server over HTTP and asserts the version
 * ledger contract end to end:
 *
 *   health  /health answers 200
 *   A  seed an artifact with the offline-template sentinel (origin=generate)
 *      -> the ledger already holds v1; the list holds exactly one id
 *   B  the history endpoint reports v1 + its sha, and that sha equals the
 *      body's own sha (detail and history agree on one lock token)
 *   C  a manual Code-tab edit appends an `edit` version: same id, list
 *      still one, history grows, archived body of v1 lands on disk under
 *      versions/<sha8>.html and is byte-identical to v1
 *   D  the optimistic lock: PUT with a STALE sha is refused 409
 *      `stale_version` and the stored body does NOT change; the same PUT
 *      with the current sha succeeds (a lock that refuses everything would
 *      be as broken as one that never fires)
 *   E  a tweak with no note is refused 400 `bad_tweak` and burns no
 *      model call; a tweak on the offline template is refused 400
 *      `tweak_no_model` for the same reason — neither creates a version
 *   F  revert restores the earlier body: the canvas goes back to v1's exact
 *      bytes, and the revert is APPENDED (history grows, nothing destroyed),
 *      so redo = revert forward
 *   G  an unknown version 404s and a non-integer version 400s; both leave
 *      the current body untouched (honest errors, no silent no-op)
 *   H  a deleted archived body is reported 409 `version_body_missing` and
 *      the artifact still renders its current body (ledger survives)
 *   I  cleanup: the artifact is deleted, the scoped list is empty again,
 *      the temp tree is gone, and tokenless /api/auth/me is still 401
 *
 * Cost: the ONLY real model path (an actual tweak) is deliberately NOT
 * driven here — the probe must stay deterministic and free, so it proves
 * the SURFACE (ledger, lock, revert, honest errors) on the seeded offline
 * artifact and asserts the metered path is refused rather than faked.
 * probe-design-real-model owns a real metered run.
 *
 * Run:
 *   node scripts/probe-design-tweak-versions.cjs --token-file /tmp/lokma-e2e-token
 *
 * Evidence: /tmp/lokma-req190/summary.json
 */
'use strict';
const { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');

function argOf(name, dflt) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const BASE = argOf('--url', 'http://127.0.0.1:3456');
const TOKEN = readFileSync(argOf('--token-file', '/tmp/lokma-e2e-token'), 'utf8').trim();
const OUT = argOf('--out', '/tmp/lokma-req190');
const PROJ = join(OUT, 'proj');
const MARK = 'TweakVersionProbe landing page';

let passed = 0;
const EXPECTED = 52;
let cleaned = false;
let created = [];
const evidence = {};

function check(cond, label) {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS [' + passed + '/' + EXPECTED + '] ' + label);
}
function info(k, v) {
  console.log('INFO: ' + k + ' = ' + v);
}
function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

async function api(path, method, body) {
  const headers = { Authorization: 'Bearer ' + TOKEN };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method: method || 'GET',
    headers: headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = null;
  }
  return { status: res.status, json: json };
}

function withCwd(path, cwd) {
  return path + (path.indexOf('?') >= 0 ? '&' : '?') + 'cwd=' + encodeURIComponent(cwd);
}
function listIds(json) {
  return ((json && json.items) || []).map(function (i) {
    return i.id;
  });
}
function artifactDir(id) {
  return join(PROJ, '.lokma', 'design', 'artifacts', id);
}
function versionFile(id, sha) {
  return join(artifactDir(id), 'versions', sha.slice(0, 8) + '.html');
}

function setup() {
  rmSync(PROJ, { recursive: true, force: true });
  mkdirSync(PROJ, { recursive: true });
}

async function bestEffortCleanup() {
  if (cleaned) return;
  cleaned = true;
  for (const id of created) {
    try {
      await api(withCwd('/api/design/' + id, PROJ), 'DELETE');
    } catch (e) {
      console.log('CLEANUP: delete ' + id + ' failed (best effort)');
    }
  }
  rmSync(PROJ, { recursive: true, force: true });
  console.log('CLEANUP(best-effort): probe artifacts + temp tree removed');
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  setup();

  const health = await fetch(BASE + '/health', { signal: AbortSignal.timeout(15000) });
  check(health.status === 200, 'health: /health answers 200');

  // ── A. seed ──────────────────────────────────────────────────────────────
  const gen = await api('/api/design/generate', 'POST', {
    type: 'prototype',
    brief: MARK,
    model: 'offline-template',
    cwd: PROJ,
  });
  check(gen.status === 200 && gen.json && gen.json.ok === true, 'A: seed generate answers 200');
  const id = gen.json.id;
  created = [id];
  info('artifact_id', id);
  check(id.indexOf('/') < 0 && id.indexOf('..') < 0, 'A: the id is a single safe path segment');

  const listA = await api(withCwd('/api/design/list', PROJ), 'GET');
  check(listA.status === 200 && listIds(listA.json).length === 1, 'A: the scoped list holds exactly one artifact');
  check(listIds(listA.json)[0] === id, 'A: the list shows the seeded id');

  // ── B. history agrees with the body ──────────────────────────────────────
  const detail0 = await api(withCwd('/api/design/' + id, PROJ), 'GET');
  check(detail0.status === 200 && typeof detail0.json.sha === 'string', 'B: detail carries a sha lock token');
  check(detail0.json.currentVersion === 1, 'B: the seeded artifact is at v1 (generation is version 1)');

  const hist0 = await api(withCwd('/api/design/' + id + '/versions', PROJ), 'GET');
  check(hist0.status === 200 && hist0.json.ok === true, 'B: the history endpoint answers 200');
  check(Array.isArray(hist0.json.versions) && hist0.json.versions.length === 1, 'B: generation seeded exactly one ledger entry');
  check(hist0.json.versions[0].origin === 'generate', "B: v1's origin is 'generate'");
  check(hist0.json.currentVersion === 1, 'B: the history reports v1 as current');
  check(hist0.json.sha === detail0.json.sha, 'B: history and detail agree on one sha (single lock token)');
  check(hist0.json.versions[0].sha === detail0.json.sha, "B: v1's recorded sha IS the live body sha");

  const shaV1 = detail0.json.sha;
  evidence.sha_v1 = shaV1;

  // ── C. a manual edit appends, archives the old body, keeps the id ────────
  const editedHtml = detail0.json.html.replace('<h1', '<h1 data-probe="edit"');
  check(editedHtml !== detail0.json.html, 'C: the edited body really differs from v1');

  const put1 = await api('/api/design/' + id, 'PUT', {
    html: editedHtml,
    cwd: PROJ,
    expectedSha: shaV1,
  });
  check(put1.status === 200 && put1.json.ok === true, 'C: a Code-tab edit with the current sha answers 200');
  check(put1.json.currentVersion === 2, 'C: the edit landed as v2 (same artifact, next version)');
  check(typeof put1.json.sha === 'string' && put1.json.sha !== shaV1, 'C: the write answers a fresh sha for the next lock');
  check(put1.json.manifest.versions.length === 2, 'C: the manifest ledger holds two entries');
  check(put1.json.manifest.versions[1].origin === 'edit', "C: v2's origin is 'edit'");

  const listB = await api(withCwd('/api/design/list', PROJ), 'GET');
  check(listIds(listB.json).length === 1 && listIds(listB.json)[0] === id, 'C: the list did NOT grow — the edit kept the id');

  const v2Sha = put1.json.sha;
  check(existsSync(versionFile(id, shaV1)), 'C: v1 body was archived to versions/<sha8>.html before the overwrite');
  check(readFileSync(versionFile(id, shaV1), 'utf8') === detail0.json.html, 'C: the archived v1 body is byte-identical to the original');

  // ── D. the lock actually refuses a stale write ───────────────────────────
  const stale = await api('/api/design/' + id, 'PUT', {
    html: detail0.json.html + '<!--stale-probe-->',
    cwd: PROJ,
    expectedSha: shaV1,
  });
  check(stale.status === 409 && stale.json && stale.json.code === 'stale_version', 'D: a stale-sha write is refused 409 stale_version');
  const afterStale = await api(withCwd('/api/design/' + id, PROJ), 'GET');
  check(afterStale.json.sha === v2Sha, 'D: the refused write did NOT change the stored body');
  check(afterStale.json.currentVersion === 2, 'D: the refused write created no version');

  const freshPut = await api('/api/design/' + id, 'PUT', {
    html: afterStale.json.html.replace('<h1', '<h1 data-probe="edit2"'),
    cwd: PROJ,
    expectedSha: v2Sha,
  });
  check(freshPut.status === 200, 'D: the same PUT with the CURRENT sha succeeds (the lock is not just refusing)');

  // ── E. the metered path is refused, never faked ───────────────────────────
  const noNote = await api('/api/design/' + id + '/tweak', 'POST', { note: '', cwd: PROJ });
  check(noNote.status === 400 && noNote.json && noNote.json.code === 'bad_tweak', 'E: an empty tweak note is refused 400 bad_tweak');
  const blankNote = await api('/api/design/' + id + '/tweak', 'POST', { note: '   ', cwd: PROJ });
  check(blankNote.status === 400 && blankNote.json.code === 'bad_tweak', 'E: a whitespace-only note is refused too');

  const afterRefusals = await api(withCwd('/api/design/' + id, PROJ), 'GET');
  check(afterRefusals.json.currentVersion === 3, 'E: neither refusal created a version (no metered call, no write)');

  const noModel = await api('/api/design/' + id + '/tweak', 'POST', {
    note: 'make the button terracotta',
    model: 'offline-template',
    cwd: PROJ,
  });
  check(
    noModel.status === 400 && noModel.json && noModel.json.code === 'tweak_no_model',
    'E: a tweak on the offline template is refused 400 tweak_no_model (never a fake patch)',
  );

  // ── F. revert restores the earlier body, destructively-free ───────────────
  const beforeRevert = await api(withCwd('/api/design/' + id, PROJ), 'GET');
  const revert = await api('/api/design/' + id + '/revert', 'POST', { version: 1, cwd: PROJ });
  check(revert.status === 200 && revert.json.ok === true, 'F: revert to v1 answers 200');
  check(revert.json.restoredFrom === 1, 'F: the revert reports which version it restored');
  check(revert.json.currentVersion === 4, 'F: the revert was APPENDED as v4 — nothing was destroyed');

  const afterRevert = await api(withCwd('/api/design/' + id, PROJ), 'GET');
  check(afterRevert.json.html === detail0.json.html, 'F: the canvas is byte-identical to v1 again');
  check(afterRevert.json.sha === shaV1, 'F: the restored body hashes back to v1 (the picker key stays stable)');
  check(afterRevert.json.currentVersion === 4, 'F: the current version is the revert entry, not v1');

  const histF = await api(withCwd('/api/design/' + id + '/versions', PROJ), 'GET');
  check(histF.json.versions.length === 4, 'F: the ledger holds all four entries (redo = revert forward)');
  check(histF.json.versions[3].origin === 'revert', "F: v4's origin is 'revert'");
  check(histF.json.versions[0].origin === 'generate', 'F: v1 is still readable — revert did not overwrite history');

  const listF = await api(withCwd('/api/design/list', PROJ), 'GET');
  check(listIds(listF.json).length === 1, 'F: after a revert the list still holds exactly one artifact');

  // ── G. honest errors on bad version targets ──────────────────────────────
  const missing = await api('/api/design/' + id + '/revert', 'POST', { version: 99, cwd: PROJ });
  check(missing.status === 404 && missing.json.code === 'version_not_found', 'G: an unknown version is refused 404 version_not_found');
  const notInt = await api('/api/design/' + id + '/revert', 'POST', { version: '1', cwd: PROJ });
  check(notInt.status === 400 && notInt.json.code === 'bad_version', 'G: a non-integer version is refused 400 bad_version');

  const afterBad = await api(withCwd('/api/design/' + id, PROJ), 'GET');
  check(afterBad.json.sha === afterRevert.json.sha, 'G: neither bad revert changed the current body');

  // ── H. a deleted archived body is reported, not silently emptied ─────────
  const rmTarget = versionFile(id, shaV1);
  const backup = readFileSync(rmTarget, 'utf8');
  rmSync(rmTarget, { force: true });
  const missingBody = await api('/api/design/' + id + '/revert', 'POST', { version: 1, cwd: PROJ });
  check(
    missingBody.status === 409 && missingBody.json.code === 'version_body_missing',
    'H: a revert to a body with no stored file is refused 409 version_body_missing',
  );
  const afterMissing = await api(withCwd('/api/design/' + id, PROJ), 'GET');
  check(afterMissing.json.sha === afterRevert.json.sha, 'H: the artifact is unchanged after the honest refusal');
  check(afterMissing.json.html === afterRevert.json.html, 'H: the live body survived the failed revert');
  writeFileSync(rmTarget, backup); // restore so cleanup removes a real tree

  const archived = existsSync(join(artifactDir(id), 'versions'))
    ? readdirSync(join(artifactDir(id), 'versions'))
    : [];
  evidence.archived_bodies = archived.length;
  check(archived.length >= 1, 'H: archived bodies live under versions/ (one file per retired version)');

  // ── I. cleanup, and the gate is still shut ───────────────────────────────
  const del = await api(withCwd('/api/design/' + id, PROJ), 'DELETE');
  check(del.status === 200 && del.json.ok === true, 'I: the probe artifact deletes');
  created = [];
  const gone = await api(withCwd('/api/design/' + id, PROJ), 'GET');
  check(gone.status === 404, 'I: the deleted artifact 404s afterwards (the delete really landed)');
  const listEnd = await api(withCwd('/api/design/list', PROJ), 'GET');
  check(listIds(listEnd.json).length === 0, 'I: the scoped list is empty again');

  const noAuth = await fetch(BASE + '/api/auth/me', { signal: AbortSignal.timeout(15000) });
  check(noAuth.status === 401, 'I: tokenless /api/auth/me is still 401 (the login gate stayed ON)');

  rmSync(PROJ, { recursive: true, force: true });
  check(!existsSync(PROJ), 'I: the probe temp tree is gone');

  evidence.passed = passed;
  evidence.expected = EXPECTED;
  evidence.cleanup = 'artifact deleted, list empty, temp tree removed';
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(evidence, null, 2));
  console.log('\nDESIGN TWEAK/VERSIONS PROBE: ' + passed + ' passed, 0 failed');
  console.log('EVIDENCE: ' + join(OUT, 'summary.json'));
}

main().then(
  () => process.exit(0),
  async (e) => {
    console.error('\n' + (e && e.message ? e.message : String(e)));
    console.error('RESULT: FAILED at check ' + (passed + 1) + '/' + EXPECTED);
    await bestEffortCleanup();
    process.exit(1);
  },
);