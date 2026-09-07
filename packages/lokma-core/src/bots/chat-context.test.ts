/**
 * Probe for bot-bound chat sessions (REQ-027, Docs/35 §8).
 * Run: `HOME=$(mktemp -d) bun src/bots/chat-context.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Real temp HOME on disk (startup env — bun snapshots HOME at boot; the
 * guard below refuses anything outside `/tmp/`). Real SessionStore files
 * under the temp HOME; real bot knowledge files under a temp cwd.
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import { strict as assert } from 'node:assert';
import { homedir } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SessionStore } from '../session/store.js';
import {
  BOT_CHAT_FILE_CAP,
  BOT_CHAT_KNOWLEDGE_CAP,
  buildBotSystemPreamble,
  capKnowledgeText,
  joinKnowledgeSections,
  readBotKnowledge,
} from './chat-context.js';
import type { Bot } from 'lokma-shared';

const home = homedir();
if (!home.startsWith('/tmp/')) {
  throw new Error(`refusing to run: HOME=${home} is not temp (launch as HOME=$(mktemp -d) bun ...)`);
}

let passed = 0;
function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`ok - ${name}`);
    })
    .catch((e) => {
      console.error(`FAIL - ${name}: ${(e as Error).message}`);
      process.exitCode = 1;
    });
}

function fakeBot(over: Partial<Bot> = {}): Bot {
  return {
    id: 'probe-bot',
    name: 'Probe Bot',
    description: 'probe',
    systemPrompt: 'You are a probe.',
    model: 'anthropic/claude-4-sonnet',
    fallback: [],
    tools: [],
    skills: [],
    mcpServers: [],
    knowledgeFiles: [],
    memoryScope: 'bot',
    budgets: { maxTokens: 1000, maxUsd: 1, maxTurns: 5 },
    visibility: 'private',
    version: '1.0.0',
    tags: [],
    featured: false,
    source: 'global',
    ...over,
  } as Bot;
}

await check('preamble holds SOUL only when no knowledge', () => {
  const out = buildBotSystemPreamble('Probe', 'You are a probe.', '  ');
  assert.ok(out.includes('[Bot: Probe]'));
  assert.ok(out.includes('You are a probe.'));
  assert.ok(!out.includes('[Bot knowledge]'));
});

await check('preamble appends knowledge section', () => {
  const out = buildBotSystemPreamble('Probe', 'Soul.', 'Fact: sky is blue.');
  assert.ok(out.includes('[Bot knowledge]'));
  assert.ok(out.includes('Fact: sky is blue.'));
});

await check('preamble skips empty SOUL but keeps knowledge', () => {
  const out = buildBotSystemPreamble('Probe', '   ', 'k');
  assert.ok(!out.includes('[Bot:'));
  assert.ok(out.includes('[Bot knowledge]'));
});

await check('capKnowledgeText cuts with marker', () => {
  const long = `x`.repeat(BOT_CHAT_FILE_CAP + 1000);
  const out = capKnowledgeText(long);
  assert.ok(out.length < long.length);
  assert.ok(out.includes('truncated'));
  assert.equal(capKnowledgeText('short'), 'short');
});

await check('joinKnowledgeSections skips empties and respects total cap', () => {
  const big = `y`.repeat(BOT_CHAT_KNOWLEDGE_CAP);
  const out = joinKnowledgeSections([
    { path: 'a.md', text: '   ' },
    { path: 'b.md', text: 'keep me' },
    { path: 'c.md', text: big },
  ]);
  assert.ok(out.includes('keep me'));
  assert.ok(out.length <= BOT_CHAT_KNOWLEDGE_CAP + 64);
});

await check('meta writeMeta keeps botId, empty clears, fork carries', async () => {
  const cwd = `/tmp/lokma-probe-${Date.now()}`;
  const store = new SessionStore(cwd);
  const id = `sess_probe_${Date.now()}`;
  await store.append(id, { role: 'user', content: 'hi', timestamp: new Date().toISOString() });
  await store.writeMeta(id, { model: 'm', botId: 'probe-bot' });
  const meta = await store.readMeta(id);
  assert.equal(meta?.botId, 'probe-bot');
  const sum = await store.summary(id);
  assert.equal(sum.botId, 'probe-bot');
  // Unrelated patch preserves the binding.
  await store.writeMeta(id, { title: 'T' });
  assert.equal((await store.readMeta(id))?.botId, 'probe-bot');
  // Empty string clears back to plain chat.
  await store.writeMeta(id, { botId: '' });
  assert.equal((await store.summary(id)).botId, null);
  // Fork carries the binding.
  await store.writeMeta(id, { botId: 'probe-bot' });
  const forked = await store.fork(id, `${id}_fork`);
  assert.equal((await store.readMeta(forked.id))?.botId, 'probe-bot');
});

await check('readBotKnowledge reads project bot files jailed', async () => {
  const cwd = `/tmp/lokma-probe-kb-${Date.now()}`;
  const dir = join(cwd, '.lokma', 'bots', 'probe-bot');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'notes.md'), 'Secret fact: 42.', 'utf-8');
  const bot = fakeBot({ source: 'project', knowledgeFiles: ['./notes.md', '../escape.md', '/abs.md'] });
  const out = await readBotKnowledge(bot, cwd);
  assert.ok(out.includes('Secret fact: 42.'));
  assert.ok(!out.includes('escape'));
  // Bundled bots have no dir — SOUL only, never an error.
  const bundled = fakeBot({ source: 'bundled', knowledgeFiles: ['./notes.md'] });
  assert.equal(await readBotKnowledge(bundled, cwd), '');
});

console.log(`\n${passed} checks passed`);
