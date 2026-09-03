import { z } from 'zod';

/**
 * Plugin record — one row in the Plugins pane (W6-23, Docs/23).
 * Bundled plugins ship with the harness (read-only except the `enabled`
 * flag); URL-installed plugins are user records under `~/.lokma/plugins/`
 * (fully manageable). There is no remote marketplace yet — every record
 * shown is installed locally, never an invented download/star count.
 */

/** Where a plugin record came from — bundled rows are read-only. */
export const PluginSourceSchema = z.enum(['bundled', 'url']);

export type PluginSource = z.infer<typeof PluginSourceSchema>;

/** Gallery grouping — mirrors the concept pane's badge colors. */
export const PluginCategorySchema = z.enum(['core', 'diagram', 'tool', 'skill']);

export type PluginCategory = z.infer<typeof PluginCategorySchema>;

/**
 * One plugin row. `routes` are the REAL `/api/*` prefixes the plugin owns
 * (the server guard matches these when the plugin is suspended);
 * `endpoints` names every live route so the count is never invented.
 */
export const PluginRecordSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(60),
  version: z.string().min(1).max(32),
  author: z.string().min(1).max(60),
  description: z.string().min(1).max(500),
  category: PluginCategorySchema,
  source: PluginSourceSchema,
  /** Always true — the registry only lists installed plugins. */
  installed: z.literal(true),
  /** Hot toggle: disabling suspends the plugin's routes (503), no restart. */
  enabled: z.boolean(),
  /** Route prefixes the plugin owns (e.g. `/api/archify`). */
  routes: z.array(z.string().min(1).max(100)).max(10).default([]),
  /** Every live `METHOD path` the plugin serves (count = length). */
  endpoints: z.array(z.string().min(1).max(120)).max(40).default([]),
  /** Only on `url` records — where it was added from. */
  url: z.string().max(500).optional(),
});

export type PluginRecord = z.infer<typeof PluginRecordSchema>;
