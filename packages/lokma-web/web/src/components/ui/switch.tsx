import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Switch — accessible enable/disable toggle (REQ-049).
 * A `button[role=switch]` with `aria-checked`, terracotta ON to match the
 * models-pane accent. Full literal classes (no dynamic Tailwind names).
 */

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}

export function Switch({ checked, onChange, disabled = false, label, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-terracotta' : 'bg-zinc-300 dark:bg-zinc-600',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]',
        )}
      />
    </button>
  );
}
