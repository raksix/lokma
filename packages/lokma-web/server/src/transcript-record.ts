/**
 * REQ-205 slice 3 — persistence policy for the CLIENT-side free path.
 *
 * A browser-side keyless run (OmniRoute free pool) produces real user +
 * assistant rows, but the server never saw the exchange: the client sends
 * them back over the session socket as a `transcript_record` frame and this
 * policy decides what lands. Kept as pure functions so the rules are unit
 * provable without a socket (the route handler owns the I/O).
 *
 * Rules:
 *  - a batch identical to the transcript's trailing rows is a RETRY (the
 *    ack was lost on a socket drop) — it must not append a second copy;
 *  - comparison is exact on role + content + timestamp; timestamps are
 *    client-owned ISO strings, so two genuinely separate runs never collide.
 *
 * Covered by `transcript-record.test.ts`.
 */
import type { SessionMessage } from '@lokma/core';
import type { ClientFreeRecordRow } from '@lokma/shared';

/**
 * True when the transcript already ends with exactly this batch, recorded
 * with the same origin. The caller treats it as success (rows persisted,
 * count 0) — re-appending would render the same exchange twice after a
 * reconnect. `origin` is part of the match: identical-looking rows that
 * LACK the marker were written by another path, so the batch still has to
 * land (never a phantom skip).
 */
export function batchAlreadyRecorded(
  messages: SessionMessage[],
  rows: ClientFreeRecordRow[],
  origin: 'client-free',
): boolean {
  if (rows.length === 0) return false;
  if (messages.length < rows.length) return false;
  const tail = messages.slice(messages.length - rows.length);
  return tail.every((message, index) => {
    const row = rows[index];
    if (!row) return false;
    return (
      message.role === row.role &&
      message.content === row.content &&
      message.timestamp === row.timestamp &&
      message.origin === origin
    );
  });
}
