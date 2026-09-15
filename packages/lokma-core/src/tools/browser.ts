import { z } from 'zod';
import { browserTabs } from '../browser/browser.js';
import { deliverAttachment } from './attachments.js';
import type { ToolDefinition } from './registry.js';

/**
 * Browser-agent tools (REQ-154) — the harness drives a REAL browser engine
 * over the tab the Web UI pane shows for this session.
 *
 * The engine lives in the host (the web server binds a Playwright/Chromium
 * session per tab); this module only defines the model-facing surface and
 * resolves WHICH tab a call targets (the session's newest tab — the same one
 * the pane binds by default). Hosts without an engine (CLI, tests) get an
 * honest `engine_unavailable` failure instead of a pretend success.
 *
 * Honest view model: the pane renders the page in the USER's browser (an
 * iframe), the engine renders it server-side — the two share the tab's URL
 * but not pixels. Tools never claim the user's screen moved; the pane shows
 * an "engine" badge so the split is visible, and the divergence is documented
 * in Docs/24 §browser pane + REQ-154.
 */

/** Direction accepted by `browser_scroll`. */
export type BrowserScrollDirection = 'up' | 'down' | 'top' | 'bottom';

/** Structured failure every engine call may throw — tools catch it into a result. */
export class BrowserEngineError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BrowserEngineError';
    this.code = code;
  }
}

export type BrowserScrollResult = {
  scrollY: number;
  scrollHeight: number;
  viewportHeight: number;
  atTop: boolean;
  atBottom: boolean;
};

export type BrowserReadResult = {
  url: string;
  title: string;
  text: string;
  totalChars: number;
  truncated: boolean;
  scrollY: number;
  scrollHeight: number;
  viewportHeight: number;
};

export type BrowserClickResult = {
  matched: string;
  url: string;
  title: string;
  navigated: boolean;
};

export type BrowserTypeResult = {
  selector: string;
  /** True when the field looked like a password/token input — value never echoed. */
  masked: boolean;
  url: string;
  title: string;
  submitted: boolean;
};

export type BrowserShotResult = {
  /** Workspace-relative path the model can hand to the user. */
  file: string;
  /** Absolute path for tooling. */
  absolutePath: string;
  width: number;
  height: number;
  fullPage: boolean;
};

/**
 * Host-provided browser engine contract (implemented by the web server).
 * Every method targets an EXISTING tab id; URL sync, SSRF guard, timeouts
 * and session lifecycle are the engine's job.
 */
export type BrowserToolEngine = {
  readPage(tabId: string, opts: { maxChars?: number }): Promise<BrowserReadResult>;
  scroll(tabId: string, opts: { direction: BrowserScrollDirection; amount?: number }): Promise<BrowserScrollResult>;
  click(tabId: string, opts: { selector?: string; text?: string }): Promise<BrowserClickResult>;
  type(tabId: string, opts: { selector: string; text: string; submit?: boolean }): Promise<BrowserTypeResult>;
  screenshot(tabId: string, opts: { fullPage?: boolean; cwd?: string }): Promise<BrowserShotResult>;
};

export type BrowserToolOpts = {
  /** Owning loop session — resolves the default tab + scopes the engine. */
  sessionId: string;
  /** Host engine; undefined in hosts that cannot run a browser (CLI, tests). */
  engine?: BrowserToolEngine;
};

const ENGINE_UNAVAILABLE = {
  ok: false as const,
  code: 'engine_unavailable',
  message:
    'No browser engine in this host — the browser tools only run in the Web UI server. Tell the user honestly instead of pretending the page moved.',
};

const NoTabInput = (): { ok: false; code: string; message: string } => ({
  ok: false,
  code: 'no_tab',
  message:
    'This session has no browser tab yet — call open_browser (with the URL) first, then retry.',
});

const TabIdSchema = z.string().min(1).max(64).optional();
const ReadPageInput = z.object({
  tabId: TabIdSchema,
  maxChars: z.number().int().min(500).max(20_000).optional(),
});
const ScrollInput = z.object({
  direction: z.enum(['up', 'down', 'top', 'bottom']),
  amount: z.number().int().min(50).max(20_000).optional(),
  tabId: TabIdSchema,
});
const ClickInput = z.object({
  selector: z.string().min(1).max(500).optional(),
  text: z.string().min(1).max(300).optional(),
  tabId: TabIdSchema,
});
const TypeInput = z.object({
  selector: z.string().min(1).max(500),
  text: z.string().max(4_000),
  submit: z.boolean().optional(),
  tabId: TabIdSchema,
});
const ScreenshotInput = z.object({
  fullPage: z.boolean().optional(),
  tabId: TabIdSchema,
});

type Failure = { ok: false; code: string; message: string };

/** Stringify non-engine errors without leaking internals. */
function engineFailure(e: unknown): Failure {
  if (e instanceof BrowserEngineError) return { ok: false, code: e.code, message: e.message };
  const message = e instanceof Error ? e.message : String(e);
  return { ok: false, code: 'engine_error', message: message.slice(0, 300) };
}

/**
 * Build the five browser tools bound to one session. Handlers close over the
 * session id + engine so the model cannot smuggle a different scope per call.
 * Every handler answers with a JSON object; failures are results (the model
 * reads them and stays honest), never silent throws.
 */
