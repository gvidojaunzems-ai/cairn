/**
 * Feature-flags file schema.
 *
 * Business rules:
 *   - Every flag defaults to `false` so incomplete work ships disabled by
 *     default and the app always runs.
 *   - The schema is deliberately open (index signature) so new flags can be
 *     added without a code change in this file. Type-safety is enforced at
 *     the call site via `getFlag(name)` returning `boolean`.
 */
export interface FeatureFlagConfig {
  [flagName: string]: boolean;
}
