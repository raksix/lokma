/**
 * settings-modal.test.ts — probe for the REQ-022 settings-modal registry.
 * Run: `bun src/components/settings/settings-modal.test.ts` (no DOM, no server).
 */
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_FULLSCREEN_KEY,
  SETTINGS_SECTIONS,
  SETTINGS_SHELL_CLASS,
  SETTINGS_SHELL_FULLSCREEN_CLASS,
  isSettingsSection,
  readSettingsFullscreen,
  settingsDeepLink,
  settingsShellClass,
  writeSettingsFullscreen,
  type StorageLike,
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
check('eighteen sections', SETTINGS_SECTIONS.length === 18);
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
// REQ-165 — Vault joined as a new section; Memory's section already existed.
check('vault section present', SETTINGS_SECTIONS.some((s) => s.id === 'vault'));
check('vault label', SETTINGS_SECTIONS.find((s) => s.id === 'vault')?.label === 'Vault');
check('vault sits beside memory (vault/memory surfaces together)', SETTINGS_SECTIONS.findIndex((s) => s.id === 'vault') === SETTINGS_SECTIONS.findIndex((s) => s.id === 'memory') - 1);
// REQ-166 — Skills left the panes for its own Settings section.
check('skills section present', SETTINGS_SECTIONS.some((s) => s.id === 'skills'));
check('skills label', SETTINGS_SECTIONS.find((s) => s.id === 'skills')?.label === 'Skills');
check('skills sits beside plugins (capability catalogs together)', SETTINGS_SECTIONS.findIndex((s) => s.id === 'skills') === SETTINGS_SECTIONS.findIndex((s) => s.id === 'plugins') + 1);
// REQ-193 Kapsam 4 — Share: the tunnel panel is its own section, placed
// beside the catalogs' tail and before About.
check('share section present', SETTINGS_SECTIONS.some((s) => s.id === 'share'));
check('share label', SETTINGS_SECTIONS.find((s) => s.id === 'share')?.label === 'Share');
check('share sits between skills and about', (() => { const ids = SETTINGS_SECTIONS.map((s) => s.id); return ids.indexOf('share') === ids.indexOf('skills') + 1 && ids.indexOf('about') === ids.indexOf('share') + 1; })());
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
check('guard accepts vault (REQ-165)', isSettingsSection('vault'));
check('guard accepts memory (REQ-165)', isSettingsSection('memory'));
check('guard accepts skills (REQ-166)', isSettingsSection('skills'));
check('guard accepts share (REQ-193)', isSettingsSection('share'));
check('guard rejects unknown', !isSettingsSection('neon'));
check('guard rejects empty', !isSettingsSection(''));
check('guard rejects non-string', !isSettingsSection(42));

// REQ-194 — full-screen shell: geometry, persistence and the deep link.
// A stub storage stands in for localStorage so the round-trip is measured
// under bun with no DOM (the real modal reads the same key).
function stubStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

const store = stubStorage();
// Default geometry is untouched (768x640 well) — a regression guard.
check('default shell keeps the 640px height', settingsShellClass(false).includes('h-[640px]'));
check('default shell keeps max-w-3xl', settingsShellClass(false).includes('max-w-3xl'));
check('default shell is the constant', settingsShellClass(false) === SETTINGS_SHELL_CLASS);
check('default shell drops max-w in full screen', !settingsShellClass(true).includes('max-w-3xl'));
check('full screen fills the viewport', settingsShellClass(true).includes('h-screen') && settingsShellClass(true).includes('w-screen'));
check('full screen drops the fixed height', !settingsShellClass(true).includes('h-[640px]'));
check('full screen has no max-height', !settingsShellClass(true).includes('max-h-['));
check('full screen is edge-less', !settingsShellClass(true).includes('rounded-xl'));
check('full screen is the constant', settingsShellClass(true) === SETTINGS_SHELL_FULLSCREEN_CLASS);
check(
  'both shells are flex columns',
  settingsShellClass(false).startsWith('flex ') &&
    settingsShellClass(true).startsWith('flex ') &&
    settingsShellClass(false).includes('flex-col') &&
    settingsShellClass(true).includes('flex-col'),
);

// Persistence round-trip.
check('preference starts off', readSettingsFullscreen(store) === false);
writeSettingsFullscreen(true, store);
check('preference survives a write', readSettingsFullscreen(store) === true);
check('write used the documented key', store.data[SETTINGS_FULLSCREEN_KEY] === '1');
check('key is versioned', SETTINGS_FULLSCREEN_KEY === 'lokma-settings-fullscreen:v1');
writeSettingsFullscreen(false, store);
check('reset returns to the default shell', readSettingsFullscreen(store) === false);
check('reset removes the key', !(SETTINGS_FULLSCREEN_KEY in store.data));
check('absent storage is simply off', readSettingsFullscreen(null) === false);
check('absent storage write never throws', (() => {
  writeSettingsFullscreen(true, null);
  return true;
})());
check('garbage value is not full screen', readSettingsFullscreen(stubStorage({ [SETTINGS_FULLSCREEN_KEY]: 'true' })) === false);
check('empty value is not full screen', readSettingsFullscreen(stubStorage({ [SETTINGS_FULLSCREEN_KEY]: '' })) === false);
check('throwing storage never breaks the toggle', (() => {
  const hostile: StorageLike = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  };
  writeSettingsFullscreen(true, hostile);
  return readSettingsFullscreen(hostile) === false;
})());

// Deep link `?settings=<section>&fullscreen=1`.
check('no settings param means no open', settingsDeepLink('') === null);
check('other params do not open it', settingsDeepLink('?token=abc&session=x') === null);
check('models deep link', (() => {
  const link = settingsDeepLink('?settings=models&fullscreen=1');
  return link?.section === 'models' && link.fullscreen === true;
})());
check('deep link without fullscreen stays small', settingsDeepLink('?settings=models')?.fullscreen === false);
check('fullscreen flag needs the exact value', settingsDeepLink('?settings=models&fullscreen=0')?.fullscreen === false);
check('deep link is order independent', settingsDeepLink('?fullscreen=1&settings=providers')?.section === 'providers');
check('unknown section falls back to the default', settingsDeepLink('?settings=neon')?.section === DEFAULT_SETTINGS_SECTION);
check('unknown section does not enable full screen', settingsDeepLink('?settings=neon&fullscreen=1')?.section === DEFAULT_SETTINGS_SECTION);
check('every registry section deep-links', SETTINGS_SECTIONS.every((s) => settingsDeepLink(`?settings=${s.id}`)?.section === s.id));
check('empty search does not throw', settingsDeepLink('') === null);
check('malformed search does not throw', settingsDeepLink('%') === null || settingsDeepLink('%')?.section === DEFAULT_SETTINGS_SECTION);

console.log(`settings-modal.test.ts: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