export function buildBrowserTools(cwd: string, opts: BrowserToolOpts): ToolDefinition[] {
  /** Resolve the call target: explicit tabId wins, else the session's newest tab. */
  function targetTab(explicit?: string): { tabId: string } | Failure {
    if (explicit) return { tabId: explicit };
    const tabs = browserTabs.list(opts.sessionId);
    if (!tabs.length) return NoTabInput();
    return { tabId: tabs[0].id };
  }

  /** Run one engine call and shape it as a tool result object. */
  async function withEngine(fn: (engine: BrowserToolEngine) => Promise<Record<string, unknown>>): Promise<unknown> {
    if (!opts.engine) return ENGINE_UNAVAILABLE;
    try {
      return { ok: true, ...(await fn(opts.engine)) };
    } catch (e) {
      return engineFailure(e);
    }
  }

  return [
    {
      name: 'browser_read_page',
      description:
        'Read the readable text of the page this session\'s browser tab shows (server-side browser engine). Use when the user asks what is on the page or what is written further down. Returns url, title, scroll position and a text excerpt.',
      inputSchema: ReadPageInput,
      readOnly: false,
      handler: async (input) => {
        const { tabId, maxChars } = input as z.infer<typeof ReadPageInput>;
        const target = targetTab(tabId);
        if ('ok' in target) return target;
        return withEngine(async (engine) => {
          const page = await engine.readPage(target.tabId, maxChars === undefined ? {} : { maxChars });
          return { tabId: target.tabId, ...page };
        });
      },
    },
    {
      name: 'browser_scroll',
      description:
        'Scroll the page in this session\'s browser tab (up/down/top/bottom, optional pixel amount) and report the new scroll position. Use when the user says things like "aşağı scroll et" / "sayfayı kaydır".',
      inputSchema: ScrollInput,
      readOnly: false,
      handler: async (input) => {
        const { direction, amount, tabId } = input as z.infer<typeof ScrollInput>;
        const target = targetTab(tabId);
        if ('ok' in target) return target;
        return withEngine(async (engine) => {
          const position = await engine.scroll(target.tabId, amount === undefined ? { direction } : { direction, amount });
          return { tabId: target.tabId, direction, ...position };
        });
      },
    },
    {
      name: 'browser_click',
      description:
        'Click an element in the page by CSS selector or by its visible text; reports the url/title after the click (navigation included). Use to press buttons or follow links.',
      inputSchema: ClickInput,
      readOnly: false,
      handler: async (input) => {
        const { selector, text, tabId } = input as z.infer<typeof ClickInput>;
        if (!selector && !text) {
          return { ok: false, code: 'bad_target', message: 'Pass selector or text to click.' };
        }
        const target = targetTab(tabId);
        if ('ok' in target) return target;
        return withEngine(async (engine) => {
          const result = await engine.click(target.tabId, { ...(selector ? { selector } : {}), ...(text ? { text } : {}) });
          return { tabId: target.tabId, ...result };
        });
      },
    },
    {
      name: 'browser_type',
      description:
        'Type text into a form field (CSS selector) and optionally press Enter (submit=true). Password/token field values are never echoed back in the result.',
      inputSchema: TypeInput,
      readOnly: false,
      handler: async (input) => {
        const { selector, text, submit, tabId } = input as z.infer<typeof TypeInput>;
        const target = targetTab(tabId);
        if ('ok' in target) return target;
        return withEngine(async (engine) => {
          const result = await engine.type(target.tabId, submit === undefined ? { selector, text } : { selector, text, submit });
          return { tabId: target.tabId, ...result };
        });
      },
    },
    {
      name: 'browser_screenshot',
      description:
        'Save a PNG screenshot of the page into the workspace (.lokma/browser-shots/) — use it when the user should SEE the current page state. The PNG is delivered to the chat automatically (renders inline for the user).',
      inputSchema: ScreenshotInput,
      readOnly: false,
      handler: async (input) => {
        const { fullPage, tabId } = input as z.infer<typeof ScreenshotInput>;
        const target = targetTab(tabId);
        if ('ok' in target) return target;
        return withEngine(async (engine) => {
          const shot = await engine.screenshot(target.tabId, {
            cwd,
            ...(fullPage === undefined ? {} : { fullPage }),
          });
          // REQ-155: the shot lands in the chat as well — a bare file path made
          // the user hunt for the file; now the image renders in the message.
          let attachedToChat = false;
          let attachError: string | undefined;
          try {
            const url = browserTabs.get(target.tabId).record.url;
            await deliverAttachment(cwd, opts.sessionId, {
              path: shot.file,
              caption: `Ekran görüntüsü — ${url}`,
            });
            attachedToChat = true;
          } catch (e) {
            attachError = (e instanceof Error ? e.message : String(e)).slice(0, 200);
          }
          return {
            tabId: target.tabId,
            ...shot,
            cwd,
            attachedToChat,
            ...(attachError === undefined ? {} : { attachError }),
          };
        });
      },
    },
  ];
}

/** Names only — cheap index for tests + gates. */
export const BROWSER_TOOL_NAMES = [
  'browser_read_page',
  'browser_scroll',
  'browser_click',
  'browser_type',
  'browser_screenshot',
] as const;
