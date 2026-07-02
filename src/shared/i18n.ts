/**
 * Minimal i18n stub — `t()` returns the key by default with an optional
 * per-key English fallback map.
 *
 * Business rules:
 *   - All user-facing strings in the renderer MUST route through `t()` so
 *     later tasks can swap in a real i18n library (i18next, format.js, etc.)
 *     without touching call sites.
 *   - The `keys` registry is deliberately exported so extraction tooling
 *     (e.g. a future `pnpm i18n:extract` step) can enumerate every key
 *     without static analysis of the whole codebase.
 */

/**
 * Fallback English copy per key. Keeping this as an explicit map (rather than
 * inline defaults) makes it trivial to hand off to a translator later.
 */
export const keys = {
  'app.mainLandmark': 'Cairn',
  'app.restartButton': 'Restart',
  'app.errorFallbackTitle': 'Something went wrong',
  'app.errorFallbackBody':
    'Cairn hit an unexpected error. Restart the app to continue.',
} as const;

export type TranslationKey = keyof typeof keys;

/**
 * Look up the translation for `key`.
 *
 * - When `key` is registered in `keys`, returns its English fallback.
 * - Otherwise returns `fallback` if provided, else the raw `key` (so missing
 *   translations are visible during development without crashing the UI).
 */
export function t(key: string, fallback?: string): string {
  const registryValue = (keys as Record<string, string>)[key];
  if (typeof registryValue === 'string') {
    return registryValue;
  }
  if (typeof fallback === 'string') {
    return fallback;
  }
  return key;
}
