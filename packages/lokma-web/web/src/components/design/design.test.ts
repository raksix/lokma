import {
  DESIGN_EXPORTS,
  DESIGN_SAMPLES,
  DESIGN_SKILL_SELECT_CAP,
  DESIGN_SYSTEMS,
  DESIGN_TYPES,
  DESIGN_TWEAK_FIELDS,
  appendDesignEvent,
  artifactBadge,
  buildFieldTweakNote,
  clearSkills,
  emptyGenerateForm,
  fieldControl,
  fieldCurrentValue,
  fieldOptions,
  filterArtifacts,
  formatUpdated,
  groupSkillRows,
  groupTemplateRows,
  normalizeSkillIds,
  normalizeTemplateId,
  overallLabel,
  parseHtmlEdit,
  pickTemplate,
  projectLabel,
  scoreTone,
  skillSelectionLabel,
  toRow,
  toggleSkill,
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
  // REQ-191 — the client no longer owns catalog MEMBERSHIP (it cannot: the
  // catalog is per-machine and loaded from disk), only the id SHAPE. So the
  // probe asserts both halves of the new contract: a malformed id is still
  // refused locally, while a well-formed id the client has never seen — a
  // freshly installed package — is allowed through for the server to judge.
  check(
    'malformed system id rejected',
    validateGenerateForm({ ...emptyGenerateForm, brief: 'x', system: 'Neon Bad/Id' }) !== null,
  );
  check(
    'an unknown but well-formed catalog id passes the client',
    validateGenerateForm({ ...emptyGenerateForm, brief: 'x', system: 'tok' }) === null,
  );
  const form: GenerateForm = { ...emptyGenerateForm };
  check('empty form defaults', form.type === 'prototype' && form.system === 'stripe-linear' && form.model === '');
  check(
    'valid form passes with a picked model (REQ-177)',
    validateGenerateForm({ ...emptyGenerateForm, brief: 'x', model: 'commandcode/deepseek/deepseek-v4.1-flash' }) === null,
  );
  check('overlong model id rejected', validateGenerateForm({ ...emptyGenerateForm, brief: 'x', model: 'm'.repeat(201) }) !== null);
  // REQ-192 — skills are OPTIONAL and the client only owns the shape + the cap
  // (membership belongs to the per-machine catalog the server reads).
  check(
    'no skills is valid (the axis is optional)',
    validateGenerateForm({ ...emptyGenerateForm, brief: 'x', skills: [] }) === null,
  );
  check(
    'a well-formed skill id the client has never seen passes the client',
    validateGenerateForm({ ...emptyGenerateForm, brief: 'x', skills: ['brand-voice'] }) === null,
  );
  check(
    'a malformed skill id is refused locally',
    validateGenerateForm({ ...emptyGenerateForm, brief: 'x', skills: ['../escape'] }) !== null,
  );
  check(
    'over the skill cap is refused client-side too',
    validateGenerateForm({
      ...emptyGenerateForm,
      brief: 'x',
      skills: Array.from({ length: DESIGN_SKILL_SELECT_CAP + 1 }, (_, i) => 'skill-' + i),
    }) !== null,
  );
  check('the empty form carries no skills', emptyGenerateForm.skills.length === 0);
}

