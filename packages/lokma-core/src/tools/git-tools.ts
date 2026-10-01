import { z } from 'zod';
import { GitError, RepoGit } from '../git/git.js';
import type { ToolDefinition } from './registry.js';

/**
 * Git tool family (REQ-181 wave 3) — the agent drives the same `RepoGit`
 * core module the Git pane's REST routes use: working-tree status, a
 * bounded unified diff, and stage-all + commit. Failures come back as
 * `{ ok: false, code, message }` (e.g. `nothing_to_commit`), never as a
 * silent no-op.
 */

const GitStatusInput = z.object({});

const GitDiffInput = z.object({
  /** Repo-relative file to narrow the diff to; omitted = the whole tree. */
  path: z.string().min(1).max(300).optional(),
  /** Diff the staged index (against HEAD) instead of the working tree. */
  staged: z.boolean().optional(),
});

const GitCommitInput = z.object({
  message: z.string().min(1).max(500),
});

export const GIT_TOOL_NAMES = ['git_status', 'git_diff', 'git_commit'] as const;

export function buildGitTools(cwd: string): ToolDefinition[] {
  const repo = (): RepoGit => new RepoGit(cwd);
  return [
    {
      name: 'git_status',
      description:
        'Show the session workspace git status: branch, upstream ahead/behind, and staged/unstaged files with counts.',
      inputSchema: GitStatusInput,
      readOnly: true,
      maxResultSizeChars: 8_000,
      handler: async () => {
        try {
          const status = await repo().status();
          if (!status.repo) {
            return { ok: false, code: 'not_a_repo', message: `${status.cwd} is not a git repository` };
          }
          return { ok: true, ...status };
        } catch (e) {
          if (e instanceof GitError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
    {
      name: 'git_diff',
      description:
        'Show the unified diff of the working tree (or of the staged index with `staged: true`), optionally narrowed to one repo-relative file.',
      inputSchema: GitDiffInput,
      readOnly: true,
      maxResultSizeChars: 90_000,
      handler: async (input) => {
        const { path, staged } = input as z.infer<typeof GitDiffInput>;
        try {
          const res = await repo().diff({ path, staged });
          return { ok: true, ...res };
        } catch (e) {
          if (e instanceof GitError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
    {
      name: 'git_commit',
      description:
        'Stage every change (`git add -A`) and commit the working tree with one message; a clean tree answers `nothing_to_commit`.',
      inputSchema: GitCommitInput,
      readOnly: false,
      maxResultSizeChars: 4_000,
      handler: async (input) => {
        const { message } = input as z.infer<typeof GitCommitInput>;
        try {
          const res = await repo().commit(message);
          return { ok: true, ...res };
        } catch (e) {
          if (e instanceof GitError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
  ];
}
