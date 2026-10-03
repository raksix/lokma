import * as React from 'react';
import { X } from 'lucide-react';
import { isSlashPrefix, parseMentions, removeMention } from './composer-utils';

/**
 * ComposerInput — the ONE text input the app ships for prompts (REQ-188).
 *
 * The chat composer and the Design Studio brief used to own two private text
 * areas: the brief was a raw `<textarea rows={3}>` with a hand-written
 * Ctrl/Cmd+Enter handler, while the mention/slash helpers in
 * `composer-utils.ts` went unused there. Two implementations meant two token
 * sets, two Enter contracts and one behaviour that only existed on one
 * surface. This module owns the input itself — auto-growing textarea, the
 * `@path` mention chips, the `/command` palette and the Enter contract — and
 * both surfaces compose it, so a behaviour change lands once.
 *
 * The surrounding surfaces keep their own toolbars and send actions (the chat
 * composer's steer/queue + model + thinking pickers; the Design composer
 * Project/Type/System/Model + Generate), which ride `children`.
 */

/** Outer card tokens — both surfaces paint the same box (one token set). */
export const COMPOSER_SHELL_CLASS =
  'relative rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(38,38,36,0.06),0_4px_12px_rgba(38,38,36,0.04)] dark:bg-[#1E1E21]';

/** One `/command` row the palette can offer (mirrors `SlashCommandInfo`). */
export type ComposerSlash = { id: string; name: string; hint: string; usage?: string };

export type ComposerInputProps = {
  /** Draft text; the surface owns it (so it can validate before sending). */
  value: string;
  onChange: (value: string) => void;
  /** Enter (no shift) and Ctrl/Cmd+Enter both land here. */
  onSubmit: () => void;
  placeholder?: string;
  ariaLabel: string;
  /** Optional id so a surface `<label htmlFor>` can target the textarea. */
  id?: string;
  disabled?: boolean;
  /** Palette rows — chat passes the server registry, Design its own commands. */
  commands?: ComposerSlash[];
  onSlash?: (id: string, args: string) => void;
  /** `aria-describedby` target for the shortcut hint (screen readers). */
  hintId?: string;
  /** Extra probe/DOM hooks merged onto the textarea. */
  attrs?: Record<string, string>;
  /** Auto-grow bounds in px — Design asks for a taller box than chat. */
  minHeight?: number;
  maxHeight?: number;
  /**
   * Chat owns its mention-chip row in the toolbar above (REQ-188), so it turns
   * the chips off here; Design has no toolbar row and keeps them.
   */
  showMentionChips?: boolean;
  /** Increment to force-open the `/` palette from outside (the `/help` command). */
  openSignal?: number;
  /** Slot under the text area (attachment chips, tool row, send button). */
  children?: React.ReactNode;
};

/** Imperative handle — a surface can park the caret from outside. */
export type ComposerInputHandle = { focus: () => void };

/**
 * Shared input body. The mention/slash parsing lives in `composer-utils.ts`
 * and the double-submit guard in `submit-guard.ts` — both are reused, never
 * re-implemented here.
 */
export const ComposerInput = React.forwardRef<ComposerInputHandle, ComposerInputProps>(function ComposerInput(
  {
    value,
    onChange,
    onSubmit,
    placeholder,
    ariaLabel,
    id,
    disabled,
    commands,
    onSlash,
    hintId,
    attrs,
    minHeight = 28,
    maxHeight = 120,
    showMentionChips = true,
    openSignal = 0,
    children,
  },
  ref,
) {
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  React.useImperativeHandle(ref, () => ({ focus: () => taRef.current?.focus() }), []);

  const contextPaths = React.useMemo(
    () => Array.from(new Set(parseMentions(value).map((m) => m.path))),
    [value],
  );

  const slashItems = React.useMemo(() => {
    const prefix = value.trim().slice(1).toLowerCase();
    const rows = commands ?? [];
    return rows.filter((c) => !prefix || c.id.startsWith(prefix) || c.hint.toLowerCase().includes(prefix));
  }, [commands, value]);

  // `/help` and friends open the palette from the surface layer.
  React.useEffect(() => {
    if (openSignal <= 0) return;
    setPaletteOpen(true);
    taRef.current?.focus();
  }, [openSignal]);

  /** Grow with the draft, never past the caller's ceiling (chat: ~3 rows). */
  const resize = (el: HTMLTextAreaElement): void => {
    el.style.height = 'auto';
    el.style.height = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight) + 'px';
  };

  // A sample chip or a restored snapshot fills the box from outside — keep the
  // height in step so the box does not keep its old short size.
  React.useEffect(() => {
    if (taRef.current) resize(taRef.current);
  }, [value, minHeight, maxHeight]);

  const closePalette = (): void => setPaletteOpen(false);

  return (
    <div className="relative p-1.5">
      {paletteOpen && slashItems.length > 0 ? (
        <div
          data-composer-palette
          className="absolute bottom-[calc(100%+4px)] right-1.5 left-1.5 z-50 overflow-hidden rounded-lg border border-line bg-white shadow-xl dark:bg-[#1E1E21]"
        >
          {slashItems.map((c) => (
            <button
              key={c.id}
              data-composer-palette-item={c.id}
              onClick={() => {
                closePalette();
                onSlash?.(c.id, '');
              }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-[#FDF0E6] dark:hover:bg-[#2A1E15]"
            >
              <span className="font-mono font-semibold text-terracotta">{c.name}</span>
              <span className="text-zinc-500">{c.hint}</span>
              {c.usage ? <span className="ml-auto hidden font-mono text-[11px] text-zinc-400 sm:inline">{c.usage}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {showMentionChips && contextPaths.length > 0 ? (
        <div data-composer-mentions className="mb-1.5 flex flex-wrap items-center gap-1">
          {contextPaths.map((p) => (
            <span
              key={p}
              data-composer-mention={p}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onChange(removeMention(value, p));
                }
              }}
              className="inline-flex items-center gap-1 rounded-full bg-[#262624] py-0.5 pl-1.5 pr-0.5 text-[11px] text-white"
              title={'Included as context — @' + p}
            >
              <span className="h-1 w-1 rounded-full bg-emerald-500" />@{p}
              <button
                onClick={() => onChange(removeMention(value, p))}
                className="grid h-3.5 w-3.5 place-items-center rounded-full hover:bg-white/10"
                title={'Remove @' + p}
                aria-label={'Remove @' + p + ' from context'}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <textarea
        {...attrs}
        ref={taRef}
        id={id}
        rows={1}
        aria-label={ariaLabel}
        aria-describedby={hintId}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          resize(e.target);
          setPaletteOpen(isSlashPrefix(e.target.value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
            e.preventDefault();
            closePalette();
            onSubmit();
          }
          if (e.key === 'Escape') closePalette();
        }}
        className="w-full resize-none bg-transparent px-1 py-1 text-[13px] focus:outline-none disabled:opacity-60"
        style={{ minHeight: minHeight + 'px' }}
      />
      {children}
    </div>
  );
});

/** Shortcut hint copy — shared so both surfaces advertise the same contract. */
export const COMPOSER_ENTER_HINT = 'Enter send · Shift+Enter newline · @file for context · / commands';