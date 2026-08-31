import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Badge — status pills for health, model, provider.
 */

export function Badge({ className, variant = 'default', ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'secondary' | 'outline' }) {
  const variantClass =
    variant === 'secondary'
      ? 'bg-secondary text-secondary-foreground'
      : variant === 'outline'
        ? 'border text-foreground'
        : 'bg-primary text-primary-foreground';
  return <div className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors', variantClass, className)} {...props} />;
}
