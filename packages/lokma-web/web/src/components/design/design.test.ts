import {
  DESIGN_EXPORTS,
  DESIGN_SYSTEMS,
  DESIGN_TYPES,
  artifactBadge,
  emptyGenerateForm,
  filterArtifacts,
  formatUpdated,
  overallLabel,
  parseHtmlEdit,
  scoreTone,
  toRow,
  validateGenerateForm,
  type GenerateForm,
  type NormalizedArtifact,
} from './design';

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
  check('3 exports', DESIGN_EXPORTS.length === 3 && (DESIGN_EXPORTS as readonly string[]).includes('zip'));
}

// validateGenerateForm — mirrors the server generate rules.
{
  check('valid form passes', validateGenerateForm({ ...emptyGenerateForm, brief: 'pricing page, 3 tiers' }) === null);
  check('bad type rejected', validateGenerateForm({ ...emptyGenerateForm, type: 'mermaid', brief: 'x' }) !== null);
  check('empty brief rejected', validateGenerateForm({ ...emptyGenerateForm, brief: '   ' }) !== null);
  check('long brief rejected', validateGenerateForm({ ...emptyGenerateForm, brief: 'x'.repeat(2001) }) !== null);
  check('bad system rejected', validateGenerateForm({ ...emptyGenerateForm, brief: 'x', system: 'neon' }) !== null);
  const form: GenerateForm = { ...emptyGenerateForm };
  check('empty form defaults', form.type === 'prototype' && form.system === 'stripe-linear');
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

console.log(`\nDESIGN PROBE: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
