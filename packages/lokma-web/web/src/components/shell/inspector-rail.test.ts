/**
 * inspector-rail.test.ts — probe for the REQ-010 inspector rail.
 * Run: `bun src/components/shell/inspector-rail.test.ts` (no DOM, no
 * server — only the pure `inspectorRailSide` mapper + the static item
 * table).
 */
import { INSPECTOR_RAIL_ITEMS, RAIL_MODAL_SECTIONS, inspectorRailSide, isRailModalTab } from './inspector-rail';
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
check('twenty-two rail items (21 Inspector menus + the Agent Hub modal entry)', tabs.length === 22);
check('rail tabs unique', new Set(tabs).size === tabs.length);
check('files first (VS Code Explorer position), todos last', tabs[0] === 'files' && tabs[tabs.length - 1] === 'todos');
check(
  'covers every Inspector menu',
  ['files', 'providers', 'models', 'usage', 'settings', 'terminal', 'git', 'browser', 'agents', 'orchestration', 'vault', 'skills', 'archify', 'design', 'testing', 'setup', 'plugins', 'observability', 'cron', 'extras', 'memory'].every(
    (tab) => tabs.includes(tab as (typeof tabs)[number]),
  ),
);
check(
  'every item has a label and an icon',
  INSPECTOR_RAIL_ITEMS.every((item) => item.label.length > 0 && typeof item.Icon !== 'undefined'),
);
// REQ-163 — the Agent Hub rail icon opens the Settings modal; it has no
// pane/tab anymore, so it is exempt from the REQ-026 drag contract while
// every other rail entry still drags as a valid rail drop id.
check(
  'REQ-163 agent hub rail entry opens the Agent Hub settings section',
  isRailModalTab('agents') && RAIL_MODAL_SECTIONS.agents === 'agents',
);
check(
  'REQ-163 the agent hub entry is the only non-dragging rail tab',
  INSPECTOR_RAIL_ITEMS.filter((item) => isRailModalTab(item.tab)).length === 1 &&
    INSPECTOR_RAIL_ITEMS.every((item) => !isRailModalTab(item.tab) || item.tab === 'agents'),
);
check(
  'REQ-026 every pane rail tab drags as a valid rail drop id',
  INSPECTOR_RAIL_ITEMS.every((item) => isRailModalTab(item.tab) || isRailDropId(item.tab)),
);
check(
  'REQ-026 rail drag payload round-trips',
  INSPECTOR_RAIL_ITEMS.every((item) => {
    const tab = item.tab;
    if (isRailModalTab(tab)) return true; // modal entry: never drags
    return (
      parseInspectorDrop({ getData: (t: string) => (t === 'application/x-lokma-inspector' ? encodeInspectorDrag(tab) : '') }) === tab
    );
  }),
);
check(
  'REQ-163 a stale agents drop is ignored (no pane definition)',
  parseInspectorDrop({ getData: (t: string) => (t === 'application/x-lokma-inspector' ? 'agents' : '') }) === null,
);

console.log(`inspector-rail.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
