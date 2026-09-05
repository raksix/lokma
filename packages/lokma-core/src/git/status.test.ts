/**
 * Live probe for git status/log on fresh repos (`./git` — GitPane backend).
 * Run: `HOME=$(mktemp -d) bun src/git/status.test.ts` from `packages/lokma-core`.
 * No test framework — plain asserts so the package stays dependency-free.
 * Real temp HOME on disk (startup env — bun snapshots HOME at boot; the
 * guard below refuses anything outside `/tmp/`). Real `git` binary on real
 * throwaway dirs under `/tmp/` (removed at the end).
 * Regression cover (area A run 4): a fresh `git init` with zero commits IS a
 * repo — `status()` must answer `{ repo: true }` (was 400 `not_a_repo`
 * because `rev-parse --abbrev-ref HEAD` exits 128 on unborn HEAD) and
 * `log()` must answer `{ commits: [] }` (was 400). Genuine non-repos still
 * answer `{ repo: false }` / throw `not_a_repo`.
 * Not imported by library code; `tsconfig.json` excludes `*.test.ts`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitError, RepoGit } from './git.js';

const HOME = process.env.HOME ?? '';
if (!HOME.startsWith('/tmp/')) {
  throw new Error(`REFUSE: HOME=${HOME || '(empty)'} — rerun with HOME=$(mktemp -d) bun ...`);
}

let passed = 0;
function assert(cond: boolean, label: string): void {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS: ${label}`);
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'lokma-git-probe-'));
  try {
    execFileSync('git', ['init', '-q', dir]);
    execFileSync('git', ['-C', dir, 'config', 'user.email', 'probe@lokma.test']);
    execFileSync('git', ['-C', dir, 'config', 'user.name', 'lokma-probe']);
    const fresh = new RepoGit(dir);

    // --- fresh repo, zero commits ---
    const st = await fresh.status();
    assert(st.repo === true, 'fresh repo status answers repo:true');
    if (st.repo === true) {
      assert(typeof st.branch === 'string' && st.branch.length > 0, `fresh repo branch is non-empty (${st.branch})`);
      assert(st.upstream === null && st.ahead === 0 && st.behind === 0, 'fresh repo has no upstream/ahead/behind');
      assert(Array.isArray(st.files), 'fresh repo files is an array');
    }
    const lg = await fresh.log(undefined);
    assert(Array.isArray(lg.commits) && lg.commits.length === 0, 'fresh repo log answers commits:[]');

    // --- genuine non-repo ---
    const plain = mkdtempSync(join(tmpdir(), 'lokma-git-plain-'));
    try {
      const ns = await new RepoGit(plain).status();
      assert(ns.repo === false, 'plain dir status answers repo:false');
      let threw = false;
      try {
        await new RepoGit(plain).log(undefined);
      } catch (e) {
        threw = e instanceof GitError && e.code === 'not_a_repo';
      }
      assert(threw, 'plain dir log throws not_a_repo');
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }

    // --- after one commit: log shows it ---
    execFileSync('git', ['-C', dir, 'commit', '-q', '--allow-empty', '-m', 'probe commit']);
    const lg2 = await fresh.log(undefined);
    assert(lg2.commits.length === 1 && lg2.commits[0]?.message === 'probe commit', 'log shows the commit after commit');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\nALL GIT STATUS TESTS PASSED (${passed} checks)`);
}

await main();
