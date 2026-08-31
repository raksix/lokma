import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const exec = promisify(execFile);

/**
 * Git worktree helpers — Layer 2 isolation (strongest).
 * See Docs/30 §10.2 — git worktree add .lokma/worktrees/<agentId> -b worktree/<agentId>
 */

export async function createWorktree(agentId: string, cwd: string): Promise<{ path: string; branch: string }> {
  const branch = `worktree/${agentId}`;
  const path = join(cwd, '.lokma', 'worktrees', agentId);
  try {
    await exec('git', ['worktree', 'add', path, '-b', branch], { cwd });
  } catch (e: any) {
    // If branch exists, try without -b
    if (String(e.message).includes('already exists')) {
      await exec('git', ['worktree', 'add', path, branch], { cwd });
    } else throw e;
  }
  return { path, branch };
}

export async function removeWorktree(agentId: string, cwd: string): Promise<void> {
  const path = join(cwd, '.lokma', 'worktrees', agentId);
  await exec('git', ['worktree', 'remove', path, '--force'], { cwd }).catch(() => {});
}

export async function listWorktrees(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await exec('git', ['worktree', 'list', '--porcelain'], { cwd });
    return stdout.split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9));
  } catch {
    return [];
  }
}
