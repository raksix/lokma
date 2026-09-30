import {
  DESIGN_EXPORTS,
  DESIGN_SYSTEMS,
  DESIGN_TYPES,
  appendDesignEvent,
  artifactBadge,
  emptyGenerateForm,
  filterArtifacts,
  formatUpdated,
  overallLabel,
  parseHtmlEdit,
  projectLabel,
  scoreTone,
  toRow,
  validateGenerateForm,
  type DesignEvent,
  type GenerateForm,
  type NormalizedArtifact,
} from './design';
import { parseDesignPageSnapshot } from './design-page-state';

/**
 * DesignPane probe — pure helpers only (no React, no network).
 * Run: `bun src/components/design/design.test.ts` from the web package.
 * Never mock data here — assertions pin the real helper contracts.
 */

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

const rows: NormalizedArtifact[] = [
  { id: 'pricing-page-abc', type: 'prototype', brief: 'Pricing page for Lokma, dark, 3 tiers', system: 'stripe-linear', createdAt: '2026-09-03T10:00:00.000Z', updatedAt: '2026-09-03T10:00:00.000Z', bytes: 1664, overall: 8 },
  { id: 'pitch-deck-def', type: 'deck', brief: 'Seed pitch, 5 slides', system: 'omp-dark', createdAt: '2026-09-02T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z', bytes: 2100, overall: 7 },
  { id: 'launch-doc-ghi', type: 'document', brief: 'Launch notes', system: 'paper-ink', createdAt: '2026-08-29T10:00:00.000Z', updatedAt: '2026-08-29T10:00:00.000Z', bytes: 900, overall: null },
];

// Catalog constants mirror the server contracts.
{
  check('6 types', DESIGN_TYPES.length === 6 && (DESIGN_TYPES as readonly string[]).includes('hyperframe'));
  check('4 systems', DESIGN_SYSTEMS.length === 4 && (DESIGN_SYSTEMS as readonly string[]).includes('stripe-linear'));
  check('5 exports', DESIGN_EXPORTS.length === 5 && (DESIGN_EXPORTS as readonly string[]).includes('webm'));
}

// validateGenerateForm — mirrors the server generate rules.
{
  check('valid form passes', validateGenerateForm({ ...emptyGenerateForm, brief: 'pricing page, 3 tiers' }) === null);
  check('bad type rejected', validateGenerateForm({ ...emptyGenerateForm, type: 'mermaid', brief: 'x' }) !== null);
  check('empty brief rejected', validateGenerateForm({ ...emptyGenerateForm, brief: '   ' }) !== null);
  check('long brief rejected', validateGenerateForm({ ...emptyGenerateForm, brief: 'x'.repeat(2001) }) !== null);
  check('bad system rejected', validateGenerateForm({ ...emptyGenerateForm, brief: 'x', system: 'neon' }) !== null);
  const form: GenerateForm = { ...emptyGenerateForm };
  check('empty form defaults', form.type === 'prototype' && form.system === 'stripe-linear' && form.model === '');
  check(
    'valid form passes with a picked model (REQ-177)',
    validateGenerateForm({ ...emptyGenerateForm, brief: 'x', model: 'commandcode/deepseek/deepseek-v4.1-flash' }) === null,
  );
  check('overlong model id rejected', validateGenerateForm({ ...emptyGenerateForm, brief: 'x', model: 'm'.repeat(201) }) !== null);
}

// filterArtifacts — type filter + search.
{
  check('all returns 3', filterArtifacts(rows, 'all', '').length === 3);
  check('type filter narrows', filterArtifacts(rows, 'deck', '').length === 1);
  check('search matches brief', filterArtifacts(rows, 'all', 'pitch').length === 1);
  check('search matches id', filterArtifacts(rows, 'all', 'launch-doc').length === 1);
  check('no match empty', filterArtifacts(rows, 'mobile', 'pitch').length === 0);
}

// artifactBadge + formatUpdated.
{
  check('badge prototype', artifactBadge('prototype') === 'PR');
  check('badge hyperframe', artifactBadge('hyperframe') === 'HY');
  check('updated just now', formatUpdated(new Date().toISOString(), Date.now()) === 'just now');
  check('updated bad iso', formatUpdated('not-a-date') === 'not-a-date'.slice(0, 10));
}

// parseHtmlEdit — Code tab guard.
{
  check('empty rejected', parseHtmlEdit('   ').error !== undefined);
  check('non-markup rejected', parseHtmlEdit('plain text').error !== undefined);
  check('oversize rejected', parseHtmlEdit(`<p>${'x'.repeat(512 * 1024)}</p>`).error !== undefined);
  check('valid html passes', parseHtmlEdit('<html><body>hi</body></html>').html !== undefined);
}

// scoreTone + overallLabel.
{
  check('tone good', scoreTone(9) === 'good' && scoreTone(8) === 'good');
  check('tone warn', scoreTone(7) === 'warn' && scoreTone(6) === 'warn');
  check('tone bad', scoreTone(4) === 'bad');
  check('overall label scored', overallLabel(8) === '8/10');
  check('overall label null', overallLabel(null) === '—');
}

