/**
 * IPC router — the single dispatch table between namespaced ops and their
 * service handlers.
 *
 * Business rules:
 *   - Every declared `namespace.op` pair MUST have a handler entry — the
 *     contract tests fail loud on missing keys.
 *   - Each dispatch is: validate(input) → handler(validInput) →
 *     CoreServiceResult<T>. Thrown exceptions are trapped and converted to
 *     `code:'internal'` errors so no stack trace escapes IPC.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import {
  OP_NAMESPACES,
  type NamespaceName,
  type QualifiedOpId,
} from '../../shared/ipc/operations.js';
import { getInputSchema } from '../../shared/ipc/schemas.js';

import { errResult, makeError, toCoreServiceError } from './errors.js';
import { validate } from './validate.js';

/**
 * Handler signature for a single op. Handlers may be sync or async and
 * always resolve to a `CoreServiceResult<T>`.
 */
export type OpHandler = (
  input: unknown,
) => Promise<CoreServiceResult<unknown>> | CoreServiceResult<unknown>;

/** Dispatch table mapping qualified op ids to handlers. */
export type HandlerTable = Partial<Record<QualifiedOpId, OpHandler>>;

/** Public router surface. */
export interface IpcRouter {
  /** Dispatch a single op. Never throws. */
  dispatch(id: QualifiedOpId, input: unknown): Promise<CoreServiceResult<unknown>>;
  /** Enumerate every qualified id currently registered. */
  registeredIds(): readonly QualifiedOpId[];
  /** True if `id` has a bound handler. */
  hasHandler(id: QualifiedOpId): boolean;
}

interface CreateRouterOptions {
  handlers: HandlerTable;
}

/**
 * Compute the full set of expected qualified ids from `OP_NAMESPACES`.
 * Exposed so the bootstrap can assert exhaustive coverage.
 */
export function expectedQualifiedIds(): readonly QualifiedOpId[] {
  const ids: QualifiedOpId[] = [];
  for (const namespace of Object.keys(OP_NAMESPACES) as NamespaceName[]) {
    for (const op of OP_NAMESPACES[namespace]) {
      ids.push(`${namespace}.${op}` as QualifiedOpId);
    }
  }
  return ids;
}

/**
 * Build a router from a handler table. Validates against the shared Zod
 * registry before dispatching.
 */
export function createIpcRouter(options: CreateRouterOptions): IpcRouter {
  const { handlers } = options;

  async function dispatch(
    id: QualifiedOpId,
    input: unknown,
  ): Promise<CoreServiceResult<unknown>> {
    const schema = getInputSchema(id);
    if (!schema) {
      return errResult(
        makeError('not_found', `Unknown operation: ${id}`),
      );
    }
    const parsed = validate(schema, input);
    if (!parsed.ok) {
      return parsed;
    }
    const handler = handlers[id];
    if (!handler) {
      return errResult(
        makeError('not_implemented', `No handler registered for: ${id}`),
      );
    }
    try {
      // Await so promise rejections funnel into the same trap.
      const result = await handler(parsed.data);
      return result;
    } catch (err: unknown) {
      return errResult(toCoreServiceError(err));
    }
  }

  return {
    dispatch,
    registeredIds: (): readonly QualifiedOpId[] =>
      Object.keys(handlers) as QualifiedOpId[],
    hasHandler: (id: QualifiedOpId): boolean => handlers[id] !== undefined,
  };
}
