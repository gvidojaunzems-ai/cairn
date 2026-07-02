/**
 * Global error boundary for the Electron main process.
 *
 * Business rules:
 *   - Attach process-level handlers for `uncaughtException` and
 *     `unhandledRejection`. Both must funnel through the shared logger so
 *     they land in the structured JSON log file with secret redaction.
 *   - The logged short message must NEVER contain a full stack trace or the
 *     raw error text — pass only a short human-safe summary as the first
 *     argument, and the redacted details via the structured context.
 *   - In packaged builds only (`app.isPackaged`), relaunch the app after a
 *     fatal main-process error. In dev, keep the process alive so the
 *     developer can inspect state.
 */
import { app } from 'electron';

import { createLogger, redactSecrets } from '../shared/logger.js';

const logger = createLogger('main.error-boundary');

/**
 * Trim a raw error message so it never leaks a stack trace or unbounded text
 * into the user-visible/log line. Redacts secrets first so a redacted marker
 * is preserved in the truncated output.
 */
function toSafeMessage(kind: string, rawDetail: string): string {
  const redacted = String(redactSecrets(rawDetail));
  const trimmed = redacted.split('\n', 1)[0] ?? '';
  const MAX_LEN = 120;
  const truncated = trimmed.length > MAX_LEN ? `${trimmed.slice(0, MAX_LEN)}…` : trimmed;
  return `${kind}: ${truncated}`;
}

function isPackaged(): boolean {
  // `app.isPackaged` is undefined in unit-test mocks — treat missing as false
  // so tests never trigger a relaunch.
  const asRecord = app as unknown as { isPackaged?: boolean };
  return asRecord.isPackaged === true;
}

function relaunchIfPackaged(): void {
  if (!isPackaged()) {
    return;
  }
  // Only in packaged builds — dev inspection stays possible.
  app.relaunch();
  app.exit(0);
}

function handleUncaughtException(error: Error): void {
  const safeMessage = toSafeMessage('Uncaught exception', error.message);
  // Redact the raw error.message before it hits the context — the logger's
  // own redaction is a defence in depth, but explicit redaction here means
  // even a misconfigured logger cannot leak the secret.
  const safeErrorMessage = String(redactSecrets(error.message));
  logger.error(safeMessage, { errorName: error.name, errorMessage: safeErrorMessage });
  relaunchIfPackaged();
}

function handleUnhandledRejection(reason: unknown): void {
  const detail = reason instanceof Error ? reason.message : String(reason);
  const safeMessage = toSafeMessage('Unhandled rejection', detail);
  const safeDetail = String(redactSecrets(detail));
  logger.error(safeMessage, { reason: safeDetail });
  relaunchIfPackaged();
}

/**
 * Attach process-level handlers. Idempotent-safe to call once at boot; a
 * duplicate call adds a second listener (Node's default `EventEmitter`
 * behaviour) which is harmless but wasteful.
 */
export function registerErrorBoundary(): void {
  process.on('uncaughtException', handleUncaughtException);
  process.on('unhandledRejection', handleUnhandledRejection);
}
