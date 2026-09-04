import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { WorkspaceFiles } from '../files/files.js';
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
      description: 'Read a workspace-relative file (capped, with sha for guarded writes)',
      inputSchema: ReadFileInput,
      handler: async (input) => {
        const { path } = input as z.infer<typeof ReadFileInput>;
        return files.read(path);
      },
    },
    {
      name: 'list_files',
      description: 'List one workspace directory level, dirs-first, with git states',
      inputSchema: ListFilesInput,
      handler: async (input) => {
        const { path } = input as z.infer<typeof ListFilesInput>;
        return files.list(path);
      },
    },
    {
      name: 'search_files',
      description: 'Fuzzy filename search over the workspace (skips deps/build/VCS)',
      inputSchema: SearchFilesInput,
      handler: async (input) => {
        const { query, max } = input as z.infer<typeof SearchFilesInput>;
        return files.search(query, max);
      },
    },
    {
      name: 'write_file',
      description: 'Atomically write a workspace file (expectedSha guards lost updates)',
      inputSchema: WriteFileInput,
      handler: async (input) => {
        const { path, content, expectedSha } = input as z.infer<typeof WriteFileInput>;
        return files.write(path, content, expectedSha);
      },
    },
    {
      name: 'run_command',
      description: 'Run one binary without a shell, jailed to the workspace cwd',
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
export const BUILTIN_TOOL_NAMES = ['read_file', 'list_files', 'search_files', 'write_file', 'run_command'] as const;