// REQ-192 — the design-SKILL selection: one pure writer (`toggleSkill`) that
// the multi SelectMenu's per-click onChange delegates to.
{
  check('toggle adds', toggleSkill([], 'brand-voice').join(',') === 'brand-voice');
  check('toggle removes', toggleSkill(['brand-voice'], 'brand-voice').length === 0);
  check(
    'toggle keeps pick order (no shuffle)',
    toggleSkill(['a-skill', 'b-skill'], 'c-skill').join(',') === 'a-skill,b-skill,c-skill',
  );
  check('toggle trims', toggleSkill([], '  brand-voice  ').join(',') === 'brand-voice');
  check('toggle refuses junk without throwing', toggleSkill(['a-skill'], '../escape').join(',') === 'a-skill');
  check('toggle refuses an empty id', toggleSkill(['a-skill'], '   ').join(',') === 'a-skill');
  // The cap is the SERVER cap mirrored here: a 9th pick is dropped, not sent.
  const eight = Array.from({ length: DESIGN_SKILL_SELECT_CAP }, (_, i) => 'skill-' + i);
  check('the cap holds', toggleSkill(eight, 'one-too-many').length === DESIGN_SKILL_SELECT_CAP);
  // Removing below the cap still works — a full list is not a locked list.
  check('a full list can still shrink', toggleSkill(eight, eight[0]!).length === DESIGN_SKILL_SELECT_CAP - 1);
  check('clear empties the selection', clearSkills().length === 0);

  check('normalize drops a non-array', normalizeSkillIds('brand-voice').length === 0);
  check('normalize drops non-strings', normalizeSkillIds(['a', 7, null, {}]).join(',') === 'a');
  check('normalize dedupes', normalizeSkillIds(['a', 'a', 'b']).join(',') === 'a,b');
  check('normalize drops a path escape', normalizeSkillIds(['../escape', 'a']).join(',') === 'a');
  check(
    'normalize enforces the cap',
    normalizeSkillIds(Array.from({ length: 40 }, (_, i) => 'skill-' + i)).length === DESIGN_SKILL_SELECT_CAP,
  );

  const names = new Map([
    ['brand-voice', 'Brand voice'],
    ['brutalist-web', 'Brutalist web'],
  ]);
  check('empty selection offers the picker', skillSelectionLabel([], names) === 'None selected');
  check('one skill is named', skillSelectionLabel(['brand-voice'], names) === 'Brand voice');
  check('an unknown id falls back to itself', skillSelectionLabel(['zzz'], names) === 'zzz');
  check(
    'several skills show the count and the first name',
    skillSelectionLabel(['brand-voice', 'brutalist-web'], names) === '2 skills · Brand voice +1',
  );

  const grouped = groupSkillRows(
    [
      { group: 'Style', name: 'brutalist-web' },
      { group: 'Style', name: 'Editorial serif' },
      { group: 'Accessibility', name: 'accessibility-basics' },
      { group: 'Mystery', name: 'unknown-group' },
    ],
    ['Style', 'Layout', 'Accessibility'],
  );
  check('groups follow the server taxonomy', grouped.map((g) => g.label).join(',') === 'Style,Accessibility,Mystery');
  // The sort is the shared `localeCompare` the server catalog uses — assert the
  // CONTRACT (a stable, localeCompare-ordered list), not a guessed collation.
  check(
    'rows sort by name inside a group',
    grouped[0]?.rows.map((r) => r.name).join(',') ===
      [...grouped[0]!.rows].sort((a, b) => a.name.localeCompare(b.name)).map((r) => r.name).join(','),
  );
  check('an off-taxonomy group still lists last', grouped.at(-1)?.rows[0]?.name === 'unknown-group');
  check('a blank group falls back to Other', groupSkillRows([{ group: '  ', name: 'x' }], ['Style'])[0]?.label === 'Other');
}

