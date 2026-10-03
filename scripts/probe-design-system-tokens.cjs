#!/usr/bin/env node
/**
 * REQ-191 slice 3 — live probe for the DESIGN TOKEN hand-off and the CLI.
 *
 * Slices 1/2 proved the catalog scans, installs, activates and REACHES the
 * picker's rows. The acceptance criterion that was still unproven is:
 *
 *   "Üretimde o sistemin token'ları HTML'e giriyor" — the package's own
 *   `tokens.css` must arrive at the REAL model call.
 *
 * Nothing measured that: `resolveSystemTokens()` was unit-tested and the
 * store's `await` was read, but "the prompt builder accepts a resolved
 * object" is not "the deployed process sends those tokens to the upstream".
 * A green unit probe cannot tell a wired call from an ignored argument.
 *
 * So this probe drives the DEPLOYED server against an ephemeral capture stub:
 * a provider whose baseUrl points at a local HTTP server that records the
 * system message and answers with a canned HTML document. Zero model cost,
 * deterministic, and the assertion is made on the bytes the SERVER sent.
 *
 * A negative control runs too: the same generate with a bundled preset that
 * has no package must send that preset's own palette — proving the assertion
 * is reading the send path and not a constant.
 *
 * Plus the CLI half (`lokma design system list|add|use`, Docs/34 §5.1),
 * which had no coverage at all.
 *
 * Run from the repo root with the API up (lokma-server :3456):
 *   node scripts/probe-design-system-tokens.cjs [--base http://127.0.0.1:3456]
 *
 * The login gate stays ON — a superadmin Bearer is minted, never the gate
 * flipped. Everything created (provider, package, project, artifact) is
 * deleted afterwards, with a stays-gone re-check.
 */
'use strict';
const http = require('node:http');
const { mkdtemp, mkdir, writeFile, rm, readdir } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { tmpdir, homedir } = require('node:os');
const { join } = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const BASE = (baseIdx >= 0 && args[baseIdx + 1]) || process.env.LOKMA_BASE || 'http://127.0.0.1:3456';
const TOKEN_FILE = '/tmp/lokma-req191-token.sh';
const REPO = join(__dirname, '..');

// Module scope on purpose: cleanup() runs from the finally block and a throw
// before these were assigned would leak a temp dir + an installed package.
let work = null;
let PKG_ID = null;
// The CLI-installed package gets its OWN id, so cleanup removes both even
// when a throw lands between the two installs.
let CLI_PKG_ID = null;
let PROVIDER_ID = null;
let token = null;
let stub = null;

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

async function api(pathname, init = {}) {
  const res = await fetch(BASE + pathname, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { _raw: text.slice(0, 200) };
  }
  return { status: res.status, body };
}

async function mintToken() {
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
  const t = String(out.stdout).trim();
  if (!t || t.length < 20) throw new Error('minted token looks empty: ' + t.length + ' chars');
  return t;
}

/** The capture stub: records every chat request's system+user messages. */
function startStub() {
  const seen = [];
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url.includes('/chat/completions')) {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let parsed = {};
        try {
          parsed = JSON.parse(body || '{}');
        } catch {}
        seen.push({
          model: parsed.model,
          system: (parsed.messages || []).find((m) => m.role === 'system')?.content ?? '',
          user: (parsed.messages || []).find((m) => m.role === 'user')?.content ?? '',
        });
        const html =
          '<!doctype html><html><head><style>:root{--x:1}</style></head><body><h1>captured</h1></body></html>';
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(
          'data: ' +
            JSON.stringify({
              choices: [{ index: 0, delta: { content: html }, finish_reason: null }],
            }) +
            '\n\n',
        );
        res.write(
          'data: ' +
            JSON.stringify({
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            }) +
            '\n\n',
        );
        res.write('data: [DONE]\n\n');
        res.end();
      });
      return;
    }
    // /models and anything else: answer politely so a catalog merge during
    // the probe window does not paint the provider red.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'capture-model' }] }));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, seen, port: server.address().port });
    });
  });
}

