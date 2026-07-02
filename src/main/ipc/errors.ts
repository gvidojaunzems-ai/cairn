/**
 * Helpers for building `CoreServiceError` values inside the main process.
 *
 * Business rules:
 *   - Every error that crosses the IPC boundary passes through
 *     `toCoreServiceError()` — direct `new Error()` throws are trapped by
 *     the router and converted here so the renderer NEVER sees a raw
 *     stack trace.
 *   - User-safe messages routed to the UI should go through `t()` on the
 *     UI side; internal-only messages may stay in English here.
 */
import type {
  CoreServiceError,
  CoreServiceErrorCode,
  CoreServiceErr,
  CoreServiceOk,
  CoreServiceResult,
} from '../../contracts/core-service.contract.js';
import { API_VERSION } from '../../shared/ipc/api-version.js';

/** Build a typed error object with an explicit code and message. */
export function makeError(
  code: CoreServiceErrorCode,
  message: string,
  details?: unknown,
): CoreServiceError {
  // The discriminant is `code`; each variant otherwise shares the same
  // shape, so a single object literal satisfies the union.
  const base = { code, message } as const;
  if (details === undefined) {
    return base as CoreServiceError;
  }
  return { ...base, details } as CoreServiceError;
}

/** Wrap a success value in a `CoreServiceResult<T>` with the transport version. */
export function okResult<T>(data: T): CoreServiceOk<T> {
  return { ok: true, data, apiVersion: API_VERSION };
}

/** Wrap an error in a `CoreServiceResult<never>` with the transport version. */
export function errResult(error: CoreServiceError): CoreServiceErr {
  return { ok: false, error, apiVersion: API_VERSION };
}

/**
 * Standard "not_implemented" response for stub operations. Kept as a
 * single helper so every service returns exactly the same shape.
 */
export function notImplementedResult(operation: string): CoreServiceResult<never> {
  return errResult(
    makeError(
      'not_implemented',
      `Operation not implemented yet: ${operation}`,
    ),
  );
}

/**
 * Coerce an unknown thrown value into a `CoreServiceError`. Sanitises the
 * message so no raw stack trace escapes. Fatal internal errors return
 * `code: 'internal'`.
 */
export function toCoreServiceError(err: unknown): CoreServiceError {
  if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
    const asError = err as { code: unknown; message: unknown };
    if (typeof asError.code === 'string' && typeof asError.message === 'string') {
      // Preserve typed errors that already have the right shape.
      return makeError(
        asError.code as CoreServiceErrorCode,
        asError.message,
      );
    }
  }
  // Never include Error.stack — one line only.
  const summary =
    err instanceof Error
      ? (err.message.split('\n', 1)[0] ?? 'Unknown error')
      : 'Unknown error';
  return makeError('internal', summary);
}
