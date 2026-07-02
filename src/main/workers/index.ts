/**
 * Barrel for the workers subsystem. The actual worker script is
 * `background.worker.ts` — its default export runs on parentPort load.
 */
export { handleMessage } from './background.worker.js';
