// qa-spec: (implicit — agent-plan Task 7 error boundary)
// Verifies the global error boundary attaches handlers for uncaughtException
// and unhandledRejection, and that both invoke the shared logger without
// leaking the raw secret token into the message.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  dialog: { showErrorBox: vi.fn() },
  app: { relaunch: vi.fn(), exit: vi.fn() },
}));

const loggerError = vi.fn();
vi.mock('../../src/shared/logger', async () => {
  const actual = (await vi.importActual('../../src/shared/logger')) as Record<string, unknown>;
  return {
    ...actual,
    createLogger: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: loggerError,
    })),
  };
});

describe('main/error-boundary — implicit T7', () => {
  const originalUncaughtListeners = process.listeners('uncaughtException').slice();
  const originalRejectionListeners = process.listeners('unhandledRejection').slice();

  beforeEach(() => {
    // Snapshot pre-existing listeners so we can restore
    loggerError.mockClear();
  });

  afterEach(() => {
    // Remove any listeners registered by registerErrorBoundary
    process.removeAllListeners('uncaughtException');
    for (const l of originalUncaughtListeners) process.on('uncaughtException', l);
    process.removeAllListeners('unhandledRejection');
    for (const l of originalRejectionListeners) process.on('unhandledRejection', l);
  });

  // qa-spec: none-direct (implicit T7)
  it('registerErrorBoundary attaches a listener for uncaughtException', async () => {
    const { registerErrorBoundary } = await import('../../src/main/error-boundary');
    const before = process.listenerCount('uncaughtException');
    registerErrorBoundary();
    const after = process.listenerCount('uncaughtException');
    expect(after).toBeGreaterThan(before);
  });

  // qa-spec: none-direct (implicit T7)
  it('registerErrorBoundary attaches a listener for unhandledRejection', async () => {
    const { registerErrorBoundary } = await import('../../src/main/error-boundary');
    const before = process.listenerCount('unhandledRejection');
    registerErrorBoundary();
    const after = process.listenerCount('unhandledRejection');
    expect(after).toBeGreaterThan(before);
  });

  // qa-spec: none-direct (implicit T7) — logger.error is called on uncaughtException
  it('logs via logger.error when an uncaughtException fires', async () => {
    const { registerErrorBoundary } = await import('../../src/main/error-boundary');
    registerErrorBoundary();
    const listeners = process.listeners('uncaughtException');
    // Fire the newest listener directly to avoid process termination
    const newest = listeners[listeners.length - 1] as (err: Error) => void;
    newest(new Error('boom-test'));
    expect(loggerError).toHaveBeenCalled();
    const call = loggerError.mock.calls[0] ?? [];
    const message = String(call[0] ?? '');
    // The user-visible message must not include the raw stack — we assert the
    // logger was called with a short message string.
    expect(message.length).toBeGreaterThan(0);
    expect(message.length).toBeLessThan(200);
  });

  // qa-spec: S7 — secrets in the error path must be redacted
  it('does not include the literal secret in the logged message when the error carries one', async () => {
    const { registerErrorBoundary } = await import('../../src/main/error-boundary');
    registerErrorBoundary();
    const listeners = process.listeners('uncaughtException');
    const newest = listeners[listeners.length - 1] as (err: Error) => void;
    newest(new Error('failed with token sk-abc123secretvalue'));
    const call = loggerError.mock.calls[0] ?? [];
    const serialized = JSON.stringify(call);
    expect(serialized).not.toContain('sk-abc123secretvalue');
  });
});
