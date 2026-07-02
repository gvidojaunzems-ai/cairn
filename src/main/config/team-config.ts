/**
 * Team-repo configuration loader.
 *
 * Business rules:
 *   - Team-repo config lives under `resolvePaths().data/team-repo/config.json`
 *     — a per-team-repo file that a squad can hand-edit to tune the shared
 *     surface of the app (e.g. glossary, project name aliases).
 *   - The team config is orthogonal to feature flags (env > file > default)
 *     — it holds team-level defaults, not runtime toggles.
 *   - NEVER holds a secret. Runtime guard rejects secret-shaped keys.
 *   - Missing file returns `{}`. Malformed JSON returns `{}` without throwing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolvePaths, teamRepoDir } from '../../shared/paths.js';

const CONFIG_FILE_NAME = 'config.json';

export const TEAM_CONFIG_ALLOWED_KEYS = [
  'teamName',
  'defaultProjectSlug',
  'glossary',
  'timezone',
] as const;

type TeamConfigKey = (typeof TEAM_CONFIG_ALLOWED_KEYS)[number];

/**
 * Shared team-repo settings. NEVER holds a secret.
 */
export interface TeamConfig {
  teamName?: string;
  defaultProjectSlug?: string;
  glossary?: Readonly<Record<string, string>>;
  timezone?: string;
}

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
  return SECRET_KEY_BLOCKLIST.some((needle) => lower.includes(needle));
}

function isAllowedKey(key: string): key is TeamConfigKey {
  return (TEAM_CONFIG_ALLOWED_KEYS as readonly string[]).includes(key);
}

/**
 * Load the team config from `resolvePaths().data/team-repo/config.json` (or
 * an explicit override for tests).
 */
export function loadTeamConfig(configPath?: string): TeamConfig {
  const resolvedPath =
    configPath ?? join(teamRepoDir(resolvePaths()), CONFIG_FILE_NAME);
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

function sanitize(raw: Record<string, unknown>): TeamConfig {
  const output: TeamConfig = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isSecretLike(key)) {
      continue;
    }
    if (!isAllowedKey(key)) {
      continue;
    }
    if (key === 'glossary') {
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        const asStringMap = coerceStringMap(value as Record<string, unknown>);
        if (asStringMap !== undefined) {
          output.glossary = asStringMap;
        }
      }
      continue;
    }
    if (typeof value === 'string') {
      (output as Record<string, unknown>)[key] = value;
    }
  }
  return output;
}

function coerceStringMap(
  raw: Record<string, unknown>,
): Readonly<Record<string, string>> | undefined {
  const output: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== 'string') {
      return undefined;
    }
    output[k] = v;
  }
  return output;
}

/**
 * Absolute path to the team config file — exposed for menus / diagnostics.
 */
export function teamConfigPath(): string {
  return join(teamRepoDir(resolvePaths()), CONFIG_FILE_NAME);
}
