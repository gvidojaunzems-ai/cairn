/**
 * Global `window.cairn` type declaration for the renderer.
 *
 * Business rules:
 *   - This file is types-only — no runtime code. Bundlers strip it.
 *   - `CairnPreloadAPI` is imported as `import type` from the shared preload
 *     contract in `./client` so tsc treats the reference as erased. No runtime
 *     import of `electron`, `node:*`, `better-sqlite3`, or `zod` reaches the
 *     renderer bundle through this declaration.
 *   - The `export {}` at the bottom is required so TypeScript treats this
 *     file as a module (a prerequisite for `declare global` to work).
 */
import type { CairnPreloadAPI } from './client';

declare global {
  interface Window {
    /**
     * The IPC bridge exposed by the preload script. See `PRELOAD_API_NAME`
     * in `./client` (mirrors `preloadApiName` in `src/preload/index.ts`).
     */
    cairn: CairnPreloadAPI;
  }
}

export {};
