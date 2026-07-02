import { useEffect, useState } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function readInitialReducedMotion(): boolean {
  // Guard for non-browser test environments where matchMedia is absent.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Reflects the OS `prefers-reduced-motion` preference.
 *
 * Returns `true` when the user has requested reduced motion. Live-updates on
 * OS-level preference changes so future animated components can react.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(readInitialReducedMotion);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
    const handleChange = (event: MediaQueryListEvent): void => {
      setReduced(event.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return reduced;
}