async function cleanup() {
  const sysRoot = join(homedir(), '.lokma', 'design', 'systems');
  if (PKG_ID) await rm(join(sysRoot, PKG_ID), { recursive: true, force: true });
  if (CLI_PKG_ID) await rm(join(sysRoot, CLI_PKG_ID), { recursive: true, force: true });
  if (work) await rm(work, { recursive: true, force: true });
  if (stub) {
    await new Promise((r) => stub.server.close(r));
    stub = null;
  }
  if (PROVIDER_ID) {
    // A bodyless request with a JSON content-type is a Fastify 400
    // (FST_ERR_CTP_EMPTY_JSON_BODY), NOT a delete — that is why the provider
    // survived the first cleanup run. Send an explicit empty object.
    await api('/api/providers/' + PROVIDER_ID, { method: 'DELETE', body: '{}' }).catch(() => {});
  }
  // Stays-gone: an in-flight write can resurrect either the provider or the
  // package on the next read, and "cleanup ran" is not "cleanup worked".
  if (PKG_ID) {
    for (let i = 0; i < 3; i++) {
      const listed = await api('/api/design/systems');
      if (!(listed.body?.systems || []).some((r) => r.id === PKG_ID)) break;
      await rm(join(sysRoot, PKG_ID), { recursive: true, force: true });
    }
    check('the probe package is gone from the catalog (cleanup verified)', !existsSync(join(sysRoot, PKG_ID)));
  }
  if (PROVIDER_ID) {
    for (let i = 0; i < 3; i++) {
      const res = await api('/api/providers');
      const still = (res.body?.providers || []).some((p) => p.id === PROVIDER_ID);
      if (!still) break;
      await api('/api/providers/' + PROVIDER_ID, { method: 'DELETE', body: '{}' }).catch(() => {});
    }
    const res = await api('/api/providers');
    check(
      'the probe provider is gone (cleanup verified)',
      !(res.body?.providers || []).some((p) => p.id === PROVIDER_ID),
    );
  }
  // The catalog must be honest AGAIN once everything is gone: an empty
  // directory falls back to `bundled`, and only then does the CLI print the
  // built-in presets with their `(preset)` marker. This lives in cleanup()
  // because it is only true AFTER the package dir is removed — asserting it
  // in main() (before cleanup ran) measured the state the probe created.
  {
    const res = await api('/api/design/systems');
    check(
      'the catalog falls back to bundled once the package is gone',
      res.body?.source === 'bundled',
      'source ' + res.body?.source,
    );
    let out = '';
    try {
      const cli = join(REPO, 'packages/lokma-core/dist/cli/index.js');
      out = (await execFileAsync('bun', [cli, 'design', 'system', 'list'], { cwd: REPO, timeout: 60_000 })).stdout;
    } catch (e) {
      out = String(e.stdout || '');
    }
    check('the CLI then lists the bundled presets', out.includes('stripe-linear'), out.slice(0, 200));
    check('and marks them as presets, not packages', out.includes('(preset)'), out.slice(0, 200));
  }
}

