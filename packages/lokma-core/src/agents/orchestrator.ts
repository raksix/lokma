/**
 * Orchestrator — parallel() / pipeline() / Team stubs.
 * Full orchestration in Phase 2 (fan-out 3–20, then coalesce).
 * See Docs/30 §8
 */

export async function parallel<T>(tasks: (() => Promise<T>)[]): Promise<T[]> {
  return Promise.all(tasks.map((t) => t()));
}

export async function pipeline<T>(phases: (() => Promise<T>)[]): Promise<T[]> {
  const out: T[] = [];
  for (const p of phases) out.push(await p());
  return out;
}
