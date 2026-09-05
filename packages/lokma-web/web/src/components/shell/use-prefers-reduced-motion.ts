import * as React from 'react';

/**
 * use-prefers-reduced-motion — honors the OS "reduce motion" setting.
 *
 * `prefersReducedMotion()` is the DOM-free query (safe in probes/tests);
 * `usePrefersReducedMotion()` subscribes so components re-render live when
 * the user flips the OS toggle. SSR-safe: defaults to false without window.
 */

const QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(QUERY).matches;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(prefersReducedMotion);
  React.useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