// REQ-192 slice 5 — the TEMPLATE axis (the output skeleton, single-select).
{
  check('picking sets the id', pickTemplate('', 'pitch-deck') === 'pitch-deck');
  check('picking trims', pickTemplate('', '  launch-page ') === 'launch-page');
  // Re-picking the CURRENT row clears: a single-select control with no visible
  // "off" state otherwise makes a selection permanent by accident.
  check('re-picking the current row clears', pickTemplate('pitch-deck', 'pitch-deck') === '');
  // Picking a DIFFERENT row replaces — a single-select picker must not refuse a
  // second click the way the capped multi-skill picker does.
  check('picking another row replaces', pickTemplate('pitch-deck', 'app-shell') === 'app-shell');
  check('the empty sentinel clears', pickTemplate('pitch-deck', '') === '');
  check('junk is ignored, not stored', pickTemplate('pitch-deck', '../escape') === 'pitch-deck');
  check('an uppercase id is refused (server jail is lowercase)', pickTemplate('', 'PitchDeck') === '');

  check('normalize keeps a valid id', normalizeTemplateId('pitch-deck') === 'pitch-deck');
  check('normalize trims', normalizeTemplateId('  app-shell  ') === 'app-shell');
  check('normalize drops a non-string', normalizeTemplateId(7) === '');
  check('normalize drops null', normalizeTemplateId(null) === '');
  check('normalize drops a traversal', normalizeTemplateId('../escape') === '');
  check('normalize drops an over-long id', normalizeTemplateId('a'.repeat(65)) === '');
  // A snapshot written by a future/foreign writer may hold an array; one
  // artifact still ships one skeleton, so it coerces to the first entry.
  check('normalize takes the first of an array', normalizeTemplateId(['app-shell', 'pitch-deck']) === 'app-shell');
  check('normalize of an empty array is empty', normalizeTemplateId([]) === '');

  const grouped = groupTemplateRows(
    [
      { mode: 'deck', label: 'Pitch Deck' },
      { mode: 'prototype', label: 'Launch Page' },
      { mode: 'deck', label: 'Quarterly Deck' },
      { mode: 'mystery', label: 'Odd' },
    ],
    DESIGN_TYPES,
  );
  // `DESIGN_TYPES` order first (its first entry is `prototype`), off-taxonomy
  // last. Asserted against the REAL taxonomy constant, not a guessed order.
  check(
    'template groups follow the artifact-type order',
    grouped.map((g) => g.label).join(',') ===
      [...DESIGN_TYPES.filter((t) => grouped.some((g) => g.label === t)), 'mystery'].join(','),
  );
  const deckGroup = grouped.find((g) => g.label === 'deck');
  check(
    'template rows sort by label inside a group',
    deckGroup?.rows.map((r) => r.label).join(',') === 'Pitch Deck,Quarterly Deck',
  );
  check('a blank mode falls back to Other', groupTemplateRows([{ mode: '  ', label: 'x' }], DESIGN_TYPES)[0]?.label === 'Other');
  check('an empty catalog groups to nothing', groupTemplateRows([], DESIGN_TYPES).length === 0);

  // The form default carries the axis as EMPTY, so a no-template generation
  // stays the byte-identical request it was before slice 5.
  check('the empty form has no template', emptyGenerateForm.template === '');
  // Validation: the id SHAPE only — membership is the server's call, because
  // the installed catalog is per-machine (same rule as skills).
  const good = { ...emptyGenerateForm, brief: 'a deck', template: 'pitch-deck' };
  check('a valid template passes validation', validateGenerateForm(good) === null);
  check(
    'an invalid template id is refused locally',
    (validateGenerateForm({ ...good, template: '../escape' }) ?? '').includes('template'),
  );
  // An id the catalog does not carry is NOT a client error — the server answers
  // `template_not_found` honestly, and pre-empting it here would hide the reason.
  check(
    'an unknown-but-well-formed id is left to the server',
    validateGenerateForm({ ...good, template: 'not-installed' }) === null,
  );
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
  // REQ-191 — the snapshot keeps a well-formed catalog id (the machine's own
  // installed packages must survive a reload) but drops a MALFORMED one.
  const foreign = parseDesignPageSnapshot(JSON.stringify({ selected: 'a', form: { type: 'nope', system: '../escape' } }));
  check('snapshot: foreign type/malformed system fall back to defaults', foreign.form.type === 'prototype' && foreign.form.system === 'stripe-linear');
  const catalog = parseDesignPageSnapshot(JSON.stringify({ form: { type: 'deck', system: 'tok', brief: 'seed' } }));
  check('snapshot: an installed catalog id is restored', catalog.form.system === 'tok');
  check('snapshot: overlong brief dropped', parseDesignPageSnapshot(JSON.stringify({ form: { brief: 'x'.repeat(2001) } })).form.brief === '');
  check('snapshot: non-string selection dropped', parseDesignPageSnapshot(JSON.stringify({ selected: 42 })).selected === null);
  const restoredModel = parseDesignPageSnapshot(
    JSON.stringify({ form: { type: 'deck', system: 'paper-ink', brief: 'seed', model: 'commandcode/deepseek/deepseek-v4.1-flash' } }),
  );
  check('snapshot: restores the picked model (REQ-177)', restoredModel.form.model === 'commandcode/deepseek/deepseek-v4.1-flash');
  check('snapshot: overlong model dropped', parseDesignPageSnapshot(JSON.stringify({ form: { model: 'x'.repeat(201) } })).form.model === '');
  check('snapshot: non-string model dropped', parseDesignPageSnapshot(JSON.stringify({ form: { model: 7 } })).form.model === '');
  // REQ-192 — the picked skills ride the snapshot (the REQ's "survives a
  // reload" criterion) and are restored on SHAPE only, never against catalog
  // membership: the installed catalog is per-machine.
  const withSkills = parseDesignPageSnapshot(
    JSON.stringify({ form: { brief: 'seed', skills: ['brand-voice', 'brutalist-web'] } }),
  );
  check('snapshot: restores the picked skills', withSkills.form.skills.join(',') === 'brand-voice,brutalist-web');
  check(
    'snapshot: drops junk skill entries',
    parseDesignPageSnapshot(JSON.stringify({ form: { skills: ['ok-skill', '../escape', 9] } })).form.skills.join(',') ===
      'ok-skill',
  );
  check('snapshot: a missing skills field restores empty', parseDesignPageSnapshot('{}').form.skills.length === 0);
  check(
    'snapshot: an over-cap skills list is trimmed',
    parseDesignPageSnapshot(JSON.stringify({ form: { skills: Array.from({ length: 30 }, (_, i) => 'skill-' + i) } }))
      .form.skills.length === DESIGN_SKILL_SELECT_CAP,
  );
  // REQ-192 slice 5 — the template rides the snapshot on the SAME rule: shape
  // only, never catalog membership (an id the machine no longer carries is the
  // server's `template_not_found` to report, not a silent local drop).
  const withTemplate = parseDesignPageSnapshot(
    JSON.stringify({ form: { brief: 'seed', template: 'pitch-deck' } }),
  );
  check('snapshot: restores the picked template', withTemplate.form.template === 'pitch-deck');
  check(
    'snapshot: drops a malformed template id',
    parseDesignPageSnapshot(JSON.stringify({ form: { template: '../escape' } })).form.template === '',
  );
  check('snapshot: a missing template field restores empty', parseDesignPageSnapshot('{}').form.template === '');
  check(
    'snapshot: an over-long template id is dropped',
    parseDesignPageSnapshot(JSON.stringify({ form: { template: 'a'.repeat(65) } })).form.template === '',
  );
  // A snapshot that never knew about the axis (pre-slice-5 localStorage) must
  // restore as the default form, not crash or carry `undefined` into the wire.
  check(
    'snapshot: a pre-slice-5 payload restores an empty template',
    parseDesignPageSnapshot(JSON.stringify({ form: { brief: 'seed', skills: ['a'] } })).form.template === '',
  );
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

// ─── REQ-190 §3 — editable field surfaces ────────────────────────────────────
{
  const systems = [
    { id: 'stripe-linear', name: 'Stripe/Linear' },
    { id: 'omp-dark', name: 'OMP Midnight' },
  ];
  const manifest = { type: 'prototype', system: 'stripe-linear', model: 'deepseek/deepseek-v4.1-flash' };

  check('six editable fields', DESIGN_TWEAK_FIELDS.length === 6);
  check(
    'every field has exactly one control',
    DESIGN_TWEAK_FIELDS.every((f) => fieldControl(f, systems).field === f),
  );

  // The option rows come from the LIVE catalogs, never a re-declared list.
  check('type options mirror DESIGN_TYPES', fieldOptions('type', systems).length === DESIGN_TYPES.length);
  check(
    'system options mirror the catalog that was passed in',
    fieldOptions('system', systems).map((o) => o.value).join(',') === 'stripe-linear,omp-dark',
  );
  check('palette options carry name + hex', fieldOptions('palette', systems).every((o) => o.label.includes('#')));
  check('density has three steps', fieldOptions('density', systems).length === 3);
  check('an empty system catalog yields no options', fieldOptions('system', []).length === 0);

  // Content is the free-text one; everything else is a select.
  check('content is a text control', fieldControl('content', systems).kind === 'text');
  check('type is a select control', fieldControl('type', systems).kind === 'select');
  check('a text control carries no options', fieldControl('content', systems).options.length === 0);

  // Honesty: the manifest records type/system/model and nothing else, so the
  // other three must answer null rather than a fabricated "current" value.
  check('current type is read from the manifest', fieldCurrentValue('type', manifest) === 'prototype');
  check('current system is read from the manifest', fieldCurrentValue('system', manifest) === 'stripe-linear');
  check('current model is read from the manifest', fieldCurrentValue('model', manifest) === 'deepseek/deepseek-v4.1-flash');
  check('palette has no recorded current value', fieldCurrentValue('palette', manifest) === null);
  check('density has no recorded current value', fieldCurrentValue('density', manifest) === null);
  check('content has no recorded current value', fieldCurrentValue('content', manifest) === null);
  check('no manifest means no current value', fieldCurrentValue('type', null) === null);
  check('a manifest without a model reports null', fieldCurrentValue('model', { type: 'deck', system: 'omp-dark' }) === null);

  // A field pick builds the tweak sentence the metered path already understands.
  const noteType = buildFieldTweakNote('type', 'deck', 'prototype');
  check('type pick names the new type', noteType !== null && noteType.includes('deck'));
  check('type pick passes the shared validator', validateTweakNote(noteType ?? '') === null);
  const noteSystem = buildFieldTweakNote('system', 'omp-dark', 'stripe-linear');
  check('system pick names the new system', noteSystem !== null && noteSystem.includes('omp-dark'));
  const noteDensity = buildFieldTweakNote('density', 'spacious', null);
  check('density pick carries the step', noteDensity !== null && noteDensity.includes('spacious'));
  const notePalette = buildFieldTweakNote('palette', 'terracotta', null);
  check('palette pick carries the hex the agent needs', notePalette !== null && notePalette.includes('#C96442'));
  const noteModel = buildFieldTweakNote('model', 'some/model', 'deepseek/deepseek-v4.1-flash');
  check('model pick names the model', noteModel !== null && noteModel.includes('some/model'));
  const noteContent = buildFieldTweakNote('content', 'New headline', null);
  check('content pick carries the replacement copy', noteContent !== null && noteContent.includes('New headline'));

  // A no-op or empty pick never becomes a metered call.
  check('picking the current type produces no note', buildFieldTweakNote('type', 'prototype', 'prototype') === null);
  check('picking the current system produces no note', buildFieldTweakNote('system', 'stripe-linear', 'stripe-linear') === null);
  check('an empty value produces no note', buildFieldTweakNote('type', '   ', 'prototype') === null);
  check('an unknown palette id still says what it asked for', (buildFieldTweakNote('palette', 'chartreuse', null) ?? '').includes('chartreuse'));
  check(
    'every produced note fits the shared tweak cap',
    [noteType, noteSystem, noteDensity, notePalette, noteModel, noteContent].every(
      (n) => n !== null && n.length <= DESIGN_TWEAK_NOTE_CAP,
    ),
  );
}

console.log(`\nDESIGN PROBE: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
