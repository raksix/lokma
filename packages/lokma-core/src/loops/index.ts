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
  DEFAULT_LOOP_BUDGET,
  deleteLoop,
  getLoop,
  getLoopDetail,
  listLoops,
  listProjectLoops,
  LoopError,
  recordIteration,
  resolveBudget,
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
