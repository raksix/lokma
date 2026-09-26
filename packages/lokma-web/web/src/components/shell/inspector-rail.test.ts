/**
 * inspector-rail.test.ts — probe for the REQ-010 inspector rail.
 * Run: `bun src/components/shell/inspector-rail.test.ts` (no DOM, no
 * server — only the pure `inspectorRailSide` mapper + the static item
 * table).
 */
import {
  INSPECTOR_RAIL_ITEMS,
  RAIL_MODAL_SECTIONS,
  RAIL_STANDALONE_MODALS,
  inspectorRailSide,
  isRailModalTab,
  isRailNonPaneTab,
  isRailStandaloneModalTab,
  visibleInspectorRailItems,
} from './inspector-rail';
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
check('twenty-one rail items (15 Inspector menus + the 5 Settings-modal entries + the standalone Archify modal entry; REQ-168 removed Design)', tabs.length === 21);
check('rail tabs unique', new Set(tabs).size === tabs.length);
check('files first (VS Code Explorer position), todos last', tabs[0] === 'files' && tabs[tabs.length - 1] === 'todos');
check(
  'covers every Inspector menu',
  ['files', 'providers', 'models', 'usage', 'settings', 'terminal', 'git', 'browser', 'agents', 'orchestration', 'vault', 'skills', 'archify', 'testing', 'setup', 'plugins', 'observability', 'cron', 'extras', 'memory'].every(
    (tab) => tabs.includes(tab as (typeof tabs)[number]),
  ),
);
check('REQ-168 Design left the rail (its own page behind the header switch)', !tabs.includes('design' as (typeof tabs)[number]));
check(
  'every item has a label and an icon',
  INSPECTOR_RAIL_ITEMS.every((item) => item.label.length > 0 && typeof item.Icon !== 'undefined'),
);
// REQ-163 — the Agent Hub rail icon opens the Settings modal; it has no
// pane/tab anymore, so it is exempt from the REQ-026 drag contract while
// every other rail entry still drags as a valid rail drop id.
check(
  'REQ-163/164/165/166 the modal rail entries open their Settings sections',
  isRailModalTab('agents') && RAIL_MODAL_SECTIONS.agents === 'agents' &&
    isRailModalTab('orchestration') && RAIL_MODAL_SECTIONS.orchestration === 'orchestration' &&
    isRailModalTab('vault') && RAIL_MODAL_SECTIONS.vault === 'vault' &&
    isRailModalTab('memory') && RAIL_MODAL_SECTIONS.memory === 'memory' &&
    isRailModalTab('skills') && RAIL_MODAL_SECTIONS.skills === 'skills',
);
// REQ-167 — Archify launches its OWN standalone modal: not a Settings
// section, not a pane/tab; the rail icon stays as the launcher only.
check(
  'REQ-167 Archify is a standalone-modal rail entry (not a Settings section)',
  isRailStandaloneModalTab('archify') &&
    (RAIL_STANDALONE_MODALS as readonly string[]).includes('archify') &&
    !isRailModalTab('archify'),
);
check(
  'REQ-163/164/165/166/167 exactly six non-dragging rail tabs (agent hub + orchestration + vault + memory + skills + archify)',
  INSPECTOR_RAIL_ITEMS.filter((item) => isRailNonPaneTab(item.tab)).length === 6 &&
    INSPECTOR_RAIL_ITEMS.every((item) => !isRailNonPaneTab(item.tab) || item.tab === 'agents' || item.tab === 'orchestration' || item.tab === 'vault' || item.tab === 'memory' || item.tab === 'skills' || item.tab === 'archify'),
);
check(
  'REQ-026 every pane rail tab drags as a valid rail drop id',
  INSPECTOR_RAIL_ITEMS.every((item) => isRailNonPaneTab(item.tab) || isRailDropId(item.tab)),
);
check(
  'REQ-026 rail drag payload round-trips',
  INSPECTOR_RAIL_ITEMS.every((item) => {
    const tab = item.tab;
    if (isRailNonPaneTab(tab)) return true; // modal entry: never drags
    return (
      parseInspectorDrop({ getData: (t: string) => (t === 'application/x-lokma-inspector' ? encodeInspectorDrag(tab) : '') }) === tab
    );
  }),
);
check(
  'REQ-163 a stale agents drop is ignored (no pane definition)',
  parseInspectorDrop({ getData: (t: string) => (t === 'application/x-lokma-inspector' ? 'agents' : '') }) === null,
);
check(
  'REQ-164 a stale orchestration drop is ignored (no pane definition)',
  parseInspectorDrop({ getData: (t: string) => (t === 'application/x-lokma-inspector' ? 'orchestration' : '') }) === null,
);
check(
  'REQ-165 a stale vault drop is ignored (no pane definition)',
  parseInspectorDrop({ getData: (t: string) => (t === 'application/x-lokma-inspector' ? 'vault' : '') }) === null,
);
check(
  'REQ-165 a stale memory drop is ignored (no pane definition)',
  parseInspectorDrop({ getData: (t: string) => (t === 'application/x-lokma-inspector' ? 'memory' : '') }) === null,
);
check(
  'REQ-166 a stale skills drop is ignored (no pane definition)',
  parseInspectorDrop({ getData: (t: string) => (t === 'application/x-lokma-inspector' ? 'skills' : '') }) === null,
);
check(
  'REQ-167 a stale archify drop is ignored (no pane definition, standalone modal)',
  parseInspectorDrop({ getData: (t: string) => (t === 'application/x-lokma-inspector' ? 'archify' : '') }) === null,
);
check(
  'REQ-168 a stale design drop is ignored (no pane definition, Design is its own page)',
  parseInspectorDrop({ getData: (t: string) => (t === 'application/x-lokma-inspector' ? 'design' : '') }) === null,
);

// REQ-169 — the DISPLAY list is conditional: a bootstrapped instance drops
// the Setup entry; not-bootstrapped (and unknown → false) keeps the legacy
// list. The canonical table itself stays complete in both states.
const unbootedItems = visibleInspectorRailItems(false);
const bootedItems = visibleInspectorRailItems(true);
check('REQ-169 not bootstrapped keeps the legacy list (Setup present)', unbootedItems.length === INSPECTOR_RAIL_ITEMS.length && unbootedItems.some((item) => item.tab === 'setup'));
check(
  'REQ-169 bootstrapped drops exactly the Setup entry',
  bootedItems.length === unbootedItems.length - 1 && !bootedItems.some((item) => item.tab === 'setup'),
);
check(
  'REQ-169 bootstrapped list equals the full list minus Setup, order preserved',
  bootedItems.every((item, index) => {
    const expected = unbootedItems.filter((candidate) => candidate.tab !== 'setup');
    return item.tab === expected[index].tab && item.label === expected[index].label;
  }),
);
check('REQ-169 canonical table still carries Setup (pane registration untouched)', INSPECTOR_RAIL_ITEMS.some((item) => item.tab === 'setup'));

console.log(`inspector-rail.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
