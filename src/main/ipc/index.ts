/**
 * Barrel for the main-process IPC layer.
 */
export { createEventBus, type EventBus, type WebContentsLike } from './event-bus.js';
export {
  errResult,
  makeError,
  notImplementedResult,
  okResult,
  toCoreServiceError,
} from './errors.js';
export { validate } from './validate.js';
export {
  createIpcRouter,
  expectedQualifiedIds,
  type HandlerTable,
  type IpcRouter,
  type OpHandler,
} from './router.js';
export { buildHandlerTable, registerIpcHandlers } from './register-handlers.js';
