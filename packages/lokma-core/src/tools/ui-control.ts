import { z } from 'zod';
import { browserTabs } from '../browser/browser.js';
import { can, findOrCreateProject, getUserById, isBootstrapped, listProjects, visibleProjects } from '../auth/store.js';
import { SessionStore, locateSession } from '../session/store.js';
import { terminalManager } from '../terminal/terminal.js';
import type { ToolDefinition } from './registry.js';

/**
 * UI-control agent tools (REQ-057) — the harness drives its own Web UI.
 * `open_browser` opens a real server browser tab on a URL (REQ-146: reuses
 * the session's live tab instead of stacking a second one), `open_terminal`
 * spawns a real shell (optionally running one command), `open_session`
 * mints a real session (optionally carrying a first prompt), and
 * `send_to_session` (REQ-147) delivers a user message to an EXISTING
 * session so it runs there. `open_project` (REQ-180) registers a REAL
 * project record for a directory (idempotent per owner+cwd), opens a
 * session in it, and `list_projects` exposes the permission-filtered
 * project list — "open a project" is a first-class tool now, never a
 * silent fallback to file tools. Every tool does
 * the server-side effect FIRST, then calls `emit` so the agent loop forwards
 * a `ui_action` frame — connected clients open/focus the matching pane and
 * the user watches the agent work live.
 * See Docs/24 §browser pane + Docs/30 §agent tools.
 */

const OpenBrowserInput = z.object({ url: z.string().min(1).max(2048) });
const OpenTerminalInput = z.object({ command: z.string().max(2000).optional() });
const OpenSessionInput = z.object({
  title: z.string().max(120).optional(),
  prompt: z.string().max(8000).optional(),
});
const SendToSessionInput = z.object({
  sessionId: z.string().min(1).max(128),
  message: z.string().min(1).max(8000),
});
/** REQ-180: `sessionId` optionally pre-assigns the new session's id. */
const OpenProjectInput = z.object({
  cwd: z.string().min(1).max(500),
  name: z.string().max(60).optional(),
  visibility: z.enum(['private', 'public']).optional(),
  sessionId: z.string().min(1).max(128).optional(),
});
const ListProjectsInput = z.object({});

/** Same id shape as POST /api/sessions (no central helper yet — keep in sync). */
function newUiSessionId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export type UiActionPayload = {
  action: 'open_browser' | 'open_terminal' | 'open_session' | 'send_to_session' | 'open_project';
  url?: string;
  tabId?: string;
  terminalId?: string;
  targetSessionId?: string;
  prompt?: string;
  /** REQ-180: the project record the `open_project` frame points at. */
  projectId?: string;
  /** REQ-180: resolved project directory (canonical, no trailing slash). */
  cwd?: string;
};

/**
 * REQ-147: outcome of a server-side session delivery. `queued` means the
 * target already had a run in flight, so the message waits behind it —
 * either way it RUNS (never silently dropped).
 */
export type SessionDeliveryResult =
  | { ok: true; queued: boolean }
  | { ok: false; code: string; message: string };

export type UiControlOpts = {
  /** Owning loop session — tags browser tabs + terminals for fan-out scoping. */
  sessionId: string;
  /**
   * REQ-180: acting user for the project tools — resolved against the auth
   * store and re-checked with `can('project:create')` exactly like REST.
   * Undefined on anonymous hosts; those tools then fail honestly instead
   * of guessing a user.
   */
  userId?: string;
  /** Forwards the payload as a `ui_action` frame (the loop binds `send`). */
  emit: (payload: UiActionPayload) => void;
  /**
   * REQ-147: append + run a user message in ANOTHER session. Bound by the
   * server (it owns the run queue + auth); without it the tool fails
   * honestly instead of pretending the message landed.
   */
  deliver?: (target: { sessionId: string; message: string }) => Promise<SessionDeliveryResult>;
};

/** Error carrying a machine code — the executor surfaces `.code` to the model. */
function toolError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

