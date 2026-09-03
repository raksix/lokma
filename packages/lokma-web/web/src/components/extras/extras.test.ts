/**
 * ExtrasPane pure-helper probe — run with:
 *   `bun src/components/extras/extras.test.ts` from `packages/lokma-web/web`.
 * Exits non-zero on the first failure (16/16 style like prior waves).
 */
import {
  EXTRAS,
  buildFeaturesPatch,
  countDone,
  filterExtras,
  isShipped,
  progressPct,
  readFeatures,
} from './extras';

let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`ok: ${name}`);
}

// ─── registry: 23 rows, concept order/titles ────────────────────────────────
check('registry has 23 rows', EXTRAS.length === 23);
check(
  'rows numbered 1..23 in order',
  EXTRAS.every((e, i) => e.n === i + 1),
);
check(
  'slugs unique + kebab',
  new Set(EXTRAS.map((e) => e.slug)).size === 23 &&
    EXTRAS.every((e) => /^[a-z0-9-]+$/.test(e.slug)),
);

const conceptTitles: Array<[number, string]> = [
  [1, 'Agent templates marketplace'],
  [2, 'Per-agent budgets (hard 80% alert)'],
  [3, 'Eval harness'],
  [4, 'Time-travel fork'],
  [5, 'Per-agent cron'],
  [6, 'Human-in-the-loop approvals'],
  [7, 'Observability trace'],
  [8, 'Handoff protocol'],
  [9, 'Auto-scaling maxConcurrent'],
  [10, 'Sandbox per agent (docker|host)'],
  [11, 'Browser per agent'],
  [12, 'Skill sharing across agents'],
  [13, 'Voice per agent'],
  [14, 'Agent-vs-agent adversarial review'],
  [15, 'Token-tiered delegationModel'],
  [16, 'Worktree GC (ttl 7d)'],
  [17, 'Replay deterministic re-run'],
  [18, 'MCP agentTemplate import'],
  [19, 'Affinity + work-stealing'],
  [20, 'Session → agent drag handoff'],
  [21, 'lokma doctor --agents'],
  [22, 'Vault graph provenance agentId'],
  [23, 'Per-agent trace share'],
];
for (const [n, title] of conceptTitles) {
  check(`#${n} title matches concept`, EXTRAS[n - 1]?.title === title);
}
check(
  'every row has non-empty why/how/where',
  EXTRAS.every((e) => e.why.length > 0 && e.how.length > 0 && e.where.length > 0),
);

// ─── shipped/todo split (honest, verified against this checkout) ───────────
check('shipped count is 14', countDone(EXTRAS) === 14);
check('progress is 61%', progressPct(EXTRAS) === 61);
// Honest deviations from the concept `done` column: #11 browser-per-agent
// shipped via W3-12, #16 worktree GC shipped via the W3-11 GC button.
check('#11 browser-per-agent shipped (W3-12)', isShipped(EXTRAS[10]));
check('#16 worktree GC shipped (W3-11)', isShipped(EXTRAS[15]));
// Milestone-only rows are todo, never shipped (#20 waits on W7).
check('#20 milestone-only is todo', !isShipped(EXTRAS[19]));
check(
  '#20 carries the W7 milestone',
  (EXTRAS[19]?.milestone ?? '').includes('W7'),
);
check(
  'concept-done rows stay shipped',
  [1, 2, 4, 5, 6, 7, 12, 13, 17, 21, 22, 23].every((n) => isShipped(EXTRAS[n - 1]!)),
);
check(
  'flagged rows are todo',
  EXTRAS.filter((e) => e.flag !== undefined).every((e) => !isShipped(e)),
);
check(
  '8 flagged rows',
  EXTRAS.filter((e) => e.flag !== undefined).length === 8,
);
check(
  'flags use the extras.* namespace',
  EXTRAS.filter((e) => e.flag !== undefined).every((e) => e.flag!.startsWith('extras.')),
);
check(
  'todo rows all carry a milestone',
  EXTRAS.filter((e) => !isShipped(e)).every(
    (e) => typeof e.milestone === 'string' && e.milestone.length > 0,
  ),
);
check(
  'shipped tab targets are real Inspector tabs',
  EXTRAS.filter((e) => e.tab !== undefined).every((e) =>
    [
      'bots', 'agents', 'testing', 'cron', 'observability', 'browser',
      'skills', 'git', 'setup', 'vault', 'plugins', 'orchestration',
    ].includes(e.tab!),
  ),
);

// ─── filter helpers ─────────────────────────────────────────────────────────
check('filter all returns 23', filterExtras(EXTRAS, 'all').length === 23);
check('filter done returns 14', filterExtras(EXTRAS, 'done').length === 14);
check('filter todo returns 9', filterExtras(EXTRAS, 'todo').length === 9);
check('empty registry progress is 0', progressPct([]) === 0);
check('empty registry done is 0', countDone([]) === 0);

// ─── features payload helpers ───────────────────────────────────────────────
check('readFeatures parses the config shape', (() => {
  const got = readFeatures({ config: { features: { 'extras.eval-harness': true } } });
  return got['extras.eval-harness'] === true;
})());
check('readFeatures drops non-booleans', (() => {
  const got = readFeatures({ config: { features: { a: true, b: 'yes', c: 1 } } });
  return got.a === true && !('b' in got) && !('c' in got);
})());
check('readFeatures guards garbage', (
  Object.keys(readFeatures(null)).length === 0 &&
  Object.keys(readFeatures({})).length === 0 &&
  Object.keys(readFeatures({ config: null })).length === 0 &&
  Object.keys(readFeatures({ config: { features: [] } })).length === 0
));
check('patch keeps sibling flags (no wipe)', (() => {
  const body = buildFeaturesPatch(
    { browser: true, 'extras.eval-harness': false },
    'extras.eval-harness',
    true,
  ) as { features: Record<string, boolean> };
  return (
    body.features.browser === true && body.features['extras.eval-harness'] === true
  );
})());
check('patch adds a fresh flag', (() => {
  const body = buildFeaturesPatch({}, 'extras.affinity', true) as {
    features: Record<string, boolean>;
  };
  return body.features['extras.affinity'] === true;
})());

console.log(`\n${passed} checks passed`);