async function main() {
  try {
    token = await mintToken();

    // ── the gate must still be ON ────────────────────────────────────────
    {
      const anon = await fetch(BASE + '/api/design/systems');
      check('tokenless catalog read is refused (gate stays ON)', anon.status === 401, 'status ' + anon.status);
    }

    // ── a real package with a distinctive token value ────────────────────
    work = await mkdtemp(join(tmpdir(), 'lokma-req191-tok-'));
    PKG_ID = 'tokprobe-' + Date.now().toString(36);
    const pkgDir = join(work, PKG_ID);
    const projDir = join(work, 'probe-project');
    await mkdir(pkgDir, { recursive: true });
    await mkdir(projDir, { recursive: true });
    // A colour no bundled preset can produce, so a match can only come from
    // this package's file.
    const TOKEN_VALUE = '#0af00f';
    await writeFile(
      join(pkgDir, 'manifest.json'),
      JSON.stringify({ id: PKG_ID, name: 'Token Probe Brand', category: 'Fintech', description: 'probe' }),
      'utf-8',
    );
    await writeFile(
      join(pkgDir, 'tokens.css'),
      ':root{--probe-accent:' + TOKEN_VALUE + '}\n.brand{color:var(--probe-accent)}\n',
      'utf-8',
    );
    await writeFile(join(pkgDir, 'DESIGN.md'), '# Token Probe Brand\n\n## one\n## two\n', 'utf-8');

    // ── the ephemeral capture provider ───────────────────────────────────
    stub = await startStub();
    PROVIDER_ID = 'tokprobe-' + Date.now().toString(36);
    {
      const res = await api('/api/providers', {
        method: 'POST',
        body: JSON.stringify({
          id: PROVIDER_ID,
          name: 'REQ-191 token probe',
          baseUrl: 'http://127.0.0.1:' + stub.port + '/v1',
          apiKey: 'probe-local-key',
        }),
      });
      check('the ephemeral capture provider is created', res.status === 200 || res.status === 201, 'status ' + res.status + ' ' + JSON.stringify(res.body).slice(0, 160));
    }

    // ── install + activate the package through the real API ──────────────
    {
      const inst = await api('/api/design/systems', { method: 'POST', body: JSON.stringify({ source: pkgDir }) });
      check('install the probe package', inst.status === 201, 'status ' + inst.status);
      const use = await api('/api/design/systems/' + PKG_ID + '/use', {
        method: 'POST',
        body: JSON.stringify({ cwd: projDir }),
      });
      check('activate it in the probe project', use.status === 200, 'status ' + use.status);
    }

    // ── THE assertion: the package's tokens reach the model call ──────────
    {
      const before = stub.seen.length;
      const gen = await api('/api/design/generate', {
        method: 'POST',
        body: JSON.stringify({
          type: 'prototype',
          brief: 'A landing page for a probe brand with a clear hero and two feature cards.',
          system: PKG_ID,
          model: PROVIDER_ID + '/capture-model',
          cwd: projDir,
        }),
      });
      check('generate with the package system is 200', gen.status === 200, 'status ' + gen.status + ' ' + JSON.stringify(gen.body).slice(0, 200));
      check('the generation produced an artifact', typeof gen.body?.id === 'string', String(gen.body?.id));
      const req = stub.seen[before];
      check('the upstream was actually called (capture stub saw a request)', !!req);
      if (req) {
        check(
          'the package token value arrived in the model request',
          req.user.includes(TOKEN_VALUE),
          'user prompt did not carry ' + TOKEN_VALUE,
        );
        check(
          'the package NAME (not just the id) is in the request',
          req.user.includes('Token Probe Brand'),
          req.user.slice(0, 160),
        );
        // NOT "the request model is <providerId>/capture-model": the adapter
        // strips the provider prefix and sends the BARE model id upstream, so
        // asserting the prefixed form tests the adapter instead of REQ-191.
        check('a model id reached the upstream', typeof req.model === 'string' && req.model.length > 0, String(req.model));
        check('the request carried messages at all', req.system.length > 0 && req.user.length > 0);
        if (gen.body?.id) {
          await api('/api/design/' + gen.body.id + '?cwd=' + encodeURIComponent(projDir), { method: 'DELETE', body: '{}' }).catch(() => {});
        }
      }
    }

    // ── negative control: a bundled preset sends ITS palette, not the file ─
    {
      const before = stub.seen.length;
      const gen = await api('/api/design/generate', {
        method: 'POST',
        body: JSON.stringify({
          type: 'prototype',
          brief: 'A second landing page for a probe brand with a hero and cards.',
          system: 'stripe-linear',
          model: PROVIDER_ID + '/capture-model',
          cwd: projDir,
        }),
      });
      check('generate with a bundled preset is 200', gen.status === 200, 'status ' + gen.status);
      const req = stub.seen[before];
      check('the preset request was captured too', !!req);
      if (req) {
        check(
          'the bundled preset sends its OWN palette',
          /background|accent/.test(req.user) && !req.user.includes(TOKEN_VALUE),
          'preset request looked like the package one',
        );
        if (gen.body?.id) {
          await api('/api/design/' + gen.body.id + '?cwd=' + encodeURIComponent(projDir), { method: 'DELETE', body: '{}' }).catch(() => {});
        }
      }
    }

    // ── an unknown system id must NOT invent tokens ───────────────────────
    {
      const before = stub.seen.length;
      const gen = await api('/api/design/generate', {
        method: 'POST',
        body: JSON.stringify({
          type: 'document',
          brief: 'A short document about brand tokens for a probe brand.',
          system: 'no-such-system-anywhere',
          model: PROVIDER_ID + '/capture-model',
          cwd: projDir,
        }),
      });
      // Either refused or generated WITHOUT a token table — never a palette
      // it does not have.
      if (gen.status === 200) {
        const req = stub.seen[before];
        check('an unknown system id never quotes a token table', !!req && !req.user.includes('Use these exact token values'), req ? req.user.slice(0, 160) : 'no request captured');
        if (gen.body?.id) {
          await api('/api/design/' + gen.body.id + '?cwd=' + encodeURIComponent(projDir), { method: 'DELETE', body: '{}' }).catch(() => {});
        }
      } else {
        check('an unknown system id is refused', gen.status === 400 || gen.status === 404, 'status ' + gen.status);
      }
    }

    // ── the CLI half (Docs/34 §5.1) ──────────────────────────────────────
    {
      const cli = 'packages/lokma-core/dist/cli/index.js';
      const list = await execFileAsync('bun', [join(REPO, cli), 'design', 'system', 'list'], {
        cwd: REPO,
        timeout: 60_000,
      });
      check('lokma design system list exits 0', list.stdout.includes('Design systems:'), list.stdout.slice(0, 200));
      check('the installed package appears in the CLI list', list.stdout.includes(PKG_ID));
      // NOT "(preset)" here: `listDesignSystems()` shows bundled rows ONLY when
      // the directory is empty (systems.ts:source), so with a package installed
      // the list is pure catalog. The preset branch is asserted in cleanup(),
      // where the directory really is empty — asserting it here would encode a
      // mixed-list behaviour that does not exist.
      check('the CLI declares the catalog as its source', list.stdout.includes('(catalog)'), list.stdout.slice(0, 120));
      check(
        'an installed package is not labelled a preset',
        list.stdout.split('\n').some((l) => l.includes(PKG_ID) && !l.includes('(preset)')),
        list.stdout.split('\n').find((l) => l.includes(PKG_ID)) || 'no row for ' + PKG_ID,
      );

      const help = await execFileAsync('bun', [join(REPO, cli), 'design', 'system'], { cwd: REPO, timeout: 60_000 });
      check('lokma design system prints its usage', help.stdout.includes('lokma design system use'));

      // add + use through the CLI (same helpers the routes call).
      CLI_PKG_ID = PKG_ID + '-cli';
      const addDir = join(work, CLI_PKG_ID);
      await mkdir(addDir, { recursive: true });
      await writeFile(join(addDir, 'manifest.json'), JSON.stringify({ id: CLI_PKG_ID, name: 'CLI Brand', category: 'Starter' }), 'utf-8');
      await writeFile(join(addDir, 'tokens.css'), ':root{--cli:#123456}', 'utf-8');
      const add = await execFileAsync('bun', [join(REPO, cli), 'design', 'system', 'add', addDir], { cwd: REPO, timeout: 60_000 });
      check('lokma design system add installs', add.stdout.includes('installed ' + CLI_PKG_ID), add.stdout.slice(0, 200));

      const useDir = join(work, 'cli-project');
      await mkdir(useDir, { recursive: true });
      await execFileAsync('bun', [join(REPO, cli), 'design', 'system', 'use', CLI_PKG_ID, '--cwd', useDir], {
        cwd: REPO,
        timeout: 60_000,
      });
      check(
        'lokma design system use wrote the brand files',
        existsSync(join(useDir, '.lokma', 'tokens.css')) && existsSync(join(useDir, '.lokma', 'DESIGN.md')) === false,
      );

      // SSRF refusal surfaces through the CLI too (same guard, no second impl).
      let refused = false;
      try {
        await execFileAsync('bun', [join(REPO, cli), 'design', 'system', 'add', 'https://127.0.0.1/pkg'], { cwd: REPO, timeout: 60_000 });
      } catch (e) {
        refused = e.code === 1 || /refus|loopback|private|not allowed/i.test(String(e.stderr || ''));
      }
      check('lokma design system add refuses a loopback source', refused);

      // Remove the CLI-installed package too.
      await rm(join(homedir(), '.lokma', 'design', 'systems', PKG_ID + '-cli'), { recursive: true, force: true });
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