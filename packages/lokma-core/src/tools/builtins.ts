import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { WorkspaceFiles } from '../files/files.js';
import { TOOL_RESULT_NO_SPILL } from './result-budget.js';
import type { ToolDefinition } from './registry.js';

/**
 * Built-in agent tools — thin Zod-typed wrappers over the same core
 * helpers the REST routes use (DRY: `WorkspaceFiles` from `files/files.ts`,
 * never a second jail implementation). Every handler is workspace-jailed to
 * the session cwd: `..` escapes throw `outside_root` like the file routes.
 * See Docs/24 §file browser + Docs/30 §agent tools.
 */

const exec = promisify(execFile);

/** Cap for one shell invocation (wall clock + captured bytes). */
const RUN_COMMAND_TIMEOUT_MS = 15_000;
const RUN_COMMAND_MAX_BUFFER = 512 * 1024;
const RUN_COMMAND_OUTPUT_CAP = 32 * 1024;

const ReadFileInput = z.object({ path: z.string().min(1).max(500) });
const ListFilesInput = z.object({ path: z.string().min(1).max(500).default('.') });
const SearchFilesInput = z.object({
  query: z.string().min(1).max(120),
  max: z.number().int().min(1).max(200).optional(),
});
const WriteFileInput = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(1024 * 1024),
  expectedSha: z.string().regex(/^[0-9a-f]{64}$/).optional(),
});
const RunCommandInput = z.object({
  /** Binary name or workspace-relative path — no shell, no pipes. */
  command: z.string().min(1).max(120),
  args: z.array(z.string().max(500)).max(20).default([]),
  timeoutMs: z.number().int().min(1_000).max(60_000).default(RUN_COMMAND_TIMEOUT_MS),
});
const EditFileInput = z.object({
  path: z.string().min(1).max(500),
  /** Exact text to replace — must match once (or pass replaceAll). */
  oldString: z.string().min(1).max(200_000),
  newString: z.string().max(200_000),
  expectedSha: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  replaceAll: z.boolean().optional(),
});
const GlobInput = z.object({
  /** e.g. `**\/*.ts`, `src/**\/*.tsx`, `Docs/*.md`. */
  pattern: z.string().min(1).max(200),
  max: z.number().int().min(1).max(500).optional(),
});
const GrepInput = z.object({
  /** Regular expression (set literal: true for a plain substring). */
  query: z.string().min(1).max(500),
  path: z.string().min(1).max(500).optional(),
  max: z.number().int().min(1).max(400).optional(),
  ignoreCase: z.boolean().optional(),
  literal: z.boolean().optional(),
});

/**
 * Output budgets in characters (REQ-128, Claude-Code parity). Anything past
 * the budget is spilled to disk by the loop and replaced with a preview
 * envelope, so a 300KB grep can never evict the conversation.
 */
const RUN_BUDGET = 30_000;
const SEARCH_BUDGET = 20_000;

function tail(text: string, cap: number): { text: string; truncated: boolean } {
  if (text.length <= cap) return { text, truncated: false };
  return { text: text.slice(-cap), truncated: true };
}

/**
 * Build the five tool definitions bound to one workspace root.
 * Handlers take no registry ctx — the cwd is closed over at build time so
 * the agent loop cannot smuggle a different root per call.
 */
export function buildBuiltinTools(cwd: string): ToolDefinition[] {
  const files = new WorkspaceFiles(cwd);
  return [
    {
      name: 'read_file',
      description:
        'Read a workspace-relative file (capped at 256KB, with sha for guarded writes) — never spilled, so no read-back loop',
      readOnly: true,
      // REQ-128: pinned to no-spill. `files.read` already caps the payload,
      // and spilling a read would hand the model a file to read back.
      maxResultSizeChars: TOOL_RESULT_NO_SPILL,
      inputSchema: ReadFileInput,
      handler: async (input) => {
        const { path } = input as z.infer<typeof ReadFileInput>;
        return files.read(path);
      },
    },
    {
      name: 'list_files',
      description: 'List one workspace directory level, dirs-first, with git states',
      readOnly: true,
      inputSchema: ListFilesInput,
      handler: async (input) => {
        const { path } = input as z.infer<typeof ListFilesInput>;
        return files.list(path);
      },
    },
    {
      name: 'search_files',
      description: 'Fuzzy FILE-NAME search over the workspace (skips deps/build/VCS) — use grep to search inside files',
      readOnly: true,
      maxResultSizeChars: SEARCH_BUDGET,
      inputSchema: SearchFilesInput,
      handler: async (input) => {
        const { query, max } = input as z.infer<typeof SearchFilesInput>;
        return files.search(query, max);
      },
    },
    {
      name: 'glob',
      description: 'Find files by glob pattern (** crosses dirs, * does not) — e.g. **/*.ts, src/**/*.tsx',
      readOnly: true,
      maxResultSizeChars: SEARCH_BUDGET,
      inputSchema: GlobInput,
      handler: async (input) => {
        const { pattern, max } = input as z.infer<typeof GlobInput>;
        return files.glob(pattern, max);
      },
    },
    {
      name: 'grep',
      description:
        'Search file CONTENTS with a regular expression; returns grouped line matches with line numbers. Use it before reading whole files.',
      readOnly: true,
      maxResultSizeChars: SEARCH_BUDGET,
      inputSchema: GrepInput,
      handler: async (input) => {
        const { query, path, max, ignoreCase, literal } = input as z.infer<typeof GrepInput>;
        return files.grep(query, { path, max, ignoreCase, literal });
      },
    },
    {
      name: 'edit_file',
      description:
        'Replace an exact string inside a workspace file (oldString must match exactly once). Read the file first — prefer this over rewriting the whole file.',
      maxResultSizeChars: 10_000,
      inputSchema: EditFileInput,
      handler: async (input) => {
        const { path, oldString, newString, expectedSha, replaceAll } = input as z.infer<typeof EditFileInput>;
        return files.edit(path, oldString, newString, { expectedSha, replaceAll });
      },
    },
    {
      name: 'write_file',
      description:
        'Atomically write (create or overwrite) a workspace file; expectedSha guards lost updates. Prefer edit_file for small changes to existing files.',
      maxResultSizeChars: 10_000,
      inputSchema: WriteFileInput,
      handler: async (input) => {
        const { path, content, expectedSha } = input as z.infer<typeof WriteFileInput>;
        return files.write(path, content, expectedSha);
      },
    },
    {
      name: 'run_command',
      description: 'Run one binary without a shell, jailed to the workspace cwd (exit code + output; non-zero exit is a result, not an error)',
      maxResultSizeChars: RUN_BUDGET,
      inputSchema: RunCommandInput,
      handler: async (input) => {
        const { command, args, timeoutMs } = input as z.infer<typeof RunCommandInput>;
        // No shell metacharacters — execFile runs the binary directly, so
        // pipes/redirects/substitution are literal argv, never executed.
        if (/[|&;<>()$`\\]/.test(command)) {
          throw new Error(`Refusing shell metacharacters in command: ${command}`);
        }
        let stdout = '';
        let stderr = '';
        try {
          const out = await exec(command, args, {
            cwd: files.root,
            timeout: timeoutMs,
            maxBuffer: RUN_COMMAND_MAX_BUFFER,
          });
          stdout = out.stdout;
          stderr = out.stderr;
          const capped = tail(stdout, RUN_COMMAND_OUTPUT_CAP);
          return { exitCode: 0, stdout: capped.text, stderr, truncated: capped.truncated };
        } catch (e) {
          // Non-zero exit still carries output — the model decides what it
          // means. Only spawn failures (ENOENT/timeout) have no exit code.
          const err = e as { code?: unknown; stdout?: string; stderr?: string; killed?: boolean };
          const exitCode = typeof err.code === 'number' ? err.code : null;
          if (exitCode === null) throw e;
          const capped = tail(err.stdout ?? '', RUN_COMMAND_OUTPUT_CAP);
          return { exitCode, stdout: capped.text, stderr: err.stderr ?? '', truncated: capped.truncated };
        }
      },
    },
  ];
}

/** Names only — cheap index for the `<available_tools>` prompt section. */
export const BUILTIN_TOOL_NAMES = [
  'read_file',
  'list_files',
  'search_files',
  'glob',
  'grep',
  'edit_file',
  'write_file',
  'run_command',
] as const;
