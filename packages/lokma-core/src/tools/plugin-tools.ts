import { z } from 'zod';
import { PluginError, installPluginFromUrl, listPlugins } from '../plugins/registry.js';
import type { ToolDefinition } from './registry.js';

/**
 * Plugin tool family (REQ-181 wave 4) — the agent reads and extends the
 * SAME plugin registry the Plugins pane renders (`plugins/registry.ts`):
 * `plugin_list` returns bundled + URL-installed records with their live
 * enabled state, `plugin_install` mirrors `POST /api/plugins` (strict
 * https validation, credentials and private hosts refused; no network
 * fetch — the record lands suspended until metadata resolves).
 * Failures come back as `{ ok: false, code, message }` (e.g. `bad_url`),
 * never as a silent no-op.
 */

const PluginListInput = z.object({});

const PluginInstallInput = z.object({
  /** HTTPS plugin manifest URL; no credentials, no private hosts. */
  url: z.string().min(1).max(500),
});

export const PLUGIN_TOOL_NAMES = ['plugin_list', 'plugin_install'] as const;

export function buildPluginTools(): ToolDefinition[] {
  return [
    {
      name: 'plugin_list',
      description:
        'List installed plugins (bundled + URL-installed) with id, name, enabled state, category and their routes — the same registry the Plugins pane shows.',
      inputSchema: PluginListInput,
      readOnly: true,
      maxResultSizeChars: 12_000,
      handler: async () => {
        try {
          const { plugins, count } = await listPlugins();
          return { ok: true, plugins, count };
        } catch (e) {
          if (e instanceof PluginError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
    {
      name: 'plugin_install',
      description:
        'Register a plugin from an HTTPS URL (stored suspended until it is enabled); validates the URL and touches no network from here.',
      inputSchema: PluginInstallInput,
      readOnly: false,
      maxResultSizeChars: 6_000,
      handler: async (input) => {
        const { url } = input as z.infer<typeof PluginInstallInput>;
        try {
          const plugin = await installPluginFromUrl(url);
          return { ok: true, plugin };
        } catch (e) {
          if (e instanceof PluginError) return { ok: false, code: e.code, message: e.message };
          throw e;
        }
      },
    },
  ];
}
