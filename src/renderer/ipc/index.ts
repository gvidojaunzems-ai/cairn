/**
 * Public barrel for the renderer IPC surface.
 *
 * Consumers should import from `../ipc` (this barrel) rather than reaching
 * into `./client` directly — that lets the internal file layout evolve
 * without churn on call sites.
 */

export {
  CairnRendererClient,
  createRendererClient,
  PRELOAD_API_NAME,
} from './client';
export type {
  CairnPreloadAPI,
  EventName,
  EventPayloads,
  IpcEventHandler,
  NamespaceName,
  OpName,
} from './client';
