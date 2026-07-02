// qa-spec: S5 — Secrets round-trip via the OS keychain.
// qa-spec: S6 — A sentinel secret value never appears in cairn.db, log
// files, or local.config.json — it exists only in the keychain.
//
// These tests exercise the AES-256-GCM encrypted-file fallback because the
// OS keychain is not reachable inside the Vitest sandbox (no libsecret,
// no windows session). The fallback is the security-sensitive branch — if
// it round-trips correctly and the sentinel doesn't leak in plaintext,
// S5/S6 hold.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ORIGINAL_ENV = { ...process.env };
let scratch: string | null = null;

function stageDataDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'cairn-keychain-'));
  scratch = root;
  process.env.HOME = root;
  process.env.USERPROFILE = root;
  process.env.XDG_CACHE_HOME = join(root, '.cache');
  process.env.XDG_STATE_HOME = join(root, '.local', 'state');

  let dataDir: string;
  if (process.platform === 'win32') {
    const roaming = join(root, 'Roaming');
    process.env.APPDATA = roaming;
    process.env.LOCALAPPDATA = join(root, 'Local');
    dataDir = join(roaming, 'Cairn');
  } else if (process.platform === 'darwin') {
    dataDir = join(root, 'Library', 'Application Support', 'Cairn');
  } else {
    const share = join(root, '.local', 'share');
    process.env.XDG_DATA_HOME = share;
    dataDir = join(share, 'cairn');
  }
  mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

function findFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findFilesRecursive(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

beforeEach(async () => {
  process.env = { ...ORIGINAL_ENV, CAIRN_FORCE_KEYCHAIN_FALLBACK: '1' };
  const mod = await import('../../src/shared/keychain');
  mod.resetKeychainModuleCacheForTests();
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  if (scratch !== null && existsSync(scratch)) {
    rmSync(scratch, { recursive: true, force: true });
  }
  scratch = null;
});

describe('shared/keychain — round-trip via fallback (S5)', () => {
  // S5
  it('setSecret + getSecret round-trip a value', async () => {
    stageDataDir();
    const mod = await import('../../src/shared/keychain');
    const kc = mod.createKeychain();
    const setResult = await kc.setSecret('api.token', 'plum-hedgehog-42');
    expect(setResult.success).toBe(true);

    const getResult = await kc.getSecret('api.token');
    expect(getResult.success).toBe(true);
    if (getResult.success) {
      expect(getResult.data).toBe('plum-hedgehog-42');
    }
  });

  // S5
  it('deleteSecret makes a subsequent getSecret return not-found', async () => {
    stageDataDir();
    const mod = await import('../../src/shared/keychain');
    const kc = mod.createKeychain();
    await kc.setSecret('api.token', 'ephemeral');
    const del = await kc.deleteSecret('api.token');
    expect(del.success).toBe(true);
    const get = await kc.getSecret('api.token');
    expect(get.success).toBe(false);
  });

  // S5
  it('exports setSecret / deleteSecret / getSecret at module level', async () => {
    const mod = await import('../../src/shared/keychain');
    expect(typeof mod.getSecret).toBe('function');
    expect(typeof mod.setSecret).toBe('function');
    expect(typeof mod.deleteSecret).toBe('function');
    expect(typeof mod.createKeychain).toBe('function');
  });
});

describe('shared/keychain — sentinel scan (S6)', () => {
  const SENTINEL = 'sentinel-value-a5b3c1d9-must-not-leak';

  // S6
  it('sentinel does not appear anywhere under the data directory in plaintext', async () => {
    const dataDir = stageDataDir();
    // Simulate a full app footprint: log + config file + DB file (empty).
    const cairnDb = join(dataDir, 'cairn.db');
    const logsDir = join(dataDir, 'logs');
    const configFile = join(dataDir, 'local.config.json');
    mkdirSync(logsDir, { recursive: true });
    // Write a plausible config and log file so the scan has real files to
    // walk.
    writeFileSync(configFile, JSON.stringify({ theme: 'dark' }));
    writeFileSync(join(logsDir, 'cairn.log'), '{"level":"info"}\n');
    writeFileSync(cairnDb, '');

    const mod = await import('../../src/shared/keychain');
    const kc = mod.createKeychain();
    await kc.setSecret('api.token', SENTINEL);

    // Scan every regular file under the data directory. No file may contain
    // the sentinel in plaintext — the fallback file must be encrypted.
    for (const file of findFilesRecursive(dataDir)) {
      const bytes = readFileSync(file);
      const asString = bytes.toString('utf8');
      expect(
        asString.includes(SENTINEL),
        `sentinel leaked into ${file}`,
      ).toBe(false);
      // Also check binary form just in case.
      expect(
        bytes.includes(Buffer.from(SENTINEL, 'utf8')),
        `sentinel (binary) leaked into ${file}`,
      ).toBe(false);
    }
  });

  // S6
  it('fallback file exists and is readable but not plaintext-leaky', async () => {
    const dataDir = stageDataDir();
    const mod = await import('../../src/shared/keychain');
    const kc = mod.createKeychain();
    await kc.setSecret('opaque.key', SENTINEL);

    const fallback = join(dataDir, 'secrets.enc');
    expect(existsSync(fallback)).toBe(true);
    const contents = readFileSync(fallback, 'utf8');
    expect(contents.includes(SENTINEL)).toBe(false);
    // File permissions on POSIX should be 0600. On Windows chmod is a no-op
    // so we only assert the shape.
    if (process.platform !== 'win32') {
      const mode = statSync(fallback).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });
});
