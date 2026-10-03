import {
  DESIGN_EXPORTS,
  DESIGN_SAMPLES,
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
  validateTweakNote,
  versionAfterRevert,
  versionLabel,
  canRevertTo,
  DESIGN_TWEAK_NOTE_CAP,
  type DesignEvent,
  type GenerateForm,
  type NormalizedArtifact,
} from './design';
import type { DesignVersion } from '@/lib/api';
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

// REQ-189 — the Artifacts panel is CLOSED by default and restores only on an
// explicit `true`. Every other shape (missing, string, number, null) keeps the
// canvas full width; that asymmetry is the acceptance criterion, so it is
// pinned here rather than re-derived by the live probe.
{
  check('snapshot: the artifacts panel defaults to closed', parseDesignPageSnapshot(null).artifactsPanel === false);
  check('snapshot: a pre-REQ-189 snapshot keeps the panel closed', parseDesignPageSnapshot(JSON.stringify({ selected: 'a' })).artifactsPanel === false);
  check('snapshot: an explicit true restores the open panel', parseDesignPageSnapshot(JSON.stringify({ artifactsPanel: true })).artifactsPanel === true);
  check('snapshot: an explicit false keeps the panel closed', parseDesignPageSnapshot(JSON.stringify({ artifactsPanel: false })).artifactsPanel === false);
  check('snapshot: a stringy true does NOT open the panel', parseDesignPageSnapshot(JSON.stringify({ artifactsPanel: 'true' })).artifactsPanel === false);
  check('snapshot: a numeric 1 does NOT open the panel', parseDesignPageSnapshot(JSON.stringify({ artifactsPanel: 1 })).artifactsPanel === false);
  check('snapshot: a corrupt payload keeps the panel closed', parseDesignPageSnapshot('{oops').artifactsPanel === false);
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

// REQ-179 — canvas sample brief chips must be valid composer inputs.
{
  check('samples: 4 chips', DESIGN_SAMPLES.length === 4);
  check('samples: unique ids', new Set(DESIGN_SAMPLES.map((s) => s.id)).size === DESIGN_SAMPLES.length);
  check(
    'samples: every type is a real DESIGN_TYPE',
    DESIGN_SAMPLES.every((s) => (DESIGN_TYPES as readonly string[]).includes(s.type)),
  );
  check(
    'samples: non-empty label + brief',
    DESIGN_SAMPLES.every((s) => s.label.trim().length > 0 && s.brief.trim().length > 0),
  );
  check(
    'samples: briefs pass client validation',
    DESIGN_SAMPLES.every(
      (s) => validateGenerateForm({ ...emptyGenerateForm, type: s.type, brief: s.brief }) === null,
    ),
  );
}

// REQ-190 — the version picker + tweak sentence helpers. The invariants here
// are what keep the UI honest: no fabricated v1 for a pre-REQ-190 artifact, no
// revert offered for the version already on screen, and a note length the
// server will actually accept.
{
  const ledger: DesignVersion[] = [
    { n: 1, sha: 'a'.repeat(64), bytes: 1200, createdAt: '2026-10-01T10:00:00.000Z', origin: 'generate', overall: 7 },
    {
      n: 2,
      sha: 'b'.repeat(64),
      bytes: 1260,
      createdAt: '2026-10-02T11:00:00.000Z',
      origin: 'tweak',
      note: 'Make the primary button terracotta',
      model: 'deepseek/deepseek-v4.1-flash',
      overall: 8,
    },
    {
      n: 3,
      sha: 'c'.repeat(64),
      bytes: 1190,
      createdAt: '2026-10-03T09:00:00.000Z',
      origin: 'revert',
      note: 'reverted to v1',
      overall: 7,
    },
  ];

  check('tweak note: empty is refused', validateTweakNote('') !== null);
  check('tweak note: whitespace-only is refused', validateTweakNote('   \n  ') !== null);
  check('tweak note: a real sentence passes', validateTweakNote('Make the button terracotta') === null);
  check('tweak note: at the cap passes', validateTweakNote('x'.repeat(DESIGN_TWEAK_NOTE_CAP)) === null);
  check(
    'tweak note: one char over the cap is refused',
    validateTweakNote('x'.repeat(DESIGN_TWEAK_NOTE_CAP + 1)) !== null,
  );
  check('tweak cap is the server cap (400)', DESIGN_TWEAK_NOTE_CAP === 400);

  check('version label names the index and origin', versionLabel(ledger[0], 1).startsWith('v1 \u00b7 generated'));
  check('version label marks the current entry', versionLabel(ledger[2], 3).includes('current'));
  check('version label carries the score when known', versionLabel(ledger[1], 3).includes('8/10'));
  check(
    'version label omits an absent score rather than printing null',
    versionLabel({ ...ledger[0], overall: null }, 1) === 'v1 \u00b7 generated \u00b7 current',
  );
  check('a non-current entry is not marked current', !versionLabel(ledger[0], 3).includes('current'));

  check('revert: the current version is not a valid target', canRevertTo(ledger, 3, 3) === false);
  check('revert: an earlier version is a valid target', canRevertTo(ledger, 1, 3) === true);
  check('revert: a version outside the ledger is refused', canRevertTo(ledger, 9, 3) === false);
  check('revert: a non-integer is refused', canRevertTo(ledger, 1.5, 3) === false);
  check('revert: an empty ledger has no targets', canRevertTo([], 1, 0) === false);

  check('revert lands on the version AFTER the current one', versionAfterRevert(3, 1) === 4);
  check('revert from v0 starts the ledger at v1', versionAfterRevert(0, 0) === 1);
}

console.log(`\nDESIGN PROBE: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
