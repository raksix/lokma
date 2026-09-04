import {
  ARCHIFY_EXPORTS,
  emptyGenerateForm,
  filterDiagrams,
  focusHash,
  formatUpdated,
  lensHash,
  parseIrEdit,
  receiptCounts,
  routeHash,
  typeBadge,
  validateGenerateForm,
  type GenerateForm,
  type NormalizedDiagram,
} from './archify';

/**
 * ArchifyPane probe — pure helpers only (no React, no network).
 * Run: `bun src/components/archify/archify.test.ts` from the web package.
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

const rows: NormalizedDiagram[] = [
  { id: 'web-harness-abc', type: 'architecture', preset: 'signal-flow', theme: 'dark', title: 'Lokma web harness', nodeCount: 3, edgeCount: 2, updatedAt: '2026-09-03T10:00:00.000Z' },
  { id: 'spawn-flow-def', type: 'workflow', preset: 'blueprint', theme: 'dark', title: 'agent spawn lifecycle', nodeCount: 5, edgeCount: 4, updatedAt: '2026-09-02T10:00:00.000Z' },
  { id: 'vault-pipe-ghi', type: 'dataflow', preset: 'minimal', theme: 'light', title: 'vault sync pipeline', nodeCount: 4, edgeCount: 3, updatedAt: '2026-08-29T10:00:00.000Z' },
];

// validateGenerateForm — mirrors the server generate rules.
{
  check('valid form passes', validateGenerateForm({ ...emptyGenerateForm, prompt: 'web -> api -> db' }) === null);
  check('bad type rejected', validateGenerateForm({ ...emptyGenerateForm, type: 'mermaid', prompt: 'x' }) !== null);
  check('empty prompt rejected', validateGenerateForm({ ...emptyGenerateForm, prompt: '   ' }) !== null);
  check('long prompt rejected', validateGenerateForm({ ...emptyGenerateForm, prompt: 'x'.repeat(2001) }) !== null);
  check('bad preset rejected', validateGenerateForm({ ...emptyGenerateForm, prompt: 'x', preset: 'neon' }) !== null);
  check('bad theme rejected', validateGenerateForm({ ...emptyGenerateForm, prompt: 'x', theme: 'sepia' }) !== null);
  const form: GenerateForm = { ...emptyGenerateForm };
  check('empty form has dark default', form.theme === 'dark' && form.preset === 'signal-flow');
}

// filterDiagrams — type filter + search.
{
  check('all returns 3', filterDiagrams(rows, 'all', '').length === 3);
  check('type filter narrows', filterDiagrams(rows, 'workflow', '').length === 1);
  check('search matches title', filterDiagrams(rows, 'all', 'vault').length === 1);
  check('search matches id', filterDiagrams(rows, 'all', 'spawn-flow').length === 1);
  check('search is case-insensitive', filterDiagrams(rows, 'all', 'LOKMA').length === 1);
  check('type+query combine', filterDiagrams(rows, 'architecture', 'vault').length === 0);
  check('no match is empty', filterDiagrams(rows, 'all', 'zzz').length === 0);
}

// typeBadge + formatUpdated.
{
  check('badge architecture', typeBadge('architecture') === 'AR');
  check('badge workflow', typeBadge('workflow') === 'WO');
  check('badge dataflow', typeBadge('dataflow') === 'DA');
  const now = Date.parse('2026-09-03T12:00:00.000Z');
  check('minutes ago', formatUpdated('2026-09-03T11:30:00.000Z', now) === '30m ago');
  check('hours ago', formatUpdated('2026-09-03T10:00:00.000Z', now) === '2h ago');
  check('days ago', formatUpdated('2026-09-02T10:00:00.000Z', now) === '1d ago');
  check('old date falls back', formatUpdated('2026-08-20T10:00:00.000Z', now) === '2026-08-20');
  check('garbage falls back', formatUpdated('not-a-date', now) === 'not-a-date');
}

// Viewer deep-link hashes — the standalone HTML parses these exact shapes.
{
  check('focus hash', focusHash('api') === '#focus=api');
  check('route hash', routeHash('web', 'api') === '#route=web~api');
  check('lens hash lowercases', lensHash('DB') === '#lens=db');
  check('focus encodes', focusHash('my node') === '#focus=my%20node');
}

// parseIrEdit + receiptCounts.
{
  const good = parseIrEdit('{"type":"architecture"}');
  check('valid JSON parses', good.ir !== undefined && good.error === undefined);
  const bad = parseIrEdit('{oops');
  check('broken JSON errors', bad.ir === undefined && typeof bad.error === 'string');
  check('empty errors', parseIrEdit('  ').error !== undefined);
  const counts = receiptCounts([
    { status: 'pass' },
    { status: 'pass' },
    { status: 'fail' },
  ]);
  check('receipt 2 pass 1 fail', counts.pass === 2 && counts.fail === 1);
  check('empty receipt zeros', receiptCounts([]).pass === 0 && receiptCounts([]).fail === 0);
}

// Export formats offered by the pane match the server endpoint exactly.
{
  check('6 export formats', ARCHIFY_EXPORTS.length === 6);
  check(
    'formats are svg|html|json|card|png|webm',
    (['svg', 'html', 'json', 'card', 'png', 'webm'] as const).every((f) =>
      (ARCHIFY_EXPORTS as readonly string[]).includes(f),
    ),
  );
}

console.log(`archify helpers: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
