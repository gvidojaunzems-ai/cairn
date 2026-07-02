/**
 * TeamRepo contract.
 *
 * DO NOT MODIFY EXPORTS WITHOUT A VERSIONING ADR.
 *
 * Business rules:
 *   - The five contract files under `src/contracts/` are the single source of
 *     truth for inter-module shapes. Renaming, moving, or restructuring their
 *     exported symbols would break every downstream module without warning.
 *   - Any change to an exported symbol here requires a new ADR under
 *     `docs/adr/` documenting the versioning strategy for the affected
 *     consumers.
 *   - The current fields are a conservative first-cut. Future tasks expand
 *     the interface additively (never rename or remove existing fields).
 */

/**
 * A local git repository the app tracks read-only.
 */
export interface TeamRepo {
  /** Stable identifier assigned when the repo is first registered. */
  id: string;
  /** Absolute filesystem path to the repo working tree. */
  path: string;
  /** Human-readable display name (defaults to the folder name). */
  name: string;
}
