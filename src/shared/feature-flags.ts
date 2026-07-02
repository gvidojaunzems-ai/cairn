/**
 * Typed feature-flags module with env > file > default precedence.
 *
 * Business rules:
 *   - Precedence is `env override > file value > default(false)`.
 *   - Env override convention: `FF_<UPPER_SNAKE_CASE_FLAG_NAME>`. Recognised
 *     truthy values: 'true', '1'. Recognised falsy values: 'false', '0'.
 *     Anything else falls through to the file/default.
 *   - Config file location: `{resolvePaths().data}/feature-flags.json`. Never
 *     hard-coded — resolved through the paths utility so the same code works
 *     in dev, packaged Windows, macOS, and Linux installs.
 *   - Missing file is not an error — treated as an empty config so first-run
 *     installs work with defaults.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolvePaths } from './paths.js';
import type { FeatureFlagConfig } from './feature-flags.schema.js';

const CONFIG_FILE_NAME = 'feature-flags.json';

function envKeyFor(flagName: string): string {
  // camelCase -> UPPER_SNAKE. Handles `myFlag` -> `MY_FLAG` and preserves
  // pre-existing snake_case (`my_flag` -> `MY_FLAG`).
  const snake = flagName
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toUpperCase();
  return `FF_${snake}`;
}

function parseEnvBoolean(raw: string | undefined): boolean | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const normalised = raw.trim().toLowerCase();
  if (normalised === 'true' || normalised === '1') {
    return true;
  }
  if (normalised === 'false' || normalised === '0') {
    return false;
  }
  return undefined;
}

/**
 * Load the on-disk feature-flags config. Missing file returns `{}`.
 * A malformed file returns `{}` and logs to stderr (never throws — a bad
 * config must never crash the app; defaults keep it safe).
 */
export function loadFlags(configPath?: string): FeatureFlagConfig {
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
    const output: FeatureFlagConfig = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'boolean') {
        output[key] = value;
      }
    }
    return output;
  } catch {
    // Malformed JSON — safe default. Business rule: never crash on a bad
    // flags file; keep the app running with defaults.
    return {};
  }
}

/**
 * Get the effective value of a flag using env > file > default(false).
 * `fileFlags` is injectable so callers can cache `loadFlags()` if they read
 * many flags in a hot path.
 */
export function getFlag(name: string, fileFlags?: FeatureFlagConfig): boolean {
  const envValue = parseEnvBoolean(process.env[envKeyFor(name)]);
  if (envValue !== undefined) {
    return envValue;
  }
  const flags = fileFlags ?? loadFlags();
  return flags[name] ?? false;
}
