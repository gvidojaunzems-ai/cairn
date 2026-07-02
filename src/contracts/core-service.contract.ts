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
 *   - Additive extension in ADR 0003 introduces a typed error taxonomy
 *     (`CoreServiceError`) and an `apiVersion` field. The `message` field on
 *     `CoreServiceError` mirrors the legacy user-safe string so consumers
 *     that previously read `result.error` for display can migrate to
 *     `result.error.message` with no semantic loss.
 *   - This file remains interface-only — no runtime imports. Zod schemas
 *     for input validation live under `src/shared/ipc/schemas.ts`.
 */

/**
 * Enumerated code taxonomy for core-service error responses. The taxonomy
 * is stable — new codes require an ADR because every consumer switch must
 * be extended in the same change.
 */
export type CoreServiceErrorCode =
  | 'validation_error'
  | 'not_found'
  | 'conflict'
  | 'unavailable'
  | 'forbidden'
  | 'internal'
  | 'not_implemented';

/**
 * Common shape shared by every `CoreServiceError` variant. Kept as a
 * separate interface so exhaustive `switch` blocks can narrow on `code`
 * while still reading `message` / `details` uniformly.
 */
interface CoreServiceErrorBase {
  /**
   * User-safe message. Never contains stack traces, raw error text, or
   * secrets. Consumers that previously read `result.error` as a plain
   * string should read `result.error.message` instead — the semantic
   * intent is identical.
   */
  message: string;
  /**
   * Optional structured details for debugging (e.g. Zod issues on
   * validation errors). Callers MUST NOT surface `details` in the UI
   * without their own redaction pass.
   */
  details?: unknown;
}

/**
 * Discriminated union of every possible error surface. The discriminant
 * is `code`. Each variant carries the same base fields; the union exists
 * so downstream `switch (error.code)` narrowing is exhaustive.
 */
export type CoreServiceError =
  | (CoreServiceErrorBase & { code: 'validation_error' })
  | (CoreServiceErrorBase & { code: 'not_found' })
  | (CoreServiceErrorBase & { code: 'conflict' })
  | (CoreServiceErrorBase & { code: 'unavailable' })
  | (CoreServiceErrorBase & { code: 'forbidden' })
  | (CoreServiceErrorBase & { code: 'internal' })
  | (CoreServiceErrorBase & { code: 'not_implemented' });

/**
 * API version string surfaced on every response so the renderer can gate
 * against a known transport contract. Mirrors `API_VERSION` in
 * `src/shared/ipc/api-version.ts`; kept as a nominal `string` here so
 * this file stays runtime-import-free.
 */
export type ApiVersion = string;

/**
 * Success arm — narrows `ok` to `true`, populates `data`, includes the
 * transport `apiVersion`.
 */
export interface CoreServiceOk<T> {
  ok: true;
  data: T;
  apiVersion: ApiVersion;
}

/**
 * Failure arm — narrows `ok` to `false`, replaces the legacy string
 * `error` field with a typed `CoreServiceError` object. The `message`
 * property on that object mirrors the legacy user-safe string.
 */
export interface CoreServiceErr {
  ok: false;
  error: CoreServiceError;
  apiVersion: ApiVersion;
}

/**
 * Uniform return shape for any core-service IPC call. Discriminated on
 * `ok` so a single `if (result.ok)` block narrows `data` on the true arm
 * and `error` on the false arm.
 */
export type CoreServiceResult<T> = CoreServiceOk<T> | CoreServiceErr;
