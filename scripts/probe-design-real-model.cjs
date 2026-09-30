#!/usr/bin/env node
/**
 * REQ-177 - live probe: Design generation is backed by a REAL model call.
 *
 * The old path handed every brief to the deterministic template builder
 * (render.ts): "tasarimlar cok kotu" + "model secimi yok" were one root
 * cause. This probe drives the DEPLOYED server over HTTP and asserts:
 *
 *   A  default chain: generate with no model -> ok, the manifest records
 *      the CONFIGURED default model, output is a real HTML document with
 *      real brief content and zero placeholder filler
 *   B  a second brief produces a clearly different, real document
 *      (distinctive word tokens, low overlap, no cross-bleed)
 *   C  the REQUEST model overrides the default: the offline-template
 *      sentinel is recorded verbatim and its output differs from the real
 *      model output for the SAME brief (deterministic builder is no
 *      longer the default)
 *   D  positive control for the filler detector: the old template's own
 *      marker ("SVG placeholder composition") is caught by the same check
 *      that passes for the model outputs (A6/B6)
 *   E  failures stay honest: a bad model id answers {code,message} and
 *      creates NO artifact - never a silent template fallback
 *
 * Filler detection is TEXT-level on purpose: `input::placeholder` CSS and
 * `placeholder="you@example.com"` attributes are legitimate form UX, only
 * filler *content* (lorem ipsum, placeholder copy, the template marker)
 * counts. style/script blocks and tags are stripped before the text scan.
 *
 * Hermetic where it matters: A/B are the only billed calls (default user
 * model); C/D use the free offline-template sentinel; E rides an invalid
 * id. Artifacts are left on disk for the screenshot step - ids land in
 * OUT/artifact-ids.json and are deleted at REQ close-out.
 *
 * Run:
 *   node scripts/probe-design-real-model.cjs --token-file /tmp/lokma-e2e-token
 *
 * Evidence: /tmp/lokma-req177/{a-real,b-real,c-template,d-image-template}.html
 *           + summary.json + artifact-ids.json (written progressively)
 */
'use strict';
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

function argOf(name, dflt) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const BASE = argOf('--url', 'http://127.0.0.1:3456');
const TOKEN = readFileSync(argOf('--token-file', '/tmp/lokma-e2e-token'), 'utf8').trim();
const OUT = argOf('--out', '/tmp/lokma-req177');
const FLASH = 'commandcode/deepseek/deepseek-v4.1-flash';
const SENTINEL = 'offline-template';

let passed = 0;
const EXPECTED = 21;
function check(cond, label) {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}
function info(k, v) {
  console.log('INFO: ' + k + ' = ' + v);
}

