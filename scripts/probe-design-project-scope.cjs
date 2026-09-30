#!/usr/bin/env node
/**
 * REQ-178 - live probe: Design artifacts are scoped to the selected project.
 *
 * The Design Studio used to write every artifact into ONE global directory
 * (homedir/.lokma/design/artifacts) and no route asked which project the
 * design belonged to ("design de proje secme falan da yok"). This probe
 * drives the DEPLOYED server over HTTP with two throwaway projects and
 * asserts the whole scope contract:
 *
 *   health  /health answers 200
 *   A  generate in project A: manifest carries the project; artifact.json
 *      + artifact.html land under <A>/.lokma/design/artifacts/<id>/; the
 *      global root stays untouched
 *   B  same for project B - the two ids and roots are distinct
 *   C  list is scoped: A's list shows id_a only, B's list id_b only, and
 *      the global (cwd-less) list shows NEITHER - the pools are separate
 *   D  detail is scoped too: the right cwd answers 200, the wrong project
 *      and the global scope answer 404 for the same id
 *   E  the DESIGN.md guard reads the SELECTED project (A has an 8-section
 *      DESIGN.md -> ok; B has none -> present:false)
 *   F  bad cwd args stay honest: relative -> 400 bad_cwd, missing -> 404
 *      cwd_not_found, a file -> 400 not_a_directory
 *   G  delete is scoped and isolated: wrong cwd 404s, the right cwd
 *      removes A's artifact only - B keeps its own
 *   H  cleanup: B removed, both scopes empty, temp trees gone, the global
 *      root still free of both probe ids
 *
 * Generation rides the explicit offline-template sentinel: this probe
 * proves STORAGE SCOPING, not model quality (probe-design-real-model owns
 * that) - so it never bills an upstream call and stays deterministic.
 *
 * Run:
 *   node scripts/probe-design-project-scope.cjs --token-file /tmp/lokma-e2e-token
 *
 * Evidence: /tmp/lokma-req178/{a-manifest.json,b-manifest.json,summary.json}
 */
'use strict';
const { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { homedir } = require('node:os');

function argOf(name, dflt) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const BASE = argOf('--url', 'http://127.0.0.1:3456');
const TOKEN = readFileSync(argOf('--token-file', '/tmp/lokma-e2e-token'), 'utf8').trim();
const OUT = argOf('--out', '/tmp/lokma-req178');
const HOME_DIR = argOf('--home', homedir());
const GLOBAL_ROOT = join(HOME_DIR, '.lokma', 'design', 'artifacts');
const PROJ_A = join(OUT, 'proj-a');
const PROJ_B = join(OUT, 'proj-b');
const MARK_A = 'ScopeProof Alpha landing page';
const MARK_B = 'ScopeProof Beta dashboard';

let passed = 0;
const EXPECTED = 31;
let cleaned = false;
const created = [];

function check(cond, label) {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS [' + passed + '/' + EXPECTED + '] ' + label);
}
function info(k, v) {
  console.log('INFO: ' + k + ' = ' + v);
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
  return ((json && json.items) || []).map(function (i) { return i.id; });
}
function artifactDir(project, id) {
  return join(project, '.lokma', 'design', 'artifacts', id);
}

function setupProjects() {
  rmSync(PROJ_A, { recursive: true, force: true });
  rmSync(PROJ_B, { recursive: true, force: true });
  mkdirSync(join(PROJ_A, '.lokma'), { recursive: true });
  mkdirSync(PROJ_B, { recursive: true });
  const sections = ['Colors', 'Typography', 'Spacing', 'Borders', 'Motion', 'Components', 'Voice', 'Surfaces'];
  const lines = ['# DESIGN.md - probe project A', ''];
  for (const s of sections) {
    lines.push('## ' + s);
    lines.push('Probe section for ' + s.toLowerCase() + '.');
    lines.push('');
  }
  writeFileSync(join(PROJ_A, '.lokma', 'DESIGN.md'), lines.join('\n'));
}

async function bestEffortCleanup() {
  if (cleaned) return;
  cleaned = true;
  for (const item of created) {
    try {
      await api(withCwd('/api/design/' + item.id, item.cwd), 'DELETE');
    } catch (e) {
      console.log('CLEANUP: delete ' + item.id + ' failed (best effort)');
    }
  }
  rmSync(PROJ_A, { recursive: true, force: true });
  rmSync(PROJ_B, { recursive: true, force: true });
  console.log('CLEANUP(best-effort): probe artifacts + temp trees removed');
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  setupProjects();
  info('base', BASE);
  info('project A', PROJ_A);
  info('project B', PROJ_B);
  info('global root', GLOBAL_ROOT);

  try {
    const health = await api('/health');
    check(health.status === 200, 'server /health answers 200');

    // ---- A: generate in project A -------------------------------------
    const genA = await api('/api/design/generate', 'POST', {
      type: 'prototype',
      brief: MARK_A,
      model: 'offline-template',
      cwd: PROJ_A,
    });
    check(genA.status === 200 && genA.json && genA.json.ok === true, 'A: generate in project A answers 200');
    const idA = genA.json.id;
    created.push({ id: idA, cwd: PROJ_A });
    info('id_a', idA);
    check(!!(genA.json.manifest && genA.json.manifest.project === PROJ_A), 'A: manifest records the project cwd');
    check(
      existsSync(join(artifactDir(PROJ_A, idA), 'artifact.json')) &&
        existsSync(join(artifactDir(PROJ_A, idA), 'artifact.html')),
      'A: files land under <A>/.lokma/design/artifacts/<id>/',
    );
    check(!existsSync(join(GLOBAL_ROOT, idA)), 'A: the global root stays untouched');

    // ---- B: generate in project B -------------------------------------
    const genB = await api('/api/design/generate', 'POST', {
      type: 'deck',
      brief: MARK_B,
      model: 'offline-template',
      cwd: PROJ_B,
    });
    check(genB.status === 200 && genB.json && genB.json.ok === true, 'B: generate in project B answers 200');
    const idB = genB.json.id;
    created.push({ id: idB, cwd: PROJ_B });
    info('id_b', idB);
    check(idB !== idA, 'B: the two artifacts have distinct ids');
    check(!!(genB.json.manifest && genB.json.manifest.project === PROJ_B), 'B: manifest records project B');
    check(
      existsSync(join(artifactDir(PROJ_B, idB), 'artifact.json')) &&
        existsSync(join(artifactDir(PROJ_B, idB), 'artifact.html')),
      'B: files land under <B>/.lokma/design/artifacts/<id>/',
    );
    check(!existsSync(join(GLOBAL_ROOT, idB)), 'B: the global root stays untouched');

    // Evidence copies (manifests) - taken before any deletion.
    const detA = await api(withCwd('/api/design/' + idA, PROJ_A));
    const detB = await api(withCwd('/api/design/' + idB, PROJ_B));
    writeFileSync(join(OUT, 'a-manifest.json'), JSON.stringify(detA.json && detA.json.manifest, null, 2));
    writeFileSync(join(OUT, 'b-manifest.json'), JSON.stringify(detB.json && detB.json.manifest, null, 2));

    // ---- C: list scoping ----------------------------------------------
    const listA = await api(withCwd('/api/design/list', PROJ_A));
    check(
      listA.status === 200 &&
        listA.json.project === PROJ_A &&
        listA.json.root === join(PROJ_A, '.lokma', 'design', 'artifacts'),
      'C: list?cwd=A echoes the project + its own root',
    );
    check(listIds(listA.json).indexOf(idA) >= 0 && listIds(listA.json).indexOf(idB) < 0, 'C: A list shows id_a, never id_b');
    const listB = await api(withCwd('/api/design/list', PROJ_B));
    check(listIds(listB.json).indexOf(idB) >= 0 && listIds(listB.json).indexOf(idA) < 0, 'C: B list shows id_b, never id_a');
    const listAll = await api('/api/design/list');
    check(
      listAll.status === 200 && listAll.json.project === null && listAll.json.root === GLOBAL_ROOT,
      'C: the global list reports project null + the global root',
    );
    check(
      listIds(listAll.json).indexOf(idA) < 0 && listIds(listAll.json).indexOf(idB) < 0,
      'C: the global list shows neither probe artifact (pools are separate)',
    );
    info('list counts', 'A=' + listA.json.count + ' B=' + listB.json.count + ' global=' + listAll.json.count);

    // ---- D: detail scoping --------------------------------------------
    check(
      detA.status === 200 && typeof detA.json.html === 'string' && detA.json.html.indexOf('<') >= 0,
      'D: detail with the right cwd answers 200 + html',
    );
    const wrongScope = await api(withCwd('/api/design/' + idA, PROJ_B));
    check(
      wrongScope.status === 404 && wrongScope.json && wrongScope.json.code === 'design_not_found',
      'D: detail under the WRONG project answers 404 design_not_found',
    );
    const noScope = await api('/api/design/' + idA);
    check(noScope.status === 404 && noScope.json && noScope.json.code === 'design_not_found', 'D: detail with no cwd (global) is 404');

    // ---- E: guard reads the selected project ---------------------------
    const guardA = await api(withCwd('/api/design/guard', PROJ_A));
    check(
      guardA.status === 200 &&
        guardA.json.guard.present === true &&
        guardA.json.guard.ok === true &&
        guardA.json.guard.h2Count >= 7 &&
        guardA.json.guard.cwd === PROJ_A,
      'E: guard?cwd=A reads A DESIGN.md (present, ok, >=7 H2)',
    );
    const guardB = await api(withCwd('/api/design/guard', PROJ_B));
    check(
      guardB.status === 200 && guardB.json.guard.present === false && guardB.json.guard.ok === false,
      'E: guard?cwd=B reports no DESIGN.md (present:false)',
    );

    // ---- F: cwd argument validation ------------------------------------
    const relCwd = await api(withCwd('/api/design/list', 'relative/nope'));
    check(relCwd.status === 400 && relCwd.json && relCwd.json.code === 'bad_cwd', 'F: relative cwd -> 400 bad_cwd');
    const missing = join(OUT, 'missing-project-dir');
    const missCwd = await api(withCwd('/api/design/list', missing));
    check(
      missCwd.status === 404 && missCwd.json && missCwd.json.code === 'cwd_not_found',
      'F: missing project dir -> 404 cwd_not_found',
    );
    const fileCwd = await api(withCwd('/api/design/list', __filename));
    check(
      fileCwd.status === 400 && fileCwd.json && fileCwd.json.code === 'not_a_directory',
      'F: a file as cwd -> 400 not_a_directory',
    );

    // ---- G: delete scoping + isolation ----------------------------------
    const delWrong = await api(withCwd('/api/design/' + idA, PROJ_B), 'DELETE');
    check(
      delWrong.status === 404 && delWrong.json && delWrong.json.code === 'design_not_found',
      'G: delete under the wrong project answers 404',
    );
    const delA = await api(withCwd('/api/design/' + idA, PROJ_A), 'DELETE');
    check(delA.status === 200 && delA.json && delA.json.ok === true, 'G: delete with the right cwd answers 200');
    const listA2 = await api(withCwd('/api/design/list', PROJ_A));
    check(
      !existsSync(artifactDir(PROJ_A, idA)) && listIds(listA2.json).indexOf(idA) < 0,
      'G: id_a is gone from disk AND from A list',
    );
    const listB2 = await api(withCwd('/api/design/list', PROJ_B));
    check(
      existsSync(join(artifactDir(PROJ_B, idB), 'artifact.json')) && listIds(listB2.json).indexOf(idB) >= 0,
      'G: B is untouched by A deletion (isolation holds)',
    );

    // ---- H: cleanup -----------------------------------------------------
    const delB = await api(withCwd('/api/design/' + idB, PROJ_B), 'DELETE');
    check(delB.status === 200 && delB.json && delB.json.ok === true, 'H: delete project B artifact answers 200');
    const listA3 = await api(withCwd('/api/design/list', PROJ_A));
    const listB3 = await api(withCwd('/api/design/list', PROJ_B));
    check(
      listA3.status === 200 && listA3.json.count === 0 && listB3.status === 200 && listB3.json.count === 0,
      'H: both scopes are empty (200 + count 0) after cleanup',
    );
    rmSync(PROJ_A, { recursive: true, force: true });
    rmSync(PROJ_B, { recursive: true, force: true });
    cleaned = true;
    check(!existsSync(PROJ_A) && !existsSync(PROJ_B), 'H: the temp project trees are removed');
    const listAll3 = await api('/api/design/list');
    check(
      listIds(listAll3.json).indexOf(idA) < 0 && listIds(listAll3.json).indexOf(idB) < 0,
      'H: the global root carries neither probe id (clean)',
    );

    writeFileSync(
      join(OUT, 'summary.json'),
      JSON.stringify(
        {
          ok: true,
          passed: passed,
          expected: EXPECTED,
          idA: idA,
          idB: idB,
          projectA: PROJ_A,
          projectB: PROJ_B,
          globalRoot: GLOBAL_ROOT,
          listCounts: { a: listA.json.count, b: listB.json.count, globalBefore: listAll.json.count, globalAfter: listAll3.json.count },
          finishedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    console.log('SUMMARY: ' + passed + '/' + EXPECTED + ' checks PASS - evidence in ' + OUT);
    if (passed !== EXPECTED) throw new Error('FAIL: ran ' + passed + ' checks, expected ' + EXPECTED);
  } finally {
    await bestEffortCleanup();
  }
}

main().catch(function (err) {
  console.error(String((err && err.stack) || err));
  process.exit(1);
});
