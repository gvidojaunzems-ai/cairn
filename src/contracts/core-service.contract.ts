/**
 * CoreService contract.
 *
 * DO NOT MODIFY EXPORTS WITHOUT A VERSIONING ADR.
 *
 * Business rules:
 *   - Every core service response is a `CoreServiceResult` so the renderer
 *     can distinguish "no data" from "error" without exception marshalling
 *     across the IPC boundary.
 *   - Follows the Result pattern in `.claude/rules/examples/golden-examples.md`
 *     — kept structurally compatible (ok / data / error) with the shared
 *     Result<T> in `src/shared/keychain.ts` for future consolidation.
 */

/**
 * Uniform return shape for any core-service IPC call.
 */
export interface CoreServiceResult<T> {
  /** True when the operation succeeded and `data` is populated. */
  ok: boolean;
  /** Populated on success. */
  data?: T;
  /** User-safe error message. Never include raw stack traces or secrets. */
  error?: string;
}
