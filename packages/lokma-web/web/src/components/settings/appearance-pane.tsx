import * as React from 'react';
import { Check } from 'lucide-react';
import { api } from '@/lib/api';
import { applyThemeVars, emitToast } from '@/components/shell';
import { THEME_CARDS, themeCardFromView, type NormalizedConfig, type ThemeCard } from './settings';

/**
 * AppearancePane — the named server themes as live cards (Phase 3 themes
 * polish). Cards come from `GET /api/themes` (canonical core registry), so
 * names/descriptions/swatches can never drift from the CLI (`lokma theme`).
 * Picking a card applies the theme's FULL CSS var set instantly AND persists
 * the named theme via PATCH /api/config. When the endpoint is unreachable
 * the hardcoded cards take over (mode-only apply, same as before).
 */
export function AppearancePane({ config, onReload }: { config: NormalizedConfig; onReload: () => Promise<void> }) {
  const [saving, setSaving] = React.useState<string | null>(null);
  const [cards, setCards] = React.useState<ThemeCard[] | null>(null);
  const active = config.theme;

  React.useEffect(() => {
    let live = true;
    api
      .listThemes()
      .then((res) => {
        if (live) setCards(res.themes.map(themeCardFromView));
      })
      .catch(() => {
        // Offline fallback: hardcoded cards, mode-only apply (no vars).
        if (live) {
          setCards(
            THEME_CARDS.map((t) => ({ id: t.id, name: t.name, desc: t.desc, bg: t.bg, accent: t.accent, mode: t.mode, cssVars: {} })),
          );
        }
      });
    return () => {
      live = false;
    };
  }, []);

  async function handlePick(card: ThemeCard): Promise<void> {
    // Instant local feedback first (same key the header toggle uses).
    applyThemeVars(card.cssVars, card.mode);
    setSaving(card.id);
    try {
      await api.patchConfig({ theme: card.id });
      emitToast(`Theme: ${card.id}`);
      await onReload();
    } catch (e) {
      // Local vars stay applied; the server value re-syncs on next load.
      emitToast(e instanceof Error ? e.message : 'Theme persist failed');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-2 p-2">
      <div className="text-xs font-medium">Themes — themes/*.json → CSS vars + Chalk tokens</div>
      {cards === null ? (
        <div className="rounded-md border border-dashed border-line p-2 text-[11px] text-zinc-500">Loading themes…</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {cards.map((t) => (
            <button
              key={t.id}
              onClick={() => handlePick(t)}
              disabled={saving !== null}
              className="rounded-lg border border-line bg-white p-2.5 text-left transition hover:border-terracotta/30 hover:shadow-sm disabled:opacity-60 dark:bg-[#1E1E21]"
            >
              <div className="flex items-center gap-2">
                <span className="h-8 w-8 shrink-0 rounded-md border border-line" style={{ background: t.bg }} />
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: t.accent }} />
                <span className="text-xs font-semibold">{t.name}</span>
                {active === t.id && <Check className="ml-auto h-3 w-3 text-emerald-600" aria-label={`Active theme: ${t.id}`} />}
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">{t.desc}</div>
              <div className="mt-1 font-mono text-[11px] text-zinc-400">
                {saving === t.id ? 'saving…' : `lokma theme set ${t.id}`}
              </div>
            </button>
          ))}
        </div>
      )}
      <div className="rounded-md border border-dashed border-line bg-muted/50 p-2 text-[11px] text-zinc-500">
        Picking a theme applies its full palette now and persists the named theme server-side (same value the CLI
        reads).
      </div>
    </div>
  );
}
