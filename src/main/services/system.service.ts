/**
 * `system.*` service — status, flags, paths, diagnostics, and external URL opener.
 */
import { shell } from 'electron';

import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import type { SystemStatus } from '../../shared/ipc/operations.js';
import { getFlag, loadFlags } from '../../shared/feature-flags.js';
import { resolvePaths, teamRepoDir } from '../../shared/paths.js';
import { errResult, makeError, okResult } from '../ipc/errors.js';
import { exportDiagnosticsBundle } from '../runtime/diagnostics-export.js';
import { probeRuntimeDeps } from '../runtime/deps-probe.js';

export interface SystemService {
  getStatus(): Promise<CoreServiceResult<SystemStatus>>;
  getFlags(): CoreServiceResult<{ flags: Record<string, boolean> }>;
  getPaths(): CoreServiceResult<{ data: string; teamRepo: string; logs: string }>;
  openExternal(input: { url: string }): CoreServiceResult<{ opened: boolean }>;
  exportDiagnostics(): Promise<CoreServiceResult<{ path: string; exportedAt: string }>>;
}

export const systemService: SystemService = {
  getStatus: async (): Promise<CoreServiceResult<SystemStatus>> => {
    const runtime = await probeRuntimeDeps();
    const ready = runtime.git.available;
    return okResult({ ready, runtime });
  },

  getFlags: () => {
    const fileFlags = loadFlags();
    const flags: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(fileFlags)) {
      flags[key] = getFlag(key, fileFlags) ?? value;
    }
    return okResult({ flags });
  },

  getPaths: () => {
    const paths = resolvePaths();
    return okResult({
      data: paths.data,
      teamRepo: teamRepoDir(paths),
      logs: paths.logs,
    });
  },

  openExternal: (input) => {
    try {
      void shell.openExternal(input.url);
      return okResult({ opened: true });
    } catch (err) {
      return errResult(
        makeError('internal', err instanceof Error ? err.message : 'Failed to open URL'),
      );
    }
  },

  exportDiagnostics: async () => {
    try {
      const result = await exportDiagnosticsBundle();
      return okResult(result);
    } catch (err) {
      return errResult(
        makeError('internal', err instanceof Error ? err.message : 'Diagnostics export failed'),
      );
    }
  },
};
