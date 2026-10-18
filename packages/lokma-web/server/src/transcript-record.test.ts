/**
 * Probe for the REQ-205 client-free record policy (`./transcript-record`).
 * Run: `HOME=$(TMPDIR=/tmp mktemp -d) bun src/transcript-record.test.ts` from
 * `packages/lokma-web/server`. No test framework — plain asserts.
 *
 * The guard refuses a non-/tmp HOME: bun snapshots HOME at boot, so a runtime
 * override would pollute the real `~/.lokma`. Not imported by server code, so
 * `tsc -p` output ignores it.
 */
import { homedir } from 'node:os';
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { SessionStore, type SessionMessage } from '@lokma/core';
import type { ClientFreeRecordRow } from '@lokma/shared';
import { batchAlreadyRecorded } from './transcript-record.js';

const home = homedir();
if (!home.startsWith('/tmp/')) {
  throw new Error(`refusing to run outside a temp HOME (got ${home})`);
}

let passed = 0;
function check(cond: boolean, label: string): void {
  if (!cond) throw new Error('FAIL: ' + label);
  passed += 1;
  console.log('PASS: ' + label);
}

const batch: ClientFreeRecordRow[] = [
  { role: 'user', content: 'selam', timestamp: '2026-10-18T10:00:00.000Z' },
  { role: 'assistant', content: 'merhaba', timestamp: '2026-10-18T10:00:02.000Z' },
];
/** Rows as the ws handler appends them: optionally carrying the origin stamp. */
const stored = (rows: ClientFreeRecordRow[], origin?: 'client-free'): SessionMessage[] =>
  rows.map((r) => ({
    role: r.role,
    content: r.content,
    timestamp: r.timestamp,
    ...(origin ? { origin } : {}),
  }));
/** The handler's own call shape (origin always part of the comparison). */
const recorded = (messages: SessionMessage[], rows: ClientFreeRecordRow[]): boolean =>
  batchAlreadyRecorded(messages, rows, 'client-free');

// 1. Exact trailing batch → already recorded (the ack-loss retry case).
check(recorded(stored(batch, 'client-free'), batch), 'an identical trailing batch counts as already recorded');
// 2. Batch at the end of a longer transcript still matches (marker rows or
//    earlier turns may precede it).
check(
  recorded(
    [
      { role: 'assistant', content: 'Session created', timestamp: 'earlier' },
      { role: 'user', content: 'old', timestamp: 'older' },
      ...stored(batch, 'client-free'),
    ],
    batch,
  ),
  'a trailing batch matches after earlier rows',
);
// 3. Transcript shorter than the batch → not recorded.
check(
  !recorded(stored([batch[0]!], 'client-free'), batch),
  'a transcript shorter than the batch is never treated as recorded',
);
// 4. Same count, different content → new content must land.
check(
  !recorded(
    [
      { role: 'user', content: 'selam', timestamp: '2026-10-18T10:00:00.000Z' },
      { role: 'assistant', content: 'DIFFERENT', timestamp: '2026-10-18T10:00:02.000Z' },
    ],
    batch,
  ),
  'different trailing content is not a match',
);
// 5. Same content, different timestamp → two real sends differ; not a match.
check(
  !recorded(
    [
      { role: 'user', content: 'selam', timestamp: 't-other' },
      { role: 'assistant', content: 'merhaba', timestamp: '2026-10-18T10:00:02.000Z' },
    ],
    batch,
  ),
  'a differing timestamp is not a match',
);
// 6. Same rows in a different order → not a match.
const swapped: ClientFreeRecordRow[] = [batch[1]!, batch[0]!];
check(!recorded(stored(swapped, 'client-free'), batch), 'a reordered batch is not a match');
// 7. Empty batch → false (never vacuously "recorded").
check(!recorded(stored(batch, 'client-free'), []), 'an empty batch never matches');
// 8. Identical triples WITHOUT the marker were written by another path → the
//    batch still has to land (never a phantom skip).
check(!recorded(stored(batch), batch), 'rows lacking the origin stamp do not match');

// 9. Real store round-trip: the exact append shape the ws handler uses lands
//    on disk with `origin` and reads back byte-faithful — and the batch then
//    answers the retry check.
const store = new SessionStore('/tmp/req205-record-proj');
const sessionId = 'sess_req205_record';
await store.append(sessionId, { role: 'assistant', content: 'Session marker', timestamp: 'marker' });
for (const row of batch) {
  await store.append(sessionId, {
    role: row.role,
    content: row.content,
    timestamp: row.timestamp,
    origin: 'client-free',
  });
}
const readBack = await store.read(sessionId);
check(readBack.length === 3, 'store round-trip keeps the marker + both recorded rows');
check(
  readBack[1]?.origin === 'client-free' && readBack[2]?.origin === 'client-free',
  'recorded rows read back with origin client-free',
);
check(
  readBack[1]?.content === batch[0]?.content && readBack[2]?.content === batch[1]?.content,
  'recorded row content survives verbatim',
);
check(readBack[0]?.origin === undefined, 'the server-written marker row carries no origin');
const raw = await readFile(SessionStore.pathFor('/tmp/req205-record-proj', sessionId), 'utf-8');
check(raw.includes('"origin":"client-free"'), 'the JSONL line itself carries the origin field');
check(recorded(readBack, batch), 'after the append, the same batch reads as already recorded');

console.log('\n' + passed + ' assertions passed');
