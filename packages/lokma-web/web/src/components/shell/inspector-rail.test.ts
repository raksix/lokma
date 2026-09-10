/**
 * inspector-rail.test.ts — probe for the REQ-010 inspector rail.
 * Run: `bun src/components/shell/inspector-rail.test.ts` (no DOM, no
 * server — only the pure `inspectorRailSide` mapper + the static item
 * table).
 */
import { INSPECTOR_RAIL_ITEMS, inspectorRailSide } from './inspector-rail';
import { encodeInspectorDrag, isRailDropId, parseInspectorDrop } from '@/components/panes/panes';

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`FAIL: ${name}`);
  }
}

check('rail sits opposite the Explorer (left)', inspectorRailSide('left') === 'right');
check('rail sits opposite the Explorer (right)', inspectorRailSide('right') === 'left');

const tabs = INSPECTOR_RAIL_ITEMS.map((item) => item.tab);
check('twenty-three rail items (all Inspector menus)', tabs.length === 23);
check('rail tabs unique', new Set(tabs).size === tabs.length);
check('files first (VS Code Explorer position), todos last', tabs[0] === 'files' && tabs[tabs.length - 1] === 'todos');
check(
  'covers every Inspector menu',
  ['files', 'providers', 'models', 'usage', 'settings', 'terminal', 'git', 'browser', 'agents', 'orchestration', 'vault', 'skills', 'archify', 'design', 'testing', 'bots', 'setup', 'plugins', 'observability', 'cron', 'extras', 'memory'].every(
    (tab) => tabs.includes(tab as (typeof tabs)[number]),
  ),
);
check(
  'every item has a label and an icon',
  INSPECTOR_RAIL_ITEMS.every((item) => item.label.length > 0 && typeof item.Icon !== 'undefined'),
);
check(
  'REQ-026 every rail tab drags as a valid rail drop id',
  INSPECTOR_RAIL_ITEMS.every((item) => isRailDropId(item.tab)),
);
check('REQ-026 rail drag payload round-trips', INSPECTOR_RAIL_ITEMS.every((item) => parseInspectorDrop({ getData: (t: string) => (t === 'application/x-lokma-inspector' ? encodeInspectorDrag(item.tab) : '') }) === item.tab));

console.log(`inspector-rail.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
