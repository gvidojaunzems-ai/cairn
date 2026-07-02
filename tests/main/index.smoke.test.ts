// qa-spec: S1, S12 — Dev command opens a blank Cairn window titled 'Cairn'.
// Covers AC-1 and S12 no-ERROR-on-happy-path invariant. We cannot spawn
// Electron in unit tests, so we assert the code path: main entry loads,
// exposes WINDOW_TITLE === 'Cairn', calls registerErrorBoundary and
// createDirectories at startup.
import { describe, expect, it, vi } from 'vitest';

// Mock the electron module so importing main/index doesn't fail
vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
    quit: vi.fn(),
    relaunch: vi.fn(),
    exit: vi.fn(),
    getAppPath: vi.fn(() => process.cwd()),
    isPackaged: false,
  },
  BrowserWindow: vi.fn().mockImplementation(function (this: { opts: unknown }, opts: unknown) {
    this.opts = opts;
    return {
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      on: vi.fn(),
      webContents: { on: vi.fn(), send: vi.fn() },
      close: vi.fn(),
    };
  }),
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn(),
  },
  dialog: { showErrorBox: vi.fn() },
}));

// Mock shared modules so we can spy on the wiring
vi.mock('../../src/shared/paths', async () => {
  const actual = (await vi.importActual('../../src/shared/paths')) as Record<string, unknown>;
  return {
    ...actual,
    resolvePaths: vi.fn(() => ({ data: '/mock/data', cache: '/mock/cache', logs: '/mock/logs' })),
    createDirectories: vi.fn(),
    databaseFile: vi.fn(() => '/mock/data/cairn.db'),
    teamRepoDir: vi.fn(() => '/mock/data/team-repo'),
    backupDir: vi.fn(() => '/mock/data/backups'),
  };
});

vi.mock('../../src/main/error-boundary', () => ({
  registerErrorBoundary: vi.fn(),
}));

vi.mock('../../src/main/config/local-config', () => ({
  loadLocalConfig: vi.fn(() => ({})),
  localConfigPath: vi.fn(() => '/mock/data/local.config.json'),
}));

vi.mock('../../src/main/config/team-config', () => ({
  loadTeamConfig: vi.fn(() => ({})),
  teamConfigPath: vi.fn(() => '/mock/data/team-repo/config.json'),
}));

describe('main/index — S1/S12 startup wiring', () => {
  // qa-spec: S1
  it('module loads without throwing', async () => {
    await expect(import('../../src/main/index')).resolves.toBeDefined();
  });

  // qa-spec: S1
  it("exports WINDOW_TITLE === 'Cairn'", async () => {
    const mod = await import('../../src/main/index');
    expect(mod.WINDOW_TITLE).toBe('Cairn');
  });

  // qa-spec: S1
  it('bootstrap() calls registerErrorBoundary before createDirectories', async () => {
    const paths = await import('../../src/shared/paths');
    const eb = await import('../../src/main/error-boundary');
    const mod = await import('../../src/main/index');

    const registerSpy = eb.registerErrorBoundary as unknown as ReturnType<typeof vi.fn>;
    const createDirsSpy = paths.createDirectories as unknown as ReturnType<typeof vi.fn>;
    registerSpy.mockClear();
    createDirsSpy.mockClear();

    await mod.bootstrap();

    expect(registerSpy).toHaveBeenCalled();
    expect(createDirsSpy).toHaveBeenCalled();

    // Ordering: error boundary must be first
    const registerOrder = registerSpy.mock.invocationCallOrder[0];
    const createDirsOrder = createDirsSpy.mock.invocationCallOrder[0];
    expect(registerOrder).toBeLessThan(createDirsOrder);
  });

  // qa-spec: S1
  it('bootstrap() creates a BrowserWindow with title "Cairn", contextIsolation:true, sandbox:true', async () => {
    const electron = await import('electron');
    const BrowserWindowMock = electron.BrowserWindow as unknown as ReturnType<typeof vi.fn>;
    BrowserWindowMock.mockClear();

    const mod = await import('../../src/main/index');
    await mod.bootstrap();

    expect(BrowserWindowMock).toHaveBeenCalled();
    const firstCallArg = BrowserWindowMock.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(firstCallArg?.title).toBe('Cairn');
    // webPreferences must have contextIsolation:true and sandbox:true
    const wp = firstCallArg?.webPreferences as Record<string, unknown> | undefined;
    expect(wp?.contextIsolation).toBe(true);
    expect(wp?.sandbox).toBe(true);
  });
});
