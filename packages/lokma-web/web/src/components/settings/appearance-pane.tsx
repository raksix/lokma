import * as React from 'react';
import { Check } from 'lucide-react';
import { api } from '@/lib/api';
import { applyTheme, emitToast } from '@/components/shell';
import { THEME_CARDS, serverThemeToMode, type NormalizedConfig } from './settings';

/**
 * AppearancePane — the four server themes (ported from the concept
 * SettingsPane Appearance tab). Picking a card applies the light/dark
 * mode instantly AND persists the named theme via PATCH /api/config,
 * so the CLI (`lokma theme set <id>`) and the web stay on the same
 * value. The concept's toast-only picker is NOT ported — selection
 * here is real end to end.
 */
export function AppearancePane({ config, onReload }: { config: NormalizedConfig; onReload: () => Promise<void> }) {
  const [saving, setSaving] = React.useState<string | null>(null);
  const active = config.theme;

  async function handlePick(id: (typeof THEME_CARDS)[number]['id']): Promise<void> {
    // Instant local feedback first (same key the header toggle uses).
    applyTheme(serverThemeToMode(id));
    setSaving(id);
    try {
      await api.patchConfig({ theme: id });
      emitToast(`Theme: ${id}`);
      await onReload();
    } catch (e) {
      // Local mode stays applied; the server value re-syncs on next load.
      emitToast(e instanceof Error ? e.message : 'Theme persist failed');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-2 p-2">
      <div className="text-xs font-medium">Themes — themes/*.json → CSS vars + Chalk tokens</div>
      <div className="grid grid-cols-2 gap-2">
        {THEME_CARDS.map((t) => (
          <button
            key={t.id}
            onClick={() => handlePick(t.id)}
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
      <div className="rounded-md border border-dashed border-line bg-muted/50 p-2 text-[11px] text-zinc-500">
        Picking a theme switches the web light/dark mode now and persists the named theme server-side (same value the CLI
        reads).
      </div>
    </div>
  );
}
