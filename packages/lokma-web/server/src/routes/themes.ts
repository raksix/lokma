import type { FastifyInstance } from 'fastify';
import { getThemeDef, isThemeId, listThemes, toThemeView } from 'lokma-core';

/**
 * Named themes — the server side of the Appearance tab (Phase 3 themes
 * polish). The canonical defs live in `lokma-core/src/themes/` (embedded
 * consts locked 1:1 to `themes/*.json` by `themes.test.ts`):
 * `GET /api/themes` (every def + derived card preview, default first),
 * `GET /api/themes/:id` (one def + preview).
 * Unknown ids answer 404 `theme_not_found`; empty/path-shaped ids answer
 * 400 `bad_id`. All failures answer `{ code, message }`.
 */
export async function themeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/themes', async () => {
    const themes = listThemes().map(toThemeView);
    return { ok: true, themes, count: themes.length, default: themes[0]?.id ?? null };
  });

  app.get('/api/themes/:id', async (req, reply) => {
    const { id } = req.params as { id?: unknown };
    if (typeof id !== 'string' || id.length === 0 || id.includes('/') || id.startsWith('.')) {
      return reply.status(400).send({ code: 'bad_id', message: 'Theme id must be a plain slug.' });
    }
    if (!isThemeId(id)) {
      return reply.status(404).send({ code: 'theme_not_found', message: `Unknown theme: ${id}` });
    }
    return { ok: true, theme: toThemeView(getThemeDef(id)!) };
  });
}
