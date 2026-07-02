// qa-spec: S6, S7 — structured JSON logging, no secret leakage, and redaction.
// Covers AC-6 (structured JSON with level/timestamp/message, no secrets in normal ops)
// and AC-7 (blocklisted keys, message strings, and nested contexts redact literal secret).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLogger,
  redactSecrets,
  REDACTION_MARKER,
  MAX_FILE_SIZE_BYTES,
  MAX_ROTATED_FILES,
  SECRET_KEY_BLOCKLIST,
} from '../../src/shared/logger';

interface CapturedEntry {
  level: string;
  timestamp: string;
  message: string;
  context?: Record<string, unknown>;
}

const originalWrite = process.stdout.write.bind(process.stdout);
const writes: string[] = [];

beforeEach(() => {
  writes.length = 0;
  // Capture stdout writes so we can inspect logger output regardless of
  // whether it goes via console.log or process.stdout.write.
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
    return true;
  }) as typeof process.stdout.write;
  // Also spy on console.log/info/error so a console-based implementation still surfaces
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    writes.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  });
  vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
    writes.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    writes.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  });
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    writes.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  });
  process.env.NODE_ENV = 'development';
});

afterEach(() => {
  process.stdout.write = originalWrite;
  vi.restoreAllMocks();
});

function findJsonEntry(): CapturedEntry | undefined {
  for (const w of writes) {
    // Strip trailing newlines
    const s = w.trim();
    if (!s.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(s) as CapturedEntry;
      if (parsed && typeof parsed.message === 'string') return parsed;
    } catch {
      // continue
    }
  }
  return undefined;
}

describe('logger — structured output (S6 / AC-6)', () => {
  // qa-spec: S6
  it('info() emits a JSON entry with level, timestamp (ISO 8601), and message', () => {
    const log = createLogger('test');
    log.info('hello world');
    const entry = findJsonEntry();
    expect(entry, `expected a JSON log entry in stdout/console. Got: ${writes.join(' | ')}`).toBeDefined();
    expect(entry?.level).toBe('info');
    expect(entry?.message).toBe('hello world');
    expect(entry?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  // qa-spec: S6
  it('error() emits a JSON entry with level = "error"', () => {
    const log = createLogger('test');
    log.error('kaboom');
    const entry = findJsonEntry();
    expect(entry?.level).toBe('error');
    expect(entry?.message).toBe('kaboom');
  });
});

describe('logger — secret redaction (S7 / AC-7)', () => {
  const SECRET = 'sk-abc123secretvalue';

  // qa-spec: S7
  it('redacts values under blocklisted keys (token, secret, password, key, apiKey, credential)', () => {
    const log = createLogger('test');
    log.info('startup', { token: SECRET, password: SECRET, apiKey: SECRET });
    const combined = writes.join('\n');
    expect(combined).not.toContain(SECRET);
    // The marker should appear at least once
    expect(combined).toContain(REDACTION_MARKER);
  });

  // qa-spec: S7
  it('redacts secret-looking values inside the message string itself', () => {
    const log = createLogger('test');
    log.info(`connecting with token ${SECRET}`);
    const combined = writes.join('\n');
    expect(combined).not.toContain(SECRET);
  });

  // qa-spec: S7
  it('redacts secrets in nested contexts (e.g. context.auth.token)', () => {
    const log = createLogger('test');
    log.info('nested', { auth: { header: { token: SECRET } } });
    const combined = writes.join('\n');
    expect(combined).not.toContain(SECRET);
  });

  // qa-spec: S7
  it('redactSecrets() replaces blocklisted keys with the redaction marker', () => {
    const result = redactSecrets({ token: SECRET, safe: 'ok' }) as Record<string, unknown>;
    expect(result.token).toBe(REDACTION_MARKER);
    expect(result.safe).toBe('ok');
  });

  // qa-spec: S7
  it('redactSecrets() sweeps regex-matching values (sk-... pattern) inside strings', () => {
    const out = String(redactSecrets(`Authorization: Bearer ${SECRET}`));
    expect(out).not.toContain(SECRET);
  });

  // Blocklist sanity
  it('SECRET_KEY_BLOCKLIST includes all required keys', () => {
    for (const key of ['token', 'secret', 'password', 'key', 'apiKey', 'credential']) {
      expect(SECRET_KEY_BLOCKLIST).toContain(key);
    }
  });
});

describe('logger — bounded rotation (implicit T5)', () => {
  it('advertises MAX_FILE_SIZE_BYTES ≤ 5 MB', () => {
    expect(MAX_FILE_SIZE_BYTES).toBeLessThanOrEqual(5 * 1024 * 1024);
    expect(MAX_FILE_SIZE_BYTES).toBeGreaterThan(0);
  });
  it('advertises MAX_ROTATED_FILES ≤ 5', () => {
    expect(MAX_ROTATED_FILES).toBeLessThanOrEqual(5);
    expect(MAX_ROTATED_FILES).toBeGreaterThan(0);
  });
});
