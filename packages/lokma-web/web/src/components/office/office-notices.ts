/**
 * Office notice bus — REQ-204 §4.6, the notification half of "waiting for
 * you". The pane OBSERVES the transition and this module is the single door
 * to the app's EXISTING toast bus (`components/shell/toast.tsx`); no second
 * notification system exists (the REQ's own decision).
 *
 * One toast per transition, EVER per tab-load: the ledger is module-level,
 * so a second office host (tiled pane + inspector) folds the same frame and
 * still announces once, and a replayed frame (resent wire frame, snapshot
 * echo) can never double-fire. Keys are transition IDENTITIES
 * (`officeNoticeKey`), never message text.
 */
import { emitToast } from '@/components/shell/toast';

/** Transition keys already announced this tab-load. */
const announced = new Set<string>();

/** Cap — a long-lived tab would otherwise grow the ledger forever. */
const ANNOUNCED_CAP = 300;

/**
 * Announce a notice once. Returns true only when the toast was emitted, so a
 * probe can count announcements without reading toast pixels.
 */
export function announceOfficeNoticeOnce(key: string, message: string): boolean {
  if (!key || !message) return false;
  if (announced.has(key)) return false;
  announced.add(key);
  if (announced.size > ANNOUNCED_CAP) {
    // Set keeps insertion order — drop the oldest key.
    const oldest = announced.values().next().value;
    if (oldest !== undefined) announced.delete(oldest);
  }
  emitToast(message);
  return true;
}