// toRow — detail manifest → list row.
{
  const row = toRow(
    { id: 'x-1', type: 'mobile', brief: 'App', system: 'minimal-geo', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
    512,
    6,
  );
  check('toRow keeps fields', row.id === 'x-1' && row.bytes === 512 && row.overall === 6);
}

// REQ-168 — the Design page snapshot (selected artifact + brief form) is
// tolerant: unknown fields fall back, foreign catalogs are rejected.
{
  const empty = parseDesignPageSnapshot(null);
  check('snapshot: null reads as the default', empty.selected === null && empty.form.type === 'prototype' && empty.form.system === 'stripe-linear');
  check('snapshot: corrupt JSON reads as the default', parseDesignPageSnapshot('{oops').selected === null);
  const restored = parseDesignPageSnapshot(
    JSON.stringify({ selected: 'pricing-abc', form: { type: 'deck', system: 'paper-ink', brief: 'seed deck' } }),
  );
  check('snapshot: restores the selected artifact', restored.selected === 'pricing-abc');
  check('snapshot: restores the brief form', restored.form.type === 'deck' && restored.form.system === 'paper-ink' && restored.form.brief === 'seed deck');
  const foreign = parseDesignPageSnapshot(JSON.stringify({ selected: 'a', form: { type: 'nope', system: 'neon' } }));
  check('snapshot: foreign type/system fall back to defaults', foreign.form.type === 'prototype' && foreign.form.system === 'stripe-linear');
  check('snapshot: overlong brief dropped', parseDesignPageSnapshot(JSON.stringify({ form: { brief: 'x'.repeat(2001) } })).form.brief === '');
  check('snapshot: non-string selection dropped', parseDesignPageSnapshot(JSON.stringify({ selected: 42 })).selected === null);
  const restoredModel = parseDesignPageSnapshot(
    JSON.stringify({ form: { type: 'deck', system: 'paper-ink', brief: 'seed', model: 'commandcode/deepseek/deepseek-v4.1-flash' } }),
  );
  check('snapshot: restores the picked model (REQ-177)', restoredModel.form.model === 'commandcode/deepseek/deepseek-v4.1-flash');
  check('snapshot: overlong model dropped', parseDesignPageSnapshot(JSON.stringify({ form: { model: 'x'.repeat(201) } })).form.model === '');
  check('snapshot: non-string model dropped', parseDesignPageSnapshot(JSON.stringify({ form: { model: 7 } })).form.model === '');
}

// REQ-178 — the snapshot also remembers the project cwd, and the label
// helper names it ('' = the global root).
{
  check('snapshot: project defaults to the global root', parseDesignPageSnapshot(null).project === '');
  const restored = parseDesignPageSnapshot(JSON.stringify({ project: '/mnt/apopic/lokma' }));
  check('snapshot: restores the project cwd', restored.project === '/mnt/apopic/lokma');
  check(
    'snapshot: overlong project dropped (500 max)',
    parseDesignPageSnapshot(JSON.stringify({ project: `/${'x'.repeat(500)}` })).project === '',
  );
  check('snapshot: blank project stays global', parseDesignPageSnapshot(JSON.stringify({ project: '   ' })).project === '');
  check('snapshot: non-string project dropped', parseDesignPageSnapshot(JSON.stringify({ project: 42 })).project === '');
  check('snapshot: project is trimmed', parseDesignPageSnapshot(JSON.stringify({ project: '  /repo/x  ' })).project === '/repo/x');
  check('label: global root', projectLabel('') === 'Global (~)');
  check('label: last path segment', projectLabel('/mnt/apopic/lokma') === 'lokma');
  check('label: trailing slash tolerated', projectLabel('/mnt/apopic/lokma/') === 'lokma');
  const rowProject = toRow(
    { id: 'x-2', type: 'deck', brief: 'B', system: 'stripe-linear', createdAt: 'c', updatedAt: 'u', project: '/mnt/apopic/lokma' },
    10,
    null,
  );
  check('toRow carries the project (REQ-178)', rowProject.project === '/mnt/apopic/lokma');
  const rowGlobal = toRow(
    { id: 'x-3', type: 'deck', brief: 'B', system: 'stripe-linear', createdAt: 'c', updatedAt: 'u' },
    10,
    null,
  );
  check('toRow omits a missing project', rowGlobal.project === undefined);
}

// REQ-172 — the Design chat's activity chips: append keeps order, caps the
// tail and never mutates the previous list.
{
  const base: DesignEvent[] = [];
  const one = appendDesignEvent(base, { id: 1, kind: 'ok', text: 'Generated p-1 — overall 8/10', at: 1 });
  const two = appendDesignEvent(one, { id: 2, kind: 'info', text: 'HTML saved', at: 2 });
  check('event append keeps newest last', two.length === 2 && two[1].id === 2 && two[1].kind === 'info');
  check('event append never mutates the input', one.length === 1 && base.length === 0);
  let capped: DesignEvent[] = [];
  for (let i = 1; i <= 45; i += 1) {
    capped = appendDesignEvent(capped, { id: i, kind: 'info', text: `event ${i}`, at: i }, 40);
  }
  check('event cap keeps exactly 40', capped.length === 40);
  check('event cap drops the oldest first', capped[0].id === 6 && capped[39].id === 45);
}

console.log(`\nDESIGN PROBE: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
