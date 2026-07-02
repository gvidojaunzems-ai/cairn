import { useEffect, useState } from 'react';

export type ColorScheme = 'dark' | 'light';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function readInitialScheme(): ColorScheme {
  // Guard for non-browser test environments where matchMedia is absent.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/**
 * Reflects the OS `prefers-color-scheme` preference.
 *
 * Returns `'dark'` when the OS is in dark mode, `'light'` otherwise. Updates
 * live when the user changes their OS-level preference while the app is open.
 */
export function useColorScheme(): ColorScheme {
  const [scheme, setScheme] = useState<ColorScheme>(readInitialScheme);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mediaQuery = window.matchMedia(DARK_QUERY);
    const handleChange = (event: MediaQueryListEvent): void => {
      setScheme(event.matches ? 'dark' : 'light');
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return scheme;
}