async function api(path, method, body) {
  const res = await fetch(BASE + path, {
    method: method || 'GET',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = null;
  }
  return { status: res.status, json: json };
}

async function generate(type, brief, model) {
  const payload = { type: type, brief: brief };
  if (model !== undefined) payload.model = model;
  const t0 = Date.now();
  const res = await api('/api/design/generate', 'POST', payload);
  info(
    'generate type=' + type + ' model=' + (model === undefined ? '(default chain)' : model),
    'http ' + res.status + ' in ' + Math.round((Date.now() - t0) / 1000) + 's',
  );
  return res;
}

async function htmlOf(id) {
  const res = await api('/api/design/' + id);
  if (res.status !== 200 || !res.json) return { html: '', manifest: null };
  return { html: res.json.html || '', manifest: res.json.manifest || null };
}

function wordSet(text) {
  const m = (text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  return new Set(m);
}
function jaccard(a, b) {
  const A = wordSet(a);
  const B = wordSet(b);
  let inter = 0;
  for (const w of A) {
    if (B.has(w)) inter += 1;
  }
  const union = A.size + B.size - inter;
  return union === 0 ? 1 : inter / union;
}

/** Drop <style>...</style> / <script>...</script> blocks (escape-free). */
function stripBlocks(html, tag) {
  const open = '<' + tag;
  const close = '</' + tag + '>';
  let out = '';
  let rest = html;
  for (;;) {
    const lower = rest.toLowerCase();
    const i = lower.indexOf(open);
    if (i < 0) {
      out += rest;
      break;
    }
    out += rest.slice(0, i);
    const j = lower.indexOf(close, i);
    if (j < 0) break;
    rest = rest.slice(j + close.length);
  }
  return out;
}

/** Drop every <...> tag by character scan (no regex escapes). */
function stripTags(s) {
  let out = '';
  let inTag = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charAt(i);
    if (c === '<') inTag = true;
    else if (c === '>') {
      inTag = false;
      out += ' ';
    } else if (!inTag) out += c;
  }
  return out;
}

function textOf(html) {
  return stripTags(stripBlocks(stripBlocks(html || '', 'style'), 'script'));
}

/** Returns the filler marker found, or null. Attributes are not filler. */
function fillerOf(html) {
  const raw = (html || '').toLowerCase();
  if (raw.indexOf('lorem ipsum') >= 0) return 'lorem ipsum';
  if (raw.indexOf('svg placeholder composition') >= 0) return 'svg placeholder composition';
  const text = textOf(raw);
  if (text.indexOf('coming soon') >= 0) return 'coming soon (text)';
  if (wordSet(text).has('placeholder')) return 'placeholder (text)';
  return null;
}

const BRIEF_A =
  'Landing page for Ember & Oak, a small-batch coffee roaster in Istanbul. ' +
  'Tell the roast story, list three blends with prices, close with a subscription CTA.';
const BRIEF_B =
  'Landing page for Night Runners, a 5am running crew in Istanbul. ' +
  'Show the weekly meetup schedule, three pace groups, close with a join CTA.';

(async () => {
  mkdirSync(OUT, { recursive: true });

  // -- A: provider reachability + default-chain generation ------------------
  const providers = await api('/api/providers');
  const list =
    providers.json && Array.isArray(providers.json.providers) ? providers.json.providers : [];
  const cc = list.find(function (p) {
    return p.id === 'commandcode';
  });
  check(providers.status === 200 && Boolean(cc) && cc.keySet === true, 'A1 commandcode key present (keySet)');

  const cfgRes = await api('/api/config');
  const defaultValue = cfgRes.json && cfgRes.json.config ? cfgRes.json.config.defaultModel : null;
  info('configured defaultModel', defaultValue);

  const genA = await generate('prototype', BRIEF_A);
  check(
    genA.status === 200 && genA.json && genA.json.ok === true && typeof genA.json.id === 'string',
    'A2 default-chain generation succeeds with an artifact id',
  );
  info('A artifact id', genA.json.id);
  const a = await htmlOf(genA.json.id);
  writeFileSync(join(OUT, 'a-real.html'), a.html);
  info('A html bytes', a.html.length + ' | manifest.model ' + (a.manifest && a.manifest.model));
  check(a.html.length >= 1500, 'A3 output is a real document (>=1500 bytes)');
  check(/<html/i.test(a.html), 'A4 output is an HTML document');
  check(wordSet(a.html).has('ember'), 'A5 output carries real brief content (Ember)');
  const fillerA = fillerOf(a.html);
  check(!fillerA, 'A6 no placeholder filler in model output' + (fillerA ? ' (found: ' + fillerA + ')' : ''));
  check(Boolean(a.manifest) && a.manifest.model === defaultValue, 'A7 manifest records the configured default model');

  // -- B: second brief -> clearly different document ------------------------
  const genB = await generate('prototype', BRIEF_B, FLASH);
  check(
    genB.status === 200 && genB.json && genB.json.ok === true && typeof genB.json.id === 'string',
    'B1 explicit-model generation succeeds',
  );
  info('B artifact id', genB.json.id);
  const b = await htmlOf(genB.json.id);
  writeFileSync(join(OUT, 'b-real.html'), b.html);
  check(Boolean(b.manifest) && b.manifest.model === FLASH, 'B2 manifest records the requested model');
  check(wordSet(b.html).has('night') && wordSet(b.html).has('runners'), 'B3 output carries real brief content (Night Runners)');
  check(!wordSet(b.html).has('ember') && !wordSet(a.html).has('runners'), 'B4 briefs stay separate (no cross-bleed)');
  const simAB = jaccard(a.html, b.html);
  info('A/B word jaccard', simAB.toFixed(3) + ' | bytes ' + a.html.length + ' vs ' + b.html.length);
  check(a.html !== b.html && simAB < 0.85, 'B5 the two documents are clearly different');
  const fillerB = fillerOf(b.html);
  check(!fillerB, 'B6 no placeholder filler in second output' + (fillerB ? ' (found: ' + fillerB + ')' : ''));

  // -- C: request model overrides the default (free sentinel) ---------------
  const genC = await generate('prototype', BRIEF_A, SENTINEL);
  check(
    genC.status === 200 && genC.json && genC.json.ok === true && typeof genC.json.id === 'string',
    'C1 offline-template sentinel generation succeeds',
  );
  info('C artifact id', genC.json.id);
  const c = await htmlOf(genC.json.id);
  writeFileSync(join(OUT, 'c-template.html'), c.html);
  check(Boolean(c.manifest) && c.manifest.model === SENTINEL, 'C2 request model beats the default (sentinel recorded)');
  const simAC = jaccard(a.html, c.html);
  info('A/C word jaccard', simAC.toFixed(3) + ' | template bytes ' + c.html.length);
  check(a.html !== c.html, 'C3 real model output differs from the deterministic template (same brief)');

  // -- D: filler-detector positive control -----------------------------------
  const genD = await generate('image', BRIEF_A, SENTINEL);
  check(
    genD.status === 200 && genD.json && genD.json.ok === true && typeof genD.json.id === 'string',
    'D1 image-template generation succeeds',
  );
  info('D artifact id', genD.json.id);
  const d = await htmlOf(genD.json.id);
  writeFileSync(join(OUT, 'd-image-template.html'), d.html);
  check(Boolean(fillerOf(d.html)), 'D2 detector catches the old template marker (' + String(fillerOf(d.html)) + ')');

  // -- E: honest failure, never a silent template ---------------------------
  const genE = await generate('prototype', BRIEF_A, 'commandcode/zz-no-such-model-9');
  check(genE.status >= 400, 'E1 bad model answers an error status (' + genE.status + ')');
  check(Boolean(genE.json) && Boolean(genE.json.code) && Boolean(genE.json.message), 'E2 error body carries code + message');
  check(Boolean(genE.json) && genE.json.ok !== true && !genE.json.id, 'E3 no artifact was silently created');
  info('E code/message', genE.json ? String(genE.json.code) + ' | ' + String(genE.json.message).slice(0, 140) : '(none)');

  // -- evidence --------------------------------------------------------------
  const ids = {
    aReal: genA.json.id,
    bReal: genB.json.id,
    cTemplate: genC.json.id,
    dImageTemplate: genD.json.id,
  };
  writeFileSync(join(OUT, 'artifact-ids.json'), JSON.stringify(ids, null, 2));
  writeFileSync(
    join(OUT, 'summary.json'),
    JSON.stringify(
      {
        checks: passed + '/' + EXPECTED,
        jaccardAB: simAB,
        jaccardAC: simAC,
        bytes: {
          aReal: a.html.length,
          bReal: b.html.length,
          cTemplate: c.html.length,
          dImageTemplate: d.html.length,
        },
        defaultModel: defaultValue,
        ids: ids,
      },
      null,
      2,
    ),
  );
  if (passed !== EXPECTED) throw new Error('expected ' + EXPECTED + ' checks, ran ' + passed);
  console.log('TOTAL: ' + passed + '/' + EXPECTED + ' PASS - evidence at ' + OUT);
})().catch(function (e) {
  console.error('PROBE FAILED after ' + passed + '/' + EXPECTED + ' checks: ' + (e && e.message));
  process.exit(1);
});
