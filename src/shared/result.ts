/**
 * Shared Result<T> discriminated union.
 *
 * Business rules:
 *   - This is the canonical Result shape used across `src/shared/**` and
 *     `src/main/**`. It is structurally compatible with the historical local
 *     `Result<T>` alias in `src/shared/keychain.ts` (kept there for backwards
 *     compatibility) — both use `{ success: true; data }` / `{ success: false;
 *     error }` so a downstream consumer cannot tell them apart.
 *   - The `error` field is a user-safe string. Never place raw stack traces,
 *     PII, or secret material in an `error`.
 *   - Prefer the `ok(...)` and `err(...)` helpers over hand-writing object
 *     literals: they narrow correctly and read closer to the pattern in
 *     `.claude/rules/examples/golden-examples.md`.
 */

/**
 * Success arm of a Result<T>. `data` is the useful payload.
 */
export interface ResultOk<T> {
  success: true;
  data: T;
}

/**
 * Failure arm of a Result<T>. `error` is a user-safe message.
 */
export interface ResultErr {
  success: false;
  error: string;
}

/**
 * Discriminated union used for all fallible synchronous or asynchronous
 * operations that must not throw across a module boundary.
 */
export type Result<T> = ResultOk<T> | ResultErr;

/**
 * Construct a success Result.
 */
export function ok<T>(data: T): Result<T> {
  return { success: true, data };
}

/**
 * Construct a failure Result. `error` should be short and human-safe —
 * callers rely on it landing directly in log output.
 */
export function err<T>(error: string): Result<T> {
  return { success: false, error };
}

/**
 * Narrowing type guard — usable in `if (isOk(r))` checks so TypeScript picks
 * the correct arm inside the block.
 */
export function isOk<T>(result: Result<T>): result is ResultOk<T> {
  return result.success === true;
}

/**
 * Narrowing type guard — the failure arm counterpart to `isOk`.
 */
export function isErr<T>(result: Result<T>): result is ResultErr {
  return result.success === false;
}
