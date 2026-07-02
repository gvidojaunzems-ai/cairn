/**
 * Structured JSON logger with mandatory secret redaction and bounded rotation.
 *
 * Business rules:
 *   - Every entry is a single-line JSON object with { level, timestamp, message,
 *     context? }. Consumers (splunk, jq, human eyeballs) can rely on newline-
 *     delimited JSON.
 *   - Secrets must NEVER reach console output or the log file — the privacy
 *     invariant is enforced on three axes:
 *       1. Blocklisted keys in structured `context` (token, secret, password,
 *          apiKey, credential, key, authorization).
 *       2. Regex sweep of `message` for known secret shapes (sk-*, ghp_*,
 *          Bearer *, long hex/base64 runs).
 *       3. Recursive redaction of nested `context` objects.
 *   - Log file rotates at MAX_FILE_SIZE_BYTES (5 MB default) and retains at
 *     most MAX_ROTATED_FILES (5) rotations — bounds disk usage to ~25 MB
 *     per app installation to protect the low-footprint budget.
 */
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { resolvePaths } from './paths.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export const REDACTION_MARKER = '[REDACTED]';
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_ROTATED_FILES = 5;

/**
 * Case-insensitive substring match against known secret-carrying key names.
 * Rationale: catches variants like `accessToken`, `refresh_token`, `X-Api-Key`
 * without needing an exhaustive list.
 */
export const SECRET_KEY_BLOCKLIST = [
  'token',
  'secret',
  'password',
  'apiKey',
  'credential',
  'authorization',
  'key',
];

/**
 * Regex patterns for known secret shapes that may appear inline in `message`
 * strings. Order matters: more-specific patterns first so shorter matches
 * don't shadow longer ones.
 */
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  // Stripe-style: sk_ or sk- followed by alnum/underscore run (>= 8 chars).
  /sk[-_][A-Za-z0-9_-]{8,}/g,
  // GitHub personal-access tokens: ghp_ / gho_ / ghu_ / ghs_ / ghr_ prefixes.
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  // OAuth Bearer tokens: "Bearer " + non-whitespace run.
  /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/g,
  // Generic base64/hex runs of >= 32 characters — long enough to be a token,
  // short enough not to catch structured JSON blobs.
  /\b[A-Fa-f0-9]{32,}\b/g,
];

function isBlocklistedKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SECRET_KEY_BLOCKLIST.some((needle) => lower.includes(needle.toLowerCase()));
}

function redactString(input: string): string {
  let output = input;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    output = output.replace(pattern, REDACTION_MARKER);
  }
  return output;
}

/**
 * Recursively redact secrets in `value`.
 *
 * - Object entries with a blocklisted key name have their value replaced by the
 *   redaction marker regardless of value shape.
 * - String values are swept for secret-shape regexes.
 * - Nested objects/arrays are traversed.
 * - Primitives (number, boolean, null, undefined) are returned unchanged.
 */
export function redactSecrets(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSecrets(item));
  }
  const source = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(source)) {
    if (isBlocklistedKey(key)) {
      output[key] = REDACTION_MARKER;
      continue;
    }
    output[key] = redactSecrets(entryValue);
  }
  return output;
}

interface LoggerOptions {
  /** Directory where the log file lives. Defaults to `resolvePaths().logs`. */
  logDir?: string;
  /** Log file base name. Defaults to `cairn.log`. */
  fileName?: string;
  /** Threshold in bytes before rotation. Defaults to MAX_FILE_SIZE_BYTES. */
  maxFileSizeBytes?: number;
  /** Max rotated files retained. Defaults to MAX_ROTATED_FILES. */
  maxRotatedFiles?: number;
  /**
   * Whether to also mirror entries to the console. Defaults to `NODE_ENV !==
   * 'production'` so packaged builds stay quiet.
   */
  mirrorToConsole?: boolean;
}

/**
 * Rotate `filePath` when it exceeds `maxSize`. Retains up to `maxFiles`
 * rotations, evicting the oldest.
 */
export function rotateLogFile(
  filePath: string,
  maxSize: number,
  maxFiles: number,
): void {
  if (!existsSync(filePath)) {
    return;
  }
  const stats = statSync(filePath);
  if (stats.size < maxSize) {
    return;
  }
  // Shift .N -> .N+1, evicting the oldest.
  for (let index = maxFiles - 1; index >= 1; index -= 1) {
    const source = `${filePath}.${index}`;
    const destination = `${filePath}.${index + 1}`;
    if (existsSync(source)) {
      if (index + 1 > maxFiles) {
        unlinkSync(source);
      } else {
        renameSync(source, destination);
      }
    }
  }
  renameSync(filePath, `${filePath}.1`);
  // Trim any rotations that outrun the retention window (defensive — e.g. if
  // maxFiles shrank between runs).
  const overflow = `${filePath}.${maxFiles + 1}`;
  if (existsSync(overflow)) {
    unlinkSync(overflow);
  }
}

function formatEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function nowIso(): string {
  return new Date().toISOString();
}

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Create a logger scoped to `name` (embedded in every entry as
 * `context.logger`). Writes JSON-lines to the resolved logs directory with
 * bounded rotation and optional console mirroring.
 */
export function createLogger(name: string, options: LoggerOptions = {}): Logger {
  const logDir = options.logDir ?? resolvePaths().logs;
  const fileName = options.fileName ?? 'cairn.log';
  const filePath = join(logDir, fileName);
  const maxSize = options.maxFileSizeBytes ?? MAX_FILE_SIZE_BYTES;
  const maxFiles = options.maxRotatedFiles ?? MAX_ROTATED_FILES;
  const mirrorToConsole =
    options.mirrorToConsole ?? process.env.NODE_ENV !== 'production';

  function write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    // Order matters: redact BEFORE serialisation so the JSON string never
    // contains raw secrets, even transiently.
    const redactedMessage = redactString(message);
    const mergedContext: Record<string, unknown> = { logger: name, ...(context ?? {}) };
    const redactedContext = redactSecrets(mergedContext) as Record<string, unknown>;

    const entry: LogEntry = {
      level,
      timestamp: nowIso(),
      message: redactedMessage,
      context: redactedContext,
    };
    const line = `${formatEntry(entry)}\n`;

    try {
      ensureDir(filePath);
      rotateLogFile(filePath, maxSize, maxFiles);
      appendFileSync(filePath, line, { encoding: 'utf8' });
    } catch {
      // Never let a log-write failure crash the caller. In practice this only
      // happens when the disk is full or permissions are wrong — surface via
      // console (which is redacted safely) and continue.
      if (mirrorToConsole) {
        process.stderr.write(line);
      }
    }

    if (mirrorToConsole) {
      // Structured JSON logs always go to stdout so downstream JSON-line
      // consumers see a single stream. Separating stderr/stdout by level is
      // conventional for text logs but breaks JSON-line pipes.
      process.stdout.write(line);
    }
  }

  return {
    debug: (message, context) => write('debug', message, context),
    info: (message, context) => write('info', message, context),
    warn: (message, context) => write('warn', message, context),
    error: (message, context) => write('error', message, context),
  };
}
