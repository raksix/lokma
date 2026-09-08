/**
 * TodoPane pure-helper probe — run with:
 *   `bun src/components/todos/todos.test.ts` from `packages/lokma-web/web`.
 * Exits non-zero on the first failure (16/16 style like prior waves).
 */
import type { TodoView } from '@/lib/api';
import { groupLabel, groupTodos, holderLabel, leaseLabel, todoPrompt, validateTitle } from './todos';

let passed = 0;
function check(name: string, cond: boolean): void {
  if (!cond) {
    console.error(`FAIL: ${name}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`ok: ${name}`);
}

const todo = (over: Partial<TodoView> = {}): TodoView => ({
  id: 't_1',
  projectId: 'p_x',
  title: 'Do the thing',
  status: 'open',
  claimedBy: null,
  leaseUntil: null,
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
  completedAt: null,
  ...over,
});

// ─── grouping ────────────────────────────────────────────────────
const board = [
  todo({ id: 't_open' }),
  todo({ id: 't_mine', status: 'claimed', claimedBy: { sessionId: 'sess_me', userId: 'u_1', claimedAt: '2026-09-08T00:00:00.000Z' }, leaseUntil: Date.now() + 60_000 }),
  todo({ id: 't_theirs', status: 'claimed', claimedBy: { sessionId: 'sess_other', userId: 'u_2', claimedAt: '2026-09-08T00:00:00.000Z' }, leaseUntil: Date.now() + 60_000 }),
  todo({ id: 't_done', status: 'done', completedAt: '2026-09-08T01:00:00.000Z' }),
];
const groups = groupTodos(board, 'sess_me');
check('open lands in open', groups.open.length === 1 && groups.open[0]?.id === 't_open');
check('own claim lands in mine', groups.mine.length === 1 && groups.mine[0]?.id === 't_mine');
check('чужой claim lands in others', groups.others.length === 1 && groups.others[0]?.id === 't_theirs');
check('done lands in done', groups.done.length === 1 && groups.done[0]?.id === 't_done');
const anon = groupTodos(board, null);
check('anonymous sees no mine', anon.mine.length === 0 && anon.others.length === 2);
check('group labels read human', groupLabel('mine') === 'Claimed by me' && groupLabel('others') === 'In progress');

// ─── holder + lease ──────────────────────────────────────────────
const claimed = todo({
  status: 'claimed',
  claimedBy: { sessionId: 'sess_abcdefghijklmnop', userId: 'u_9', claimedAt: '2026-09-08T00:00:00.000Z' },
  leaseUntil: Date.now() + 125_000,
});
check('holder label shortens session', holderLabel(claimed).startsWith('sess_abcdefghi') && holderLabel(claimed).includes('u_9'));
check('unclaimed label', holderLabel(todo()) === 'unclaimed');
check('live lease shows minutes', leaseLabel(claimed).includes('m'));
check('short lease shows seconds', leaseLabel(todo({ status: 'claimed', leaseUntil: Date.now() + 30_000 })).endsWith('s'));
check('expired lease reads expired', leaseLabel(todo({ status: 'claimed', leaseUntil: Date.now() - 1000 })) === 'expired');
check('open todo has no lease', leaseLabel(todo()) === 'expired');

// ─── prompt + validation ─────────────────────────────────────────
const prompt = todoPrompt(todo({ id: 't_7', projectId: 'p_z', title: 'Fix login' }), 'Site');
check('prompt names todo + claim tool', prompt.includes('Fix login') && prompt.includes('claim_todo') && prompt.includes('t_7'));
check('blank title rejected', validateTitle('   ') !== null);
check('long title rejected', validateTitle('x'.repeat(201)) !== null);
check('good title accepted', validateTitle('Ship it') === null);

console.log(`\n${passed} checks passed`);
