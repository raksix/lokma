import { z } from 'zod';
import { browserTabs } from '../browser/browser.js';
import { SessionStore } from '../session/store.js';
import { terminalManager } from '../terminal/terminal.js';
import type { ToolDefinition } from './registry.js';

/**
 * UI-control agent tools (REQ-057) — the harness drives its own Web UI.
 * `open_browser` opens a real server browser tab on a URL (REQ-146: reuses
 * the session's live tab instead of stacking a second one), `open_terminal`
 * spawns a real shell (optionally running one command), `open_session`
 * mints a real session (optionally carrying a first prompt), and
 * `send_to_session` (REQ-147) delivers a user message to an EXISTING
 * session so it runs there. Every tool does
 * the server-side effect FIRST, then calls `emit` so the agent loop forwards
 * a `ui_action` frame — connected clients open/focus the matching pane and
 * the user watches the agent work live. Server sessions have no project
 * object distinct from the cwd-scoped transcript store, so "create a project"
 * is `open_session` (fresh transcript) plus workspace file tools.
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

/** Same id shape as POST /api/sessions (no central helper yet — keep in sync). */
function newUiSessionId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export type UiActionPayload = {
  action: 'open_browser' | 'open_terminal' | 'open_session' | 'send_to_session';
  url?: string;
  tabId?: string;
  terminalId?: string;
  targetSessionId?: string;
  prompt?: string;
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
  /** Forwards the payload as a `ui_action` frame (the loop binds `send`). */
  emit: (payload: UiActionPayload) => void;
  /**
   * REQ-147: append + run a user message in ANOTHER session. Bound by the
   * server (it owns the run queue + auth); without it the tool fails
   * honestly instead of pretending the message landed.
   */
  deliver?: (target: { sessionId: string; message: string }) => Promise<SessionDeliveryResult>;
};

/**
 * Build the three UI-control tool definitions bound to one workspace root.
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
  ];
}

/** Names only — cheap index for the `<available_tools>` prompt section. */
export const UI_CONTROL_TOOL_NAMES = ['open_browser', 'open_terminal', 'open_session', 'send_to_session'] as const;
