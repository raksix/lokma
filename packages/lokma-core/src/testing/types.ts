/**
 * Testing Lab types — TestSprite-inspired self-hosted runs (Docs/33, W5-19).
 * Runs live under `~/.lokma/test-runs/<id>/`: `plan.json` + `report.json` +
 * `junit.xml`. No Playwright/video here — each target path becomes one real
 * HTTP check executed against the live server handlers, plus a Shannon
 * secret scan over the run's own plan + response bodies.
 */

/** Failure bucket shown in the Classify stage (concept parity, real values). */
export type TestClassification = 'contract' | 'env' | 'fragility';

/** One executed check inside a run. */
export type TestResult = {
  name: string;
  kind: 'http' | 'shannon';
  status: 'pass' | 'fail';
  /** Wall-clock milliseconds for this check. */
  ms: number;
  /** Human-readable one-liner (never contains secret material). */
  detail: string;
  /** Set only on failures — the Classify stage groups by this. */
  classification?: TestClassification;
};

/** Shannon finding — pattern name + location only, never the secret text. */
export type ShannonFinding = {
  pattern: string;
  location: string;
};

/** Full persisted report (`report.json`). */
export type TestReport = {
  id: string;
  plan: string;
  createdAt: string;
  durationMs: number;
  tests: TestResult[];
  pass: number;
  fail: number;
  /** Rerun-history diffing is a follow-up — always 0, never invented. */
  flaky: number;
  shannon: string;
  shannonFindings: ShannonFinding[];
};

/** Stored plan (`plan.json`) — the Plan stage input, verbatim. */
export type TestPlanDoc = {
  id: string;
  plan: string;
  targets: string[];
  includeShannon: boolean;
  createdAt: string;
};

/** List row (`GET /api/tests/list`) — mirrors the concept run cards. */
export type TestSummary = {
  id: string;
  plan: string;
  tests: number;
  pass: number;
  fail: number;
  flaky: number;
  /** Human duration cell (`18s`) — the pane never invents timing. */
  dur: string;
  shannon: string;
  createdAt: string;
};

/** Typed error — routes map it straight to `{ code, message }`. */
export class TestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'TestError';
    this.code = code;
    this.status = status;
  }
}
