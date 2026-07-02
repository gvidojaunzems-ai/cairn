import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { exportDiagnosticsBundle } from '../../src/main/runtime/diagnostics-export.js';
import { resolvePaths } from '../../src/shared/paths.js';

describe('exportDiagnosticsBundle', () => {
  let exportedPath: string | null = null;

  afterEach(() => {
    if (exportedPath !== null && existsSync(exportedPath)) {
      rmSync(exportedPath, { force: true });
    }
  });

  it('writes a redacted JSON bundle under app data', async () => {
    const result = await exportDiagnosticsBundle();
    exportedPath = result.path;
    expect(existsSync(result.path)).toBe(true);
    const raw = readFileSync(result.path, 'utf8');
    expect(raw).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/);
    const parsed = JSON.parse(raw) as { runtime: { git: { available: boolean } } };
    expect(typeof parsed.runtime.git.available).toBe('boolean');
    expect(result.path.startsWith(join(resolvePaths().data, 'diagnostics'))).toBe(true);
  });
});