type ProjectUser = NonNullable<Awaited<ReturnType<typeof getUserById>>>;

/**
 * REST parity (POST /api/projects): a signed-in user is required once the
 * instance is bootstrapped; an un-bootstrapped instance says so instead of
 * minting records behind a login wall.
 */
async function requireProjectCreator(tool: string, userId?: string): Promise<ProjectUser> {
  const user = userId ? await getUserById(userId) : null;
  if (user) return user;
  if (!(await isBootstrapped())) {
    throw toolError('not_bootstrapped', `${tool}: register the first admin before creating projects`);
  }
  throw toolError('unauthenticated', `${tool}: sign in required`);
}

/** REQ-180: use the caller's pre-assigned session id when given (validated
 * and free), otherwise mint a fresh one — validated BEFORE any record is
 * written so a taken id leaves nothing behind. */
async function resolveProjectSessionId(preferred?: string): Promise<string> {
  if (!preferred) return newUiSessionId();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(preferred)) {
    throw toolError('bad_session_id', `open_project: invalid session id '${preferred}'`);
  }
  const taken = await locateSession(preferred).catch(() => null);
  if (taken) throw toolError('session_id_taken', `open_project: session id '${preferred}' already exists`);
  return preferred;
}

/**
 * Build the UI-control tool definitions bound to one workspace root.
 * Handlers take no registry ctx — cwd/sessionId/emit close over at build
 * time so the agent loop cannot smuggle a different scope per call.
 */
