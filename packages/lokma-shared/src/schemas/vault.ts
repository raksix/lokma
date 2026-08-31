import { z } from 'zod';

/**
 * Vault graph — nodes are notes, links are [[wikilink]] or frontmatter links.
 * Rendered with react-force-graph-2d (2D) + 3d star-map toggle.
 * See Docs/28-MEMORY-infinite-vault-graph §4.
 */
export const VaultNodeSchema = z.object({
  id: z.string(),
  path: z.string(),
  title: z.string(),
  tags: z.array(z.string()).default([]),
  folder: z.string().optional(),
});

export type VaultNode = z.infer<typeof VaultNodeSchema>;

export const VaultLinkSchema = z.object({
  source: z.string(),
  target: z.string(),
  type: z.enum(['wikilink', 'embed', 'frontmatter', 'tag']).default('wikilink'),
});

export type VaultLink = z.infer<typeof VaultLinkSchema>;

export const VaultGraphSchema = z.object({
  nodes: z.array(VaultNodeSchema),
  links: z.array(VaultLinkSchema),
});

export type VaultGraph = z.infer<typeof VaultGraphSchema>;

export const VaultTreeNodeSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    name: z.string(),
    path: z.string(),
    type: z.enum(['file', 'folder']),
    children: z.array(VaultTreeNodeSchema).optional(),
  }),
);

export type VaultTreeNode = z.infer<typeof VaultTreeNodeSchema>;
