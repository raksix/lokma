import { getThemeDef } from '../themes/themes.js';

/**
 * TUI painter — Claude-Code layout meets OMP design tokens.
 *
 * Colors come from the active Lokma theme (`lokma config set theme omp`,
 * same `chalk` tokens the docs define in `themes/*.json` and the canonical
 * core registry mirrors): primary/muted/border/foreground render as 24-bit
 * ANSI; semantic ok/err/warn/info stay classic ANSI so they read on both
 * light and dark families. Chrome uses OMP `boxRound` (╭╮╰╯│─) with an
 * ASCII fallback for limited terminals. Respects NO_COLOR + pipes.
 * See Docs/11-ARASTIRMA-omp-temalar-ve-tasarim.md §4 + raw/11 §4.
 */

function useColor(): boolean {
  return !!process.stdout.isTTY && !process.env.NO_COLOR;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1] as string;
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export type Paint = {
  /** Theme primary (OMP indigo #6366f1, Claude terracotta, …). */
  primary: (s: string) => string;
  /** Normal text (theme foreground). */
  text: (s: string) => string;
  /** Secondary text (theme muted). */
  muted: (s: string) => string;
  bold: (s: string) => string;
  dim: (s: string) => string;
  ok: (s: string) => string;
  err: (s: string) => string;
  warn: (s: string) => string;
  info: (s: string) => string;
  /** Rounded box (OMP boxRound) with optional title; ASCII fallback. */
  box: (lines: string[], title?: string, accent?: (s: string) => string) => string;
  /** Thin separator line in the theme border color. */
  hr: (width?: number) => string;
  /** Status-line segments joined with theme-border separators. */
  status: (segments: string[]) => string;
  symbols: { dot: string; ok: string; fail: string; warn: string; prompt: string; diamond: string };
};

export function createPaint(themeId: string): Paint {
  const def = getThemeDef(themeId) ?? getThemeDef('omp');
  const chalk = def?.chalk ?? {};
  const color = useColor();
  const ascii = !!process.env.LOKMA_ASCII;

  const fg = (hex: string | undefined, fallback: string) => {
    const rgb = hex ? hexToRgb(hex) : null;
    if (!color || !rgb) return (s: string): string => s;
    const open = `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
    void fallback;
    return (s: string): string => `${open}${s}\x1b[0m`;
  };

  const primary = fg(chalk['primary'], 'primary');
  const text = fg(chalk['foreground'], 'text');
  const muted = fg(chalk['muted'], 'muted');
  const border = fg(chalk['border'], 'border');

  const wrap = (open: string) => (s: string): string => (color ? `${open}${s}\x1b[0m` : s);

  const symbols = ascii
    ? { dot: 'o', ok: '+', fail: 'x', warn: '!', prompt: '>', diamond: '*' }
    : { dot: '●', ok: '✓', fail: '✗', warn: '⚠', prompt: '›', diamond: '◆' };

  const width = Math.min(100, Math.max(40, (process.stdout.columns ?? 80) - 2));

  return {
    primary,
    text,
    muted,
    bold: wrap('\x1b[1m'),
    dim: wrap('\x1b[2m'),
    ok: wrap('\x1b[32m'),
    err: wrap('\x1b[31m'),
    warn: wrap('\x1b[33m'),
    info: wrap('\x1b[36m'),
    symbols,
    hr: (w = width) => border(ascii ? '-'.repeat(w) : '─'.repeat(w)),
    status: (segments: string[]) => {
      const sep = border(ascii ? ' | ' : ' │ ');
      return segments.filter((s) => s.length > 0).join(sep);
    },
    box: (lines: string[], title?: string, accent?: (s: string) => string) => {
      const paint = accent ?? border;
      if (ascii) {
        const bar = '+' + '-'.repeat(width - 2) + '+';
        const out = [paint(bar)];
        if (title) out.push(paint('| ') + title);
        for (const line of lines) out.push(paint('| ') + line);
        out.push(paint(bar));
        return out.join('\n');
      }
      const top = paint('╭' + (title ? `─ ${title} ` : '') + '─'.repeat(Math.max(0, width - (title ? title.length + 4 : 2))) + '╮');
      const bottom = paint('╰' + '─'.repeat(width - 2) + '╯');
      const out = [top];
      for (const line of lines) out.push(paint('│ ') + line);
      out.push(bottom);
      return out.join('\n');
    },
  };
}
