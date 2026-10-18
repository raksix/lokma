/**
 * Types for the vendored Agent Office renderer (`agent-office-core.mjs`,
 * upstream: isisever/agent-office, MIT — see ./README.md).
 *
 * Only the surface Lokma actually drives is declared, mirroring the upstream
 * `plugin/types/index.d.ts` contract (v3.x). The renderer body itself is
 * untyped JS; this file is the typed boundary between it and our code.
 */

/** One drawing worker — upstream `Worker` (fields Lokma uses). */
export type AgentOfficeWorker = {
  id: string;
  /** Chest tag text (short); Lokma passes `run` / `loop`. */
  type?: string | null;
  /** Project (desk) name — omitted when the worker has no resolved desk. */
  project?: string | null;
  spawnAt: number;
  doneAt?: number | null;
  isOk?: boolean | null;
  /** Current tool name for the chest badge. */
  tool?: string | null;
};

/** One project column on the board — upstream `Worker project` row. */
export type AgentOfficeProject = {
  name: string;
  delivered?: number;
  working?: number;
  isBossBusy?: boolean;
  waiting?: number | null;
};

/** One background shell — upstream `Shell`. */
export type AgentOfficeShell = {
  id: string;
  command: string;
  description?: string | null;
  agentId?: string | null;
  startAt: number;
  endAt?: number | null;
  exitCode?: number | null;
  status?: string | null;
};

/** What `render()` reads. */
export type AgentOfficeData = {
  workers: AgentOfficeWorker[];
  delivered: number;
  isBossBusy: boolean;
  isBossAsking?: boolean;
  /** Theme key (project name match); '' keeps the classic theme. */
  project: string;
  projects?: AgentOfficeProject[];
  shells?: AgentOfficeShell[];
  sessionId?: string;
};

/** One rendered frame: RGB framebuffer + logical size + pixel scale. */
export type AgentOfficeFrame = {
  fb: Uint32Array;
  LW: number;
  LH: number;
  S: number;
};

export type AgentOfficeRenderOptions = {
  theme?: string;
  project?: string;
  focus?: string;
  selected?: string | null;
};

export declare const FRAME_MS: number;
export declare const BOSS_ID: string;
export declare const TODAY_ID: string;

/** Frame interval the office animation is designed around (~9 fps). */
export declare function setGeometry(pxW: number, pxH: number): { LW: number; LH: number; S: number };
export declare function resetOffice(): void;
export declare function render(now: number, data: AgentOfficeData, opts?: AgentOfficeRenderOptions): AgentOfficeFrame;
/** Canvas pixel → id of the topmost bot there (worker id, `@boss`, `@today`), or null. */
export declare function hitTest(pxX: number, pxY: number): string | null;
export declare function setLanguage(lang: 'tr' | 'en'): void;
export declare function setTheme(name: string): void;
export declare function setThemes(userThemes: Record<string, unknown>): void;
export declare function partyCount(): number;
export declare function shellLabel(command: string): string;
