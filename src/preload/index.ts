/**
 * Electron preload script.
 *
 * Business rules:
 *   - The renderer runs with contextIsolation:true and sandbox:true. That means
 *     it never sees `ipcRenderer` directly — every IPC surface must be
 *     enumerated here and exposed via `contextBridge.exposeInMainWorld`.
 *   - The exposed API is deliberately minimal — only what the empty foundation
 *     needs. Growing this surface is a security-sensitive change; each new
 *     method should be justified in a follow-up ADR or PR body.
 */
import { contextBridge, ipcRenderer } from 'electron';

/**
 * The channel name for renderer-initiated app restarts. Mirrors
 * `RESTART_APP_CHANNEL` in `src/main/index.ts` — keep in sync.
 */
export const RESTART_APP_CHANNEL = 'restart-app';

/**
 * Typed surface exposed to `window.cairn` in the renderer.
 * Any addition to this interface must be paired with a corresponding
 * `contextBridge.exposeInMainWorld` entry below.
 */
export interface CairnPreloadAPI {
  /** Ask the main process to relaunch the app (used by the React error boundary). */
  restartApp: () => void;
}

/**
 * The property name under which the API is exposed on `window`.
 * Used by both the preload and the renderer.
 */
export const preloadApiName = 'cairn';

const api: CairnPreloadAPI = {
  restartApp: (): void => {
    ipcRenderer.send(RESTART_APP_CHANNEL);
  },
};

// `contextBridge` is unavailable in unit tests that stub electron — guard so
// importing this module for type extraction doesn't throw.
if (typeof contextBridge?.exposeInMainWorld === 'function') {
  contextBridge.exposeInMainWorld(preloadApiName, api);
}
