// qa-spec: S4 — Sending an invalid payload to an op returns
// ValidationError without crashing core; a subsequent valid request
// returns ok:true. Tests the `validate<T>(schema, input)` helper AND
// the end-to-end dispatch through the router.
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  webContents: { getAllWebContents: vi.fn(() => []) },
  app: { getVersion: vi.fn(() => '0.0.0') },
  BrowserWindow: vi.fn(),
}));

import { validate } from '../../src/main/ipc/validate';
import { buildHandlerTable } from '../../src/main/ipc/register-handlers';
import { createIpcRouter } from '../../src/main/ipc/router';

describe('ipc/validate — Zod parse failure produces validation_error (S4)', () => {
  const schema = z
    .object({ name: z.string().min(1), age: z.number().int().nonnegative() })
    .strict();

  // qa-spec: S4
  it('valid input returns ok:true with parsed data', () => {
    const result = validate(schema, { name: 'Ada', age: 42 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ name: 'Ada', age: 42 });
    }
  });

  // qa-spec: S4 — omitting a required field
  it('missing required field returns ok:false with validation_error', () => {
    const result = validate(schema, { name: 'Ada' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation_error');
      expect(typeof result.error.message).toBe('string');
      expect(result.error.message.length).toBeGreaterThan(0);
    }
  });

  // qa-spec: S4 — wrong type on an existing field
  it('wrong-type field returns ok:false with validation_error', () => {
    const result = validate(schema, { name: 'Ada', age: 'forty-two' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('validation_error');
    }
  });

  // qa-spec: S4 — validate never throws even on totally invalid input
  it('validate never throws on any input', () => {
    expect(() => validate(schema, undefined)).not.toThrow();
    expect(() => validate(schema, null)).not.toThrow();
    expect(() => validate(schema, 'nope')).not.toThrow();
    expect(() => validate(schema, [])).not.toThrow();
    expect(() => validate(schema, { name: '', age: -1 })).not.toThrow();
  });

  // qa-spec: S4 — user-safe message, no raw ZodError dump in .message
  it('error.message is a user-safe string, not a raw ZodError JSON dump', () => {
    const result = validate(schema, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const msg = result.error.message;
      // A raw ZodError dump would start with "[" or "{" — the user-facing
      // message must be a short English sentence.
      expect(msg.startsWith('[')).toBe(false);
      expect(msg.startsWith('{')).toBe(false);
      expect(msg.length).toBeLessThan(200);
    }
  });
});

describe('ipc-router — invalid payload → validation_error, then valid follow-up (S4)', () => {
  // qa-spec: S4 — end-to-end via the router
  it('invalid then valid request pattern proves core stays responsive', async () => {
    const router = createIpcRouter({ handlers: buildHandlerTable() });

    // First: dispatch an intentionally malformed payload to a schema-guarded
    // op (projects.create requires { name: string with length >= 1 }).
    const bad = await router.dispatch('projects.create', { name: 123 } as unknown);
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.code).toBe('validation_error');
      expect(bad.error.message.length).toBeGreaterThan(0);
    }

    // Second: a valid follow-up still returns a well-formed
    // `CoreServiceResult<T>` — proving the router / core did not crash.
    const goodFollowUp = await router.dispatch('system.getStatus', {});
    expect(goodFollowUp.ok).toBe(true);
    if (goodFollowUp.ok) {
      expect(typeof goodFollowUp.apiVersion).toBe('string');
      expect(goodFollowUp.apiVersion.length).toBeGreaterThan(0);
    }
  });
});
