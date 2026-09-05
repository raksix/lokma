import * as React from 'react';
import { MOBILE_BREAKPOINT, mobileQuery } from './responsive';

/**
 * useIsMobile — live mobile-viewport flag for the responsive shell.
 * Subscribes to `matchMedia` so rotating a tablet or resizing a desktop
 * window flips the layout without a reload. SSR/test-safe: returns false
 * when `window.matchMedia` is unavailable.
 */
export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(mobileQuery(breakpoint)).matches;
  });

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(mobileQuery(breakpoint));
    const onChange = (event: MediaQueryListEvent): void => setIsMobile(event.matches);
    setIsMobile(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [breakpoint]);

  return isMobile;
}
