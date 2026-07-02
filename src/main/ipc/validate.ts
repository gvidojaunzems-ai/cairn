/**
 * Zod validator helper — converts a Zod parse failure into a typed
 * `validation_error` `CoreServiceResult<never>` so no thrown exception
 * crosses the IPC boundary.
 *
 * Business rules:
 *   - Always returns a `CoreServiceResult<T>` — never throws.
 *   - The `details` field carries `ZodIssue[]` so client-side dev tools
 *     can render field-level messages. The user-safe `message` string
 *     stays short.
 */
import type { z } from 'zod';

import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { errResult, makeError, okResult } from './errors.js';

/**
 * Parse `input` with `schema`. On success returns `{ok:true, data}`. On
 * failure returns `{ok:false, error:{code:'validation_error', ...}}`.
 */
export function validate<T>(
  schema: z.ZodType<T>,
  input: unknown,
): CoreServiceResult<T> {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return okResult(parsed.data);
  }
  return errResult(
    makeError(
      'validation_error',
      'Request failed validation.',
      parsed.error.issues,
    ),
  );
}
