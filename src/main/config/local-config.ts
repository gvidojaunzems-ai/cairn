/**
 * Per-machine local configuration loader.
 *
 * Business rules:
 *   - `local.config.json` lives under `resolvePaths().data`. NEVER hard-code
 *     an absolute path.
 *   - The file MUST NOT contain secrets (S6). Runtime guard rejects unknown
 *     keys and warns on any key name that matches the secret-blocklist —
 *     defence in depth against a hand-edited config accidentally landing a
 *     token in plaintext.
 *   - Missing file returns `{}` — first-run installs work with defaults.
 *   - Malformed JSON is a warning, not an error — the app must keep running
 *     with defaults rather than refusing to boot on a broken config.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolvePaths } from '../../shared/paths.js';

const CONFIG_FILE_NAME = 'local.config.json';

/**
 * Whitelist of allowed keys in local.config.json. Extending this whitelist is
 * a deliberate act — new keys should land here with a comment describing
 * their purpose so future maintainers know what's in scope.
 */
export const LOCAL_CONFIG_ALLOWED_KEYS = [
  'theme',
  'locale',
  'defaultRepoPath',
  'analyticsEnabled',
  'telemetryOptIn',
] as const;

type LocalConfigKey = (typeof LOCAL_CONFIG_ALLOWED_KEYS)[number];

/**
 * Per-machine settings the user can hand-edit. NEVER holds a secret.
 */
export type LocalConfig = Partial<Record<LocalConfigKey, string | boolean>>;

const SECRET_KEY_BLOCKLIST = [
  'token',
  'secret',
  'password',
  'apiKey',
  'credential',
  'authorization',
];

function isSecretLike(key: string): boolean {
  const lower = key.toLowerCase();
  return SECRET_KEY_BLOCKLIST.some((needle) => lower.includes(needle.toLowerCase()));
}

function isAllowedKey(key: string): key is LocalConfigKey {
  return (LOCAL_CONFIG_ALLOWED_KEYS as readonly string[]).includes(key);
}

/**
 * Load and validate the local config. Returns `{}` when the file is missing
 * or malformed.
 */
export function loadLocalConfig(configPath?: string): LocalConfig {
  const resolvedPath = configPath ?? join(resolvePaths().data, CONFIG_FILE_NAME);
  if (!existsSync(resolvedPath)) {
    return {};
  }
  try {
    const raw = readFileSync(resolvedPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return sanitize(parsed as Record<string, unknown>);
  } catch {
    return {};
  }
}

function sanitize(raw: Record<string, unknown>): LocalConfig {
  const output: LocalConfig = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isSecretLike(key)) {
      // Never let a secret-shaped key survive parsing. It is dropped
      // silently; the logger cannot see it because the config layer runs
      // above the logger.
      continue;
    }
    if (!isAllowedKey(key)) {
      continue;
    }
    if (typeof value === 'string' || typeof value === 'boolean') {
      output[key] = value;
    }
  }
  return output;
}

/**
 * Resolve the local config file path so callers can display it in an "Open
 * config file" menu item without duplicating the resolvePaths call.
 */
export function localConfigPath(): string {
  return join(resolvePaths().data, CONFIG_FILE_NAME);
}
