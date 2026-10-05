/**
 * Loops barrel — harness-owned loop records + persistence (REQ-200).
 * The executor (REQ-201), the console (REQ-202) and the project-scoped view
 * (REQ-203) build on this; nothing here fires a run on its own.
 */
export {
  assertLoopIdShape,
  assertTransition,
  betterScore,
  budgetBreach,
  createLoop,
  DEFAULT_COOLDOWN_SECONDS,
  DEFAULT_LOOP_BUDGET,
  DEFAULT_MAX_EMPTY_ITERS,
  deleteLoop,
  getLoop,
  getLoopDetail,
  listLoops,
  listProjectLoops,
  LoopError,
  recordIteration,
  recordRunTiming,
  resolveBudget,
  resolveTrigger,
  setLoopStatus,
  stopLoop,
  targetReached,
  updateLoop,
} from './store.js';
export {
  appendLedger,
  formatLedgerEntry,
  ledgerPath,
  LOOPS_DIR,
  loopDir,
  MAX_LEDGER_BYTES,
  parseLedger,
  readLedger,
  trimLedger,
} from './ledger.js';
export {
  acquireLoopCwd,
  cwdLockConflict,
  heartbeatLoopCwd,
  listLoopLocks,
  loopCwdPath,
  loopIdFromLockOwner,
  loopLockOwner,
  LOOP_LOCK_LEASE_MS,
  normalizeLoopCwd,
  releaseLoopCwd,
} from './lock.js';
export type { LoopCwdLockResult } from './lock.js';
export {
  countIterationFor,
  DEFAULT_LOOP_COOLDOWN_SECONDS,
  DEFAULT_LOOP_MAX_EMPTY_ITERS,
  earliestNextTurn,
  initLoopCalendar,
  shouldStart,
  stopReasonAfterTurn,
} from './runner.js';
export type { DueReason, NextTurn } from './runner.js';
