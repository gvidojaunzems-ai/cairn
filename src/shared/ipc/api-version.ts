/**
 * API version constant for the IPC transport contract.
 *
 * v2.0.0 — Spec 03 full operation + event catalog (ADR 0007).
 */
export const API_VERSION = '2.0.0' as const;

/** Type alias for compile-time consumers. */
export type ApiVersion = typeof API_VERSION;
