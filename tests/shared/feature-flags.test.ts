// qa-spec: (implicit — agent-plan Task 6 feature-flags module)
// Covers: env override > file > default false; config file resolved via paths utility.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ORIGINAL_ENV = { ...process.env };
const tempRoots: string[] = [];

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  while (tempRoots.length > 0) {
    const d = tempRoots.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

function makeFlagsHome(cfg?: Record<string, boolean>): string {
  const dir = mkdtempSync(join(tmpdir(), 'cairn-flags-'));
  tempRoots.push(dir);
  const dataDir = join(dir, 'data');
  mkdirSync(dataDir, { recursive: true });
  if (cfg) {
    writeFileSync(join(dataDir, 'feature-flags.json'), JSON.stringify(cfg), 'utf-8');
  }
  return dataDir;
}

async function importWithMockedPaths(dataDir: string) {
  vi.doMock('../../src/shared/paths', () => ({
    resolvePaths: () => ({ data: dataDir, cache: dataDir, logs: dataDir }),
    createDirectories: () => {},
  }));
  return await import('../../src/shared/feature-flags');
}

describe('feature-flags — defaults and precedence', () => {
  // implicit
  it('when no config file exists, getFlag returns false (safe default)', async () => {
    const dataDir = makeFlagsHome();
    const { getFlag } = await importWithMockedPaths(dataDir);
    expect(getFlag('anything')).toBe(false);
  });

  // implicit
  it('when config file sets a flag true, getFlag returns true', async () => {
    const dataDir = makeFlagsHome({ myFlag: true });
    const { getFlag } = await importWithMockedPaths(dataDir);
    expect(getFlag('myFlag')).toBe(true);
  });

  // implicit
  it('env override FF_<UPPER>=true beats a config value of false', async () => {
    const dataDir = makeFlagsHome({ myFlag: false });
    process.env.FF_MY_FLAG = 'true';
    const { getFlag } = await importWithMockedPaths(dataDir);
    expect(getFlag('myFlag')).toBe(true);
  });

  // implicit
  it('env override FF_<UPPER>=false beats a config value of true', async () => {
    const dataDir = makeFlagsHome({ myFlag: true });
    process.env.FF_MY_FLAG = 'false';
    const { getFlag } = await importWithMockedPaths(dataDir);
    expect(getFlag('myFlag')).toBe(false);
  });

  // implicit
  it('loadFlags() reads the config file from resolvePaths().data (not hard-coded)', async () => {
    const dataDir = makeFlagsHome({ a: true, b: false });
    const { loadFlags } = await importWithMockedPaths(dataDir);
    const flags = loadFlags();
    expect(flags).toEqual({ a: true, b: false });
  });
});
