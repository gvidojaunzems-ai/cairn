import { describe, expect, it } from 'vitest';

import { testConnector } from '../../src/main/connectors/test-connector.js';

describe('testConnector', () => {
  it('returns unknown for unsupported connector', async () => {
    const result = await testConnector('unknown-xyz');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Unknown connector');
  });

  it('probes git when available', async () => {
    const result = await testConnector('git');
    expect(typeof result.ok).toBe('boolean');
    expect(result.message.length).toBeGreaterThan(0);
  });
});