export function buildUiControlTools(cwd: string, opts: UiControlOpts): ToolDefinition[] {
  const store = new SessionStore(cwd);
  return [
    {
      name: 'open_browser',
      description: 'Open a URL in the Web UI browser pane; reuses the session tab when one is already open (no second tab)',
      inputSchema: OpenBrowserInput,
      handler: async (input) => {
        const { url } = input as z.infer<typeof OpenBrowserInput>;
        // REQ-146 — reuse the session's open tab (same id) instead of stacking
        // a new record per call; `reused` tells the model the page was swapped.
        const { record, reused } = browserTabs.openOrReuse({ url, sessionId: opts.sessionId, cwd });
        opts.emit({ action: 'open_browser', url: record.url, tabId: record.id });
        return { ok: true, tabId: record.id, url: record.url, reused };
      },
    },
    {
      name: 'open_terminal',
      description: 'Open a terminal pane on a fresh shell, optionally running one command in it',
      inputSchema: OpenTerminalInput,
      handler: async (input) => {
        const { command } = input as z.infer<typeof OpenTerminalInput>;
        const { record } = await terminalManager.spawn({ cwd, sessionId: opts.sessionId });
        const trimmed = command?.trim() ? command.trim() : null;
        if (trimmed) terminalManager.write(record.id, `${trimmed}\n`);
        opts.emit({ action: 'open_terminal', terminalId: record.id });
        return { ok: true, terminalId: record.id, commandSent: trimmed ?? null };
      },
    },
    {
      name: 'open_session',
      description: 'Open a new chat session pane, optionally carrying a first prompt that auto-sends on open',
      inputSchema: OpenSessionInput,
      handler: async (input) => {
        const { title, prompt } = input as z.infer<typeof OpenSessionInput>;
        const id = newUiSessionId();
        await store.append(id, {
          role: 'assistant',
          content: `Session ${id} created`,
          timestamp: new Date().toISOString(),
        });
        const cleanTitle = title?.trim() ? title.trim() : null;
        if (cleanTitle) await store.writeMeta(id, { title: cleanTitle });
        const cleanPrompt = prompt?.trim() ? prompt.trim() : null;
        opts.emit({
          action: 'open_session',
          targetSessionId: id,
          prompt: cleanPrompt ?? undefined,
        });
        return { ok: true, sessionId: id, title: cleanTitle, promptSent: cleanPrompt !== null };
      },
    },
    {
      name: 'send_to_session',
      description:
        'Send a user message to an existing session by id — it is appended to that session and runs there (behind any run it already has)',
      inputSchema: SendToSessionInput,
      handler: async (input) => {
        const { sessionId: targetId, message } = input as z.infer<typeof SendToSessionInput>;
        const text = message.trim();
        if (!text) throw new Error('send_to_session: message is empty');
        if (targetId === opts.sessionId) {
          throw new Error('send_to_session: cannot target the running session — answer in this chat instead');
        }
        if (!opts.deliver) {
          throw new Error('send_to_session: no session delivery channel on this surface');
        }
        const delivered = await opts.deliver({ sessionId: targetId, message: text });
        if (!delivered.ok) {
          const error = new Error(delivered.message) as Error & { code?: string };
          error.code = delivered.code;
          throw error;
        }
        opts.emit({ action: 'send_to_session', targetSessionId: targetId, prompt: text });
        return { ok: true, sessionId: targetId, queued: delivered.queued };
      },
    },
    {
      name: 'open_project',
      description:
        'Open a workspace project for a directory — registers the project record (idempotent for the same path) and a session in it, then shows it in the UI. Use for "open/create a project"; use open_session for a plain chat',
      inputSchema: OpenProjectInput,
      handler: async (input) => {
        const { cwd: rawCwd, name, visibility, sessionId: preferredId } = input as z.infer<typeof OpenProjectInput>;
        const user = await requireProjectCreator('open_project', opts.userId);
        if (!(await can(user, 'project:create'))) {
          throw toolError('forbidden', 'open_project: forbidden — missing project:create');
        }
        // Fail fast: a taken/ill-formed pre-assigned session id must not
        // leave a half-open project behind.
        const sessionId = await resolveProjectSessionId(preferredId);
        const { project, created } = await findOrCreateProject(user, {
          name: name?.trim() ? name.trim() : undefined,
          cwd: rawCwd,
          visibility,
        });
        const projectStore = new SessionStore(project.cwd);
        await projectStore.append(sessionId, {
          role: 'assistant',
          content: `Session ${sessionId} created`,
          timestamp: new Date().toISOString(),
        });
        // REQ-094: stamp the creator or the fresh session is superadmin-only.
        await projectStore.writeMeta(sessionId, { ownerId: user.id });
        opts.emit({ action: 'open_project', projectId: project.id, cwd: project.cwd, targetSessionId: sessionId });
        return { ok: true, projectId: project.id, name: project.name, cwd: project.cwd, sessionId, created };
      },
    },
    {
      name: 'list_projects',
      description:
        'List the workspace projects visible to the current user (id, name, cwd, visibility, session count)',
      inputSchema: ListProjectsInput,
      handler: async () => {
        const user = opts.userId ? await getUserById(opts.userId) : null;
        // REST parity (GET /api/projects): un-bootstrapped instances list
        // everything; once bootstrapped the caller must be signed in.
        if (!user && !(await isBootstrapped())) {
          const projects = await listProjects();
          return { projects: projects.map((p) => ({ id: p.id, name: p.name, cwd: p.cwd, visibility: p.visibility, sessionCount: 0 })), count: projects.length };
        }
        if (!user) {
          throw toolError('unauthenticated', 'list_projects: sign in required');
        }
        const projects = await visibleProjects(user);
        const rows = await Promise.all(
          projects.map(async (p) => ({
            id: p.id,
            name: p.name,
            cwd: p.cwd,
            visibility: p.visibility,
            sessionCount: p.cwd ? (await new SessionStore(p.cwd).list()).length : 0,
          })),
        );
        return { projects: rows, count: rows.length };
      },
    },
  ];
}

/** Names only — cheap index for the `<available_tools>` prompt section. */
export const UI_CONTROL_TOOL_NAMES = [
  'open_browser',
  'open_terminal',
  'open_session',
  'send_to_session',
  'open_project',
  'list_projects',
] as const;
