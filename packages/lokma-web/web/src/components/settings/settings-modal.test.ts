/**
 * settings-modal.test.ts — probe for the REQ-022 settings-modal registry.
 * Run: `bun src/components/settings/settings-modal.test.ts` (no DOM, no server).
 */
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_SECTIONS,
  isSettingsSection,
} from './settings';

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

// Registry shape — OpenCode-style categories in display order.
check('fifteen sections', SETTINGS_SECTIONS.length === 15);
check('general first', SETTINGS_SECTIONS[0].id === 'general');
check('account second (own profile only)', SETTINGS_SECTIONS[1].id === 'account');
check('admin third (users/roles/projects/policy)', SETTINGS_SECTIONS[2].id === 'admin');
check('admin label', SETTINGS_SECTIONS[2].label === 'Admin');
// REQ-163 — Agent Hub moved out of the panes into its own Settings section.
check('agent hub section present', SETTINGS_SECTIONS.some((s) => s.id === 'agents'));
check('agent hub label', SETTINGS_SECTIONS.find((s) => s.id === 'agents')?.label === 'Agent Hub');
check('agent hub sits beside models (agent surfaces together)', SETTINGS_SECTIONS.findIndex((s) => s.id === 'agents') === SETTINGS_SECTIONS.findIndex((s) => s.id === 'models') + 1);
// REQ-164 — Orchestration followed Agent Hub out of the panes.
check('orchestration section present', SETTINGS_SECTIONS.some((s) => s.id === 'orchestration'));
check('orchestration label', SETTINGS_SECTIONS.find((s) => s.id === 'orchestration')?.label === 'Orchestration');
check('orchestration sits beside agent hub', SETTINGS_SECTIONS.findIndex((s) => s.id === 'orchestration') === SETTINGS_SECTIONS.findIndex((s) => s.id === 'agents') + 1);
check('about last', SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1].id === 'about');
check('ids unique', new Set(SETTINGS_SECTIONS.map((s) => s.id)).size === SETTINGS_SECTIONS.length);
check('labels non-empty', SETTINGS_SECTIONS.every((s) => s.label.length > 0));
check(
  'covers config surfaces',
  ['general', 'appearance', 'providers', 'models', 'permissions', 'mcp'].every((id) =>
    SETTINGS_SECTIONS.some((s) => s.id === id),
  ),
);
check(
  'covers harness surfaces',
  ['memory', 'cron', 'shortcuts', 'plugins', 'about'].every((id) =>
    SETTINGS_SECTIONS.some((s) => s.id === id),
  ),
);

// Default + guard.
check('default is general', DEFAULT_SETTINGS_SECTION === 'general');
check('guard accepts admin', isSettingsSection('admin'));
check('guard accepts providers', isSettingsSection('providers'));
check('guard accepts shortcuts', isSettingsSection('shortcuts'));
check('guard accepts agents (REQ-163)', isSettingsSection('agents'));
check('guard accepts orchestration (REQ-164)', isSettingsSection('orchestration'));
check('guard rejects unknown', !isSettingsSection('neon'));
check('guard rejects empty', !isSettingsSection(''));
check('guard rejects non-string', !isSettingsSection(42));

console.log(`settings-modal.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
