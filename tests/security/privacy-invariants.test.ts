/**
 * Privacy invariant tests (Spec 20).
 */
import { describe, expect, it } from 'vitest';

import {
  validateSignalPrivacy,
  type WipSignalArtifact,
} from '../../src/main/engines/team-repo-engine';

function baseSignal(): WipSignalArtifact {
  return {
    schema_version: 1,
    person: 'gvido',
    ts: new Date().toISOString(),
    branch: 'feature/test',
    ahead_local: 2,
    ahead_pushed: 0,
    files_touched: ['src/main/index.ts'],
    last_active: new Date().toISOString(),
    unpushed_days: 1,
    summary: 'Working on IPC catalog expansion',
  };
}

describe('privacy invariants — WIP signals (Spec 04/20)', () => {
  it('accepts natural-language-only summaries', () => {
    expect(() => validateSignalPrivacy(baseSignal())).not.toThrow();
  });

  it('rejects diff hunks in summary', () => {
    const signal = { ...baseSignal(), summary: '+++ b/file.ts\n@@ -1 +1 @@\n-old\n+new' };
    expect(() => validateSignalPrivacy(signal)).toThrow(/code or diff/i);
  });

  it('rejects file contents in summary', () => {
    const signal = {
      ...baseSignal(),
      summary: 'function main() { return 42; }',
    };
    expect(() => validateSignalPrivacy(signal)).toThrow(/code or diff/i);
  });
});

describe('privacy invariants — secrets (Spec 20)', () => {
  it('local.config allowed keys exclude secret-shaped names', async () => {
    const { LOCAL_CONFIG_ALLOWED_KEYS } = await import('../../src/main/config/local-config.js');
    for (const key of LOCAL_CONFIG_ALLOWED_KEYS) {
      expect(key.toLowerCase()).not.toMatch(/token|secret|password|apikey|credential/);
    }
  });
});
