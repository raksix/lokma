/**
 * Probe for bot-chat helpers (`./bot-chat` — REQ-027, Docs/35 §8).
 * Run: `bun src/components/bots/bot-chat.test.ts` from `packages/lokma-web/web`.
 * No test framework — plain asserts, same convention as `bots.test.ts`.
 * Not imported by library code; `tsconfig.app.json` excludes `*.test.ts`.
 */
import { strict as assert } from 'node:assert';
import { botClearPatch, botSwitchPatch, filterPickerBots, sessionBotName } from './bot-chat';
import type { Bot } from '@/lib/api';

let passed = 0;
function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}: ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

const bots = [
  { id: 'lokma-ceo', name: 'Lokma CEO', description: 'Strategy brain', model: 'm1' },
  { id: 'reviewer', name: 'Reviewer', description: 'Strict diffs', model: 'm2' },
] as Bot[];

check('switch patch binds id and follows model', () => {
  assert.deepEqual(botSwitchPatch(bots[0]), { botId: 'lokma-ceo', model: 'm1' });
});

check('clear patch empties the binding', () => {
  assert.deepEqual(botClearPatch(), { botId: '' });
});

check('session bot name resolves or falls back', () => {
  assert.equal(sessionBotName('reviewer', bots), 'Reviewer');
  assert.equal(sessionBotName('ghost', bots), '#ghost');
  assert.equal(sessionBotName(null, bots), null);
  assert.equal(sessionBotName('', bots), null);
});

check('picker filter matches name/id/description', () => {
  assert.equal(filterPickerBots(bots, '').length, 2);
  assert.equal(filterPickerBots(bots, 'ceo')[0].id, 'lokma-ceo');
  assert.equal(filterPickerBots(bots, 'REVIEWER')[0].id, 'reviewer');
  assert.equal(filterPickerBots(bots, 'strict')[0].id, 'reviewer');
  assert.equal(filterPickerBots(bots, 'nope').length, 0);
});

console.log(`\n${passed} checks passed`);
