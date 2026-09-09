/**
 * activity-bar.test.ts — probe for the REQ-008 activity rail mapping.
 * Run: `bun src/components/shell/activity-bar.test.ts` (no DOM, no server —
 * only the pure `activityInspectorTab` mapper + the static item table).
 */
import { ACTIVITY_ITEMS, activityDragId, activityInspectorTab, type ActivityKey } from './activity-bar';
import { isRailDropId } from '@/components/panes/panes';

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
check('vault opens vault tab', activityInspectorTab('vault') === 'vault');
check('testing opens testing tab', activityInspectorTab('testing') === 'testing');
check('bots opens bots tab', activityInspectorTab('bots') === 'bots');
check('settings opens settings tab', activityInspectorTab('settings') === 'settings');
check('account opens no inspector tab (settings modal)', activityInspectorTab('account') === null);

const keys = ACTIVITY_ITEMS.map((item) => item.key);
check('nine rail items', keys.length === 9);
check('rail keys unique', new Set(keys).size === keys.length);
check(
  'sessions first, settings+account last',
  keys[0] === 'sessions' && keys[keys.length - 2] === 'settings' && keys[keys.length - 1] === 'account',
);
check(
  'every key maps without throwing',
  (['sessions', 'git', 'terminal', 'browser', 'vault', 'testing', 'bots', 'settings', 'account'] as ActivityKey[]).every(
    (key) => activityInspectorTab(key) === null || typeof activityInspectorTab(key) === 'string',
  ),
);
check(
  'every item has a label',
  ACTIVITY_ITEMS.every((item) => item.label.length > 0),
);
check(
  'REQ-026 every key drags as a valid rail drop id',
  (['sessions', 'git', 'terminal', 'browser', 'vault', 'testing', 'bots', 'settings', 'account'] as ActivityKey[]).every(
    (key) => isRailDropId(activityDragId(key)),
  ),
);
check('REQ-026 sessions drags as the sessions surface', activityDragId('sessions') === 'sessions');
check('REQ-026 mapped keys drag as their inspector tab', activityDragId('git') === 'git' && activityDragId('account') === 'sessions');

console.log(`activity-bar.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
