/**
 * AITask contract.
 *
 * DO NOT MODIFY EXPORTS WITHOUT A VERSIONING ADR.
 *
 * Business rules:
 *   - The `status` union is deliberately closed. Adding a new state (e.g.
 *     'cancelled') requires a versioning ADR because every exhaustive
 *     `switch` downstream must be updated in the same change.
 *   - `type` is a free-form string so new task kinds (e.g. 'embed', 'chat',
 *     'summarize') can be added without a contract change.
 */

/**
 * Lifecycle-tracked unit of AI work — the smallest thing the app schedules,
 * runs, and reports on.
 */
export interface AITask {
  /** Stable identifier assigned at creation time. */
  id: string;
  /** Task kind — free-form, defined by producers (e.g. 'embed', 'chat'). */
  type: string;
  /** Lifecycle state. */
  status: 'pending' | 'running' | 'done' | 'failed';
}
