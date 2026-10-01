/**
 * activity-bar.test.ts — probe for the REQ-008 activity rail mapping.
 * Run: `bun src/components/shell/activity-bar.test.ts` (no DOM, no server —
 * only the pure `activityInspectorTab` mapper + the static item table).
 */
import {
  ACTIVITY_ITEMS,
  ACTIVITY_MODAL_SECTIONS,
  activityDragId,
  activityInspectorTab,
  activityOpensPaneTab,
  isActivityModalKey,
  type ActivityKey,
} from './activity-bar';
import { isRailDropId } from '@/components/panes/panes';
import { surfacesWithHost } from '@lokma/shared/surfaces';

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

check('sessions lives in Explorer (null tab)', activityInspectorTab('sessions') === null);
check('git opens git tab', activityInspectorTab('git') === 'git');
check('terminal opens terminal tab', activityInspectorTab('terminal') === 'terminal');
check('browser opens browser tab', activityInspectorTab('browser') === 'browser');
check('vault opens no inspector tab (REQ-165: Settings → Vault modal section)', activityInspectorTab('vault') === null);
check('testing opens testing tab', activityInspectorTab('testing') === 'testing');
check('settings opens settings tab', activityInspectorTab('settings') === 'settings');
check('account opens no inspector tab (settings modal)', activityInspectorTab('account') === null);

const keys = ACTIVITY_ITEMS.map((item) => item.key);
check('eight rail items', keys.length === 8);
check('rail keys unique', new Set(keys).size === keys.length);
check(
  'sessions first, settings+account last',
  keys[0] === 'sessions' && keys[keys.length - 2] === 'settings' && keys[keys.length - 1] === 'account',
);
check(
  'every key maps without throwing',
  (['sessions', 'git', 'terminal', 'browser', 'vault', 'testing', 'settings', 'account'] as ActivityKey[]).every(
    (key) => activityInspectorTab(key) === null || typeof activityInspectorTab(key) === 'string',
  ),
);
check(
  'every item has a label',
  ACTIVITY_ITEMS.every((item) => item.label.length > 0),
);
check(
  'REQ-026 every key drags as a valid rail drop id',
  (['sessions', 'git', 'terminal', 'browser', 'vault', 'testing', 'settings', 'account'] as ActivityKey[]).every(
    (key) => isRailDropId(activityDragId(key)),
  ),
);
check('REQ-026 sessions drags as the sessions surface', activityDragId('sessions') === 'sessions');
check('REQ-026 mapped keys drag as their inspector tab', activityDragId('git') === 'git' && activityDragId('account') === 'sessions');
check(
  'REQ-109 only the browser key opens a pane tab on click',
  activityOpensPaneTab('browser') === true &&
    (['sessions', 'git', 'terminal', 'vault', 'testing', 'settings', 'account'] as ActivityKey[]).every(
      (key) => activityOpensPaneTab(key) === false,
    ),
);
check('REQ-109 browser drag still carries the browser drop id', activityDragId('browser') === 'browser');
// REQ-165 — Vault left the panes: its icon opens Settings → Vault and never
// drags (a modal surface has no pane drop target). Account's special case is
// the same shape, but account stays a plain 'sessions' drag fallback in the
// table while vault is registered in the modal map.
check(
  'REQ-165 vault is a modal entry (Settings section, no pane tab)',
  isActivityModalKey('vault') && ACTIVITY_MODAL_SECTIONS.vault === 'vault' && activityInspectorTab('vault') === null,
);
check(
  'REQ-165 no other activity key is a modal entry',
  (['sessions', 'git', 'terminal', 'browser', 'testing', 'settings', 'account'] as ActivityKey[]).every(
    (key) => isActivityModalKey(key) === false,
  ),
);

// REQ-181 — the three groups are PROJECTIONS of the shared surface catalog
// (activity-top / activity-pane / activity-bottom), not hand-maintained
// arrays; the modal map is the catalog's pane-group settings-section rows.
const catalogActivity = [
  ...surfacesWithHost('activity-top'),
  ...surfacesWithHost('activity-pane'),
  ...surfacesWithHost('activity-bottom'),
];
check(
  'REQ-181 activity list is the catalog projection (group order, then catalog order)',
  ACTIVITY_ITEMS.length === catalogActivity.length &&
    ACTIVITY_ITEMS.every(
      (item, index) => String(item.key) === catalogActivity[index].id && item.label === catalogActivity[index].label,
    ),
);
const catalogActivityModal = surfacesWithHost('activity-pane').filter((surface) => surface.opens === 'settings-section');
check(
  'REQ-181 ACTIVITY_MODAL_SECTIONS is the catalog projection',
  Object.keys(ACTIVITY_MODAL_SECTIONS).length === catalogActivityModal.length &&
    catalogActivityModal.every(
      (surface) => (ACTIVITY_MODAL_SECTIONS as Record<string, string | undefined>)[surface.id] === surface.section,
    ),
);

console.log(`activity-bar.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
