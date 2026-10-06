/**
 * The project-scope WRITE contract for loops (REQ-203 kapsam 3).
 *
 * `loop-view.ts` in the web console already READS both signals — an explicit
 * `projectId` and a `cwd` that matches a project record — and reports a breach
 * as a visible `conflict` badge. This module is the other half: it decides what
 * a writer is ALLOWED to store, so the two signals can never be born
 * contradicting each other in the first place.
 *
 * The contract, in one line: **a loop that names a project stores THAT project's
 * cwd.** The loop's own `cwd` is never a second, parallel spelling of the same
 * fact — a project is located by its cwd, and a loop's workspace IS a project
 * directory. Two spellings of one location is what produces the conflict badge
 * in the first place, so the fix is upstream of the badge.
 *
 * Deliberately pure: every rule below is a function of its arguments, so the
 * contract is provable without a store, a disk or a DOM. `store.ts` owns the I/O.
 *
 * Measured decisions (each one closes a case the reader would otherwise have to
 * absorb as a `conflict` badge):
 *
 *  - **An unknown `projectId` is refused, not stored** (`project_unknown`). A
 *    loop pointing at a project nobody has is exactly the `missing` state the
 *    console badges — creating it on purpose would manufacture the confusion the
 *    reader exists to report.
 *  - **A cwd that belongs to a DIFFERENT project than the named one is refused**
 *    (`project_cwd_mismatch`). The fix is a decision the user makes, never a
 *    silent preference for one signal.
 *  - **A loop with no project keeps its own cwd** — the no-project bucket is a
 *    real place (kapsam 1), not a validation error.
 *  - **A project record with an empty cwd is not a location** and claims nothing;
 *    it cannot be assigned to, because there is nothing to match against. It is
 *    reported rather than refused so a legacy record cannot wedge creation.
 *  - **Ambiguity is possible and is answered, not guessed.** `findOrCreateProject`
 *    is idempotent per OWNER, so two users can hold two project records for one
 *    directory. When more than one record matches, the caller is told so it can
 *    refuse and name the alternatives, instead of picking whichever row came
 *    first — a picked winner would make the project's name in the console depend
 *    on store order.
 */
import type { Project } from '@lokma/shared';

/** Why a write is refused — one code per honest refusal, never a generic 400. */
export type LoopScopeRefusal = 'project_unknown' | 'project_cwd_mismatch';

/**
 * A project record as the writer needs it. Only the two fields the contract
 * reads, so this stays provable with plain object fixtures.
 */
export type ScopeProject = Pick<Project, 'id' | 'name' | 'cwd'>;

export type LoopScopeDecision =
  /** Store as given: no project was named, or the cwd agrees with it. */
  | { ok: true; projectId: string | null; cwd: string }
  /** Refuse, and say which project the cwd actually belongs to. */
  | { ok: false; code: LoopScopeRefusal; message: string; projectId: string };

/**
 * Does a project record carry a usable location? `""` is the store's default for
 * "server default", and `sameCwd('', '')` is true by design, so such a record must
 * never claim a cwd.
 */
function hasCwd(project: ScopeProject): boolean {
  return (project.cwd ?? '').trim().length > 0;
}

/**
 * Every project record whose `cwd` is this one.
 *
 * Returning the LIST (rather than the first match) is what makes ambiguity
 * reportable: a single-match helper would silently bind a loop to whichever row
 * the store happened to return first.
 */
export function projectsAtCwd(
  cwd: string,
  projects: readonly ScopeProject[],
): ScopeProject[] {
  const target = cwd.trim();
  if (!target) return [];
  const norm = (v: string): string => {
    const t = v.trim();
    if (!t) return '';
    return t.length > 1 ? t.replace(/\/+$/, '') : t;
  };
  const want = norm(target);
  return projects.filter((p) => hasCwd(p) && norm(p.cwd) === want);
}

/**
 * Decide what a create/update write should store (kapsam 3).
 *
 * `loopCwd` is the caller's requested workspace, `projectId` the project it
 * claims. The returned `cwd` is canonical on purpose: the project record's own
 * spelling is the one the session store hashes, and two spellings of one
 * directory split one project into two session dirs (REQ-087).
 */
export function decideLoopScope(input: {
  loopCwd: string;
  projectId: string | null;
  projects: readonly ScopeProject[];
}): LoopScopeDecision {
  const requested = input.loopCwd.trim();
  const claimed = input.projectId;

  // No project named: the loop lives in the bucket the user chose, at its own
  // cwd. Nothing to reconcile.
  if (claimed === null || claimed === undefined) {
    return { ok: true, projectId: null, cwd: requested };
  }

  const project = input.projects.find((p) => p.id === claimed);
  if (!project) {
    return {
      ok: false,
      code: 'project_unknown',
      message: `project ${claimed} does not exist — create the project first, or create the loop without one`,
      projectId: claimed,
    };
  }

  // A record with no location cannot arbitrate a cwd, so it cannot contradict
  // one either. Store the record's own empty cwd? No — that would move the
  // loop's workspace out from under it. Keep the requested cwd and let the
  // reader badge the loop `no project`-adjacent instead of corrupting the loop.
  if (!hasCwd(project)) {
    return { ok: true, projectId: claimed, cwd: requested };
  }

  const projectCwd = project.cwd.trim();
  const norm = (v: string): string => (v.length > 1 ? v.replace(/\/+$/, '') : v);
  if (norm(requested) === norm(projectCwd)) return { ok: true, projectId: claimed, cwd: projectCwd };

  // The cwd names a DIFFERENT live project. Refusing is the honest answer: the
  // user's two signals disagree, and silently preferring either one hides that.
  const others = projectsAtCwd(requested, input.projects).filter((p) => p.id !== claimed);
  if (others.length > 0) {
    const names = others.map((p) => `"${p.name}" (${p.id})`).join(', ');
    return {
      ok: false,
      code: 'project_cwd_mismatch',
      message: `${requested} belongs to ${names}, not "${project.name}" (${claimed}) — pick one project, or change the directory`,
      projectId: claimed,
    };
  }

  // The cwd matches no project at all. Refusing keeps kapsam 3's promise that a
  // loop's directory is a project directory: this loop would otherwise be filed
  // under a project whose files live somewhere the loop never runs.
  return {
    ok: false,
    code: 'project_cwd_mismatch',
    message: `loop cwd ${requested} is not the project directory (${projectCwd}) — run it in the project's directory, or create a project for this directory`,
    projectId: claimed,
  };
}
