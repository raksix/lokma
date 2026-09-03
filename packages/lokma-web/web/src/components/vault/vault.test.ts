/**
 * VaultPane pure-helper probe — run with:
 *   `bun src/components/vault/vault.test.ts` from `packages/lokma-web/web`.
 * Exits non-zero on the first failure (16/16 style like prior waves).
 */
import {
  clampDepth,
  emptyIngestForm,
  layoutGraph,
  NODE_PALETTE,
  nodeRadius,
  normalizeNode,
  normalizeNodes,
  paletteIndex,
  resolveWikilinkClick,
  splitWikilinks,
  validateIngestForm,
  VAULT_MAX_DEPTH,
  VAULT_MIN_DEPTH,
  type VaultNode,
} from './vault';

let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`ok: ${name}`);
}

const node = (over: Partial<VaultNode> = {}): VaultNode => ({
  id: 'lokma/a.md',
  path: 'lokma/a.md',
  title: 'A note',
  tags: ['lokma'],
  links: 3,
  ...over,
});

// ─── normalizeNode ──────────────────────────────────────────────────
check('null raw skipped', normalizeNode(null) === null);
check('string raw skipped', normalizeNode('x') === null);
check('missing path skipped', normalizeNode({ title: 'No path' }) === null);
check(
  'full row kept',
  JSON.stringify(normalizeNode({ id: 'a', path: 'lokma/a.md', title: 'A', tags: ['t'], links: 2 })) !== null,
);
const titleFallback = normalizeNode({ path: 'lokma/my-note.md' });
check('title falls back to filename', titleFallback?.title === 'my-note.md');
const tagsFallback = normalizeNode({ path: 'x.md', tags: ['a', 1, null] });
check('non-string tags dropped', JSON.stringify(tagsFallback?.tags) === JSON.stringify(['a']));
check('bad links count zeroed', normalizeNode({ path: 'x.md', links: 'many' })?.links === 0);
check(
  'normalizeNodes drops nulls',
  normalizeNodes([{ path: 'a.md' }, null, { title: 'nope' }]).length === 1,
);

// ─── layout ─────────────────────────────────────────────────────────
check('empty graph places nothing', layoutGraph([]).length === 0);
const solo = layoutGraph([node()]);
check('single node centered', solo.length === 1 && solo[0].x === 150 && solo[0].y === 100);
const trio = layoutGraph([node(), node({ path: 'b.md', id: 'b.md' }), node({ path: 'c.md', id: 'c.md' })]);
check('trio placed inside viewBox', trio.every((n) => n.x >= 0 && n.x <= 300 && n.y >= 0 && n.y <= 200));
check(
  'layout deterministic',
  JSON.stringify(layoutGraph([node(), node({ path: 'b.md', id: 'b.md' })])) ===
    JSON.stringify(layoutGraph([node(), node({ path: 'b.md', id: 'b.md' })])),
);
check('radius base 4', nodeRadius(0) === 4);
check('radius grows with degree', nodeRadius(3) === 7);
check('radius capped at 12', nodeRadius(99) === 12);
check('radius clamps negatives', nodeRadius(-5) === 4);
check('palette stable', paletteIndex('lokma/a.md', NODE_PALETTE.length) === paletteIndex('lokma/a.md', NODE_PALETTE.length));
check('palette in range', paletteIndex('lokma/a.md', NODE_PALETTE.length) < NODE_PALETTE.length);

// ─── wikilinks ──────────────────────────────────────────────────────
const chunks = splitWikilinks('See [[Pane System]] and [[vault/a|Label]] done');
check('two links found', chunks.filter((c) => c.kind === 'link').length === 2);
check('plain text kept', chunks[0].kind === 'text' && chunks[0].text.includes('See'));
const section = splitWikilinks('Jump to [[Note#part]] now');
check(
  'section stripped from target',
  section.some((c) => c.kind === 'link' && c.target === 'Note' && c.label === 'Note'),
);
check('label override kept', chunks.some((c) => c.kind === 'link' && c.target === 'vault/a' && c.label === 'Label'));
check('no links is one text chunk', splitWikilinks('plain').length === 1);
check('empty body is one chunk', splitWikilinks('')[0].kind === 'text');

const pool: VaultNode[] = [
  node(),
  node({ id: 'lokma/pane.md', path: 'lokma/pane.md', title: 'Pane System' }),
  node({ id: 'vault/deep/note.md', path: 'vault/deep/note.md', title: 'Deep Note' }),
];
check('exact path resolves', resolveWikilinkClick('lokma/pane.md', pool) === 'lokma/pane.md');
check('bare name resolves to .md', resolveWikilinkClick('lokma/pane', pool) === 'lokma/pane.md');
check('basename resolves', resolveWikilinkClick('note', pool) === 'vault/deep/note.md');
check('unknown target is null', resolveWikilinkClick('nope-nowhere', pool) === null);
check('blank target is null', resolveWikilinkClick('  ', pool) === null);

// ─── depth + ingest form ────────────────────────────────────────────
check('depth clamps low', clampDepth(0) === VAULT_MIN_DEPTH);
check('depth clamps high', clampDepth(9) === VAULT_MAX_DEPTH);
check('depth rounds', clampDepth(2.4) === 2);
check('depth NaN defaults 2', clampDepth(Number.NaN) === 2);
check('empty form blank', JSON.stringify(emptyIngestForm()) !== '');
check('ingest needs path', validateIngestForm({ path: '', provenance: '', content: 'x' }) !== null);
check(
  'ingest needs .md',
  validateIngestForm({ path: 'note.txt', provenance: '', content: 'x' }) !== null,
);
check(
  'ingest needs content',
  validateIngestForm({ path: 'n.md', provenance: '', content: '  ' }) !== null,
);
check(
  'ingest rejects bad provenance',
  validateIngestForm({ path: 'n.md', provenance: 'has space!', content: 'x' }) !== null,
);
check(
  'ingest accepts full form',
  validateIngestForm({ path: 'lokma/n.md', provenance: 'builder-1', content: '# Hi' }) === null,
);
check(
  'ingest accepts empty provenance',
  validateIngestForm({ path: 'n.md', provenance: '', content: 'x' }) === null,
);

console.log(`\nPASS: ${passed} checks`);
