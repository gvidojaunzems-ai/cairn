/**
 * Config barrel — re-exports the local + team config loaders.
 *
 * Business rules:
 *   - Config surfaces are the only sanctioned reader of on-disk JSON
 *     configuration files. Feature-flag config lives under
 *     `src/shared/feature-flags.ts` — it is loaded by callers that need the
 *     env-var precedence there.
 *   - Consumers import from this barrel so the flat `src/main/config/**` tree
 *     can be re-organised later without a ripple across call sites.
 */
export { loadLocalConfig, localConfigPath, LOCAL_CONFIG_ALLOWED_KEYS } from './local-config.js';
export type { LocalConfig } from './local-config.js';
export { loadTeamConfig, teamConfigPath, TEAM_CONFIG_ALLOWED_KEYS } from './team-config.js';
export type { TeamConfig } from './team-config.js';
