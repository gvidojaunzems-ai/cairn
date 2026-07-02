/**
 * Public re-exports for the shared IPC descriptor layer.
 *
 * Business rules:
 *   - This barrel exposes the type-only + zero-dependency modules so both
 *     the renderer and the main process can import shape/name descriptors
 *     without pulling zod.
 *   - `schemas.ts` is DELIBERATELY NOT re-exported here — it imports
 *     `zod`, which must never appear in the renderer bundle. Main-process
 *     code that needs runtime schemas imports `./schemas` directly.
 */
export * from './api-version.js';
export * from './events.js';
export * from './operations.js';
