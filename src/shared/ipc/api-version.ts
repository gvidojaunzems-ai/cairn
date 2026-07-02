/**
 * API version constant for the IPC transport contract.
 *
 * Business rules:
 *   - Every `CoreServiceResult<T>` returned from the main process embeds
 *     this string so the renderer can detect a mismatched core version
 *     (e.g. after an upgrade) before dispatching a stale operation.
 *   - Bumping this string is a breaking-change signal. Any bump must be
 *     documented in a new ADR under `docs/adr/` and accompanied by a
 *     migration story.
 */
export const API_VERSION = '1.0.0' as const;

/** Type alias for compile-time consumers. */
export type ApiVersion = typeof API_VERSION;
