// qa-spec: S5 — First-run creates per-OS data/logs directories.
// Covers AC-5. Table-driven per-OS with process.platform AND os.homedir() mocked
// so paths resolve deterministically regardless of the host OS running the tests.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ORIGINAL_PLATFORM = process.platform;
const ORIGINAL_ENV = { ...process.env };

let mockedHome: string | null = null;

// Intercept `node:os` — replace `homedir()` with a value we can vary per test.
// Everything else on `node:os` (tmpdir, EOL, etc.) is passed through untouched.
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: (): string => (mockedHome !== null ? mockedHome : actual.homedir()),
  };
});

function setPlatform(p: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}

function restorePlatform(): void {
  Object.defineProperty(process, 'platform', { value: ORIGINAL_PLATFORM, configurable: true });
}

function mockHome(home: string): void {
  mockedHome = home;
}

const tempRoots: string[] = [];
function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cairn-paths-'));
  tempRoots.push(dir);
  return dir;
}

beforeEach(() => {
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  restorePlatform();
  process.env = { ...ORIGINAL_ENV };
  mockedHome = null;
  while (tempRoots.length > 0) {
    const d = tempRoots.pop();
    if (d && existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
});

describe('shared/paths.resolvePaths — per-OS resolution', () => {
  // qa-spec: S5
  it('Windows: resolves data under %APPDATA%/Cairn and logs under %APPDATA%/Cairn/logs', async () => {
    setPlatform('win32');
    mockHome('C:\\Users\\test');
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
    process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';
    const { resolvePaths } = await import('../../src/shared/paths');
    const p = resolvePaths();
    expect(p.data).toContain('Cairn');
    expect(p.data.toLowerCase()).toContain('appdata');
    expect(p.logs).toContain('Cairn');
    expect(p.logs.toLowerCase()).toMatch(/logs?/);
    // Reasonable sanity: not a stub sentinel
    expect(p.data).not.toBe('STUB_DATA');
  });

  // qa-spec: S5
  it('macOS: resolves data under ~/Library/Application Support/Cairn', async () => {
    setPlatform('darwin');
    mockHome('/Users/test');
    process.env.HOME = '/Users/test';
    const { resolvePaths } = await import('../../src/shared/paths');
    const p = resolvePaths();
    // Path may use forward or backslashes; normalise for the assertion.
    const norm = p.data.replace(/\\/g, '/');
    expect(norm).toContain('/Users/test');
    expect(norm).toContain('Library');
    expect(norm).toContain('Application Support');
    expect(norm).toContain('Cairn');
    expect(p.logs.replace(/\\/g, '/')).toContain('Cairn');
  });

  // qa-spec: S5
  it('Linux: honours $XDG_DATA_HOME when set', async () => {
    setPlatform('linux');
    mockHome('/home/test');
    process.env.HOME = '/home/test';
    process.env.XDG_DATA_HOME = '/home/test/.local/share';
    const { resolvePaths } = await import('../../src/shared/paths');
    const p = resolvePaths();
    const norm = p.data.replace(/\\/g, '/');
    expect(norm).toContain('/home/test/.local/share');
    expect(norm.toLowerCase()).toContain('cairn');
  });

  // qa-spec: S5
  it('Linux: falls back to ~/.local/share/cairn when XDG_DATA_HOME is unset', async () => {
    setPlatform('linux');
    mockHome('/home/test');
    process.env.HOME = '/home/test';
    delete process.env.XDG_DATA_HOME;
    const { resolvePaths } = await import('../../src/shared/paths');
    const p = resolvePaths();
    const norm = p.data.replace(/\\/g, '/');
    expect(norm).toContain('/home/test/.local/share');
    expect(norm.toLowerCase()).toContain('cairn');
  });
});

describe('shared/paths.createDirectories — first-run side effects', () => {
  // qa-spec: S5
  it('creates data, cache, and logs when they do not exist', async () => {
    const { createDirectories } = await import('../../src/shared/paths');
    const root = scratchDir();
    const paths = {
      data: join(root, 'data'),
      cache: join(root, 'cache'),
      logs: join(root, 'logs'),
    };
    createDirectories(paths);
    expect(existsSync(paths.data)).toBe(true);
    expect(existsSync(paths.cache)).toBe(true);
    expect(existsSync(paths.logs)).toBe(true);
  });

  // qa-spec: S5
  it('is idempotent — calling twice does not throw when dirs exist', async () => {
    const { createDirectories } = await import('../../src/shared/paths');
    const root = scratchDir();
    const paths = {
      data: join(root, 'data'),
      cache: join(root, 'cache'),
      logs: join(root, 'logs'),
    };
    mkdirSync(paths.data, { recursive: true });
    mkdirSync(paths.cache, { recursive: true });
    mkdirSync(paths.logs, { recursive: true });
    expect(() => createDirectories(paths)).not.toThrow();
    expect(() => createDirectories(paths)).not.toThrow();
  });
});
