// qa-spec: S1, S12 — Bootstrap runs in the deterministic order
//   1. createDirectories(resolvePaths())
//   2. openDatabase() + runMigrations()
//   3. createMainWindow()
// and never proceeds to window construction when the DB reports a newer
// schema than this build supports.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invocationOrder: string[] = [];
const dbSpies = {
  openDatabase: vi.fn(() => {
    invocationOrder.push('openDatabase');
    return { close: vi.fn() };
  }),
  runMigrations: vi.fn(() => {
    invocationOrder.push('runMigrations');
    return { schemaVersion: 1 };
  }),
};

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
    invocationOrder.push('BrowserWindow');
    this.opts = opts;
    return {
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      on: vi.fn(),
      webContents: { on: vi.fn(), send: vi.fn() },
      close: vi.fn(),
    };
  }),
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  dialog: { showErrorBox: vi.fn() },
}));

vi.mock('../../../src/shared/paths', async () => {
  const actual = (await vi.importActual('../../../src/shared/paths')) as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    resolvePaths: vi.fn(() => ({
      data: '/mock/data',
      cache: '/mock/cache',
      logs: '/mock/logs',
    })),
    createDirectories: vi.fn(() => {
      invocationOrder.push('createDirectories');
    }),
    databaseFile: vi.fn(() => '/mock/data/cairn.db'),
    teamRepoDir: vi.fn(() => '/mock/data/team-repo'),
    backupDir: vi.fn(() => '/mock/data/backups'),
  };
});

vi.mock('../../../src/main/error-boundary', () => ({
  registerErrorBoundary: vi.fn(() => {
    invocationOrder.push('registerErrorBoundary');
  }),
}));

vi.mock('../../../src/main/db/index.js', () => dbSpies);

vi.mock('../../../src/main/config/local-config', () => ({
  loadLocalConfig: vi.fn(() => ({})),
  localConfigPath: vi.fn(() => '/mock/data/local.config.json'),
}));

vi.mock('../../../src/main/config/team-config', () => ({
  loadTeamConfig: vi.fn(() => ({})),
  teamConfigPath: vi.fn(() => '/mock/data/team-repo/config.json'),
}));

beforeEach(() => {
  invocationOrder.length = 0;
  dbSpies.openDatabase.mockClear();
  dbSpies.runMigrations.mockClear();
  vi.resetModules();
});

afterEach(() => {
  invocationOrder.length = 0;
});

describe('main/index bootstrap ordering (S1 + S12)', () => {
  // qa-spec: S12
  it('createDirectories runs before openDatabase, and openDatabase before BrowserWindow', async () => {
    const mod = await import('../../../src/main/index');
    mod.bootstrap();

    // Drain any queued microtasks — bootstrap's DB step is fire-and-forget.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const createIdx = invocationOrder.indexOf('createDirectories');
    const openIdx = invocationOrder.indexOf('openDatabase');
    const windowIdx = invocationOrder.indexOf('BrowserWindow');

    expect(createIdx, 'createDirectories must run during bootstrap').toBeGreaterThanOrEqual(0);
    expect(openIdx, 'openDatabase must run during bootstrap (via the db gateway barrel)').toBeGreaterThanOrEqual(0);
    expect(windowIdx, 'BrowserWindow must be constructed during bootstrap').toBeGreaterThanOrEqual(0);
    expect(
      createIdx,
      'directories must be created BEFORE the DB is opened',
    ).toBeLessThan(openIdx);
    expect(
      openIdx,
      'DB must be opened BEFORE the main window is created',
    ).toBeLessThan(windowIdx);
  });

  // qa-spec: S12
  it('runMigrations runs on the same handle immediately after openDatabase', async () => {
    const mod = await import('../../../src/main/index');
    mod.bootstrap();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    expect(dbSpies.openDatabase).toHaveBeenCalledTimes(1);
    expect(dbSpies.runMigrations).toHaveBeenCalledTimes(1);
    const openOrder = dbSpies.openDatabase.mock.invocationCallOrder[0] ?? 0;
    const migrateOrder = dbSpies.runMigrations.mock.invocationCallOrder[0] ?? 0;
    expect(migrateOrder).toBeGreaterThan(openOrder);
  });

  // qa-spec: S8, S12 — newer-schema DB aborts before window construction.
  it('when runMigrations throws a NewerSchemaError, BrowserWindow is NEVER constructed', async () => {
    dbSpies.runMigrations.mockImplementationOnce(() => {
      const err = new Error(
        'cairn.db was created by a newer build of Cairn (schema v9999). This build only supports schema v1.',
      );
      (err as { name?: string }).name = 'NewerSchemaError';
      invocationOrder.push('runMigrations-throw');
      throw err;
    });

    const mod = await import('../../../src/main/index');
    const electron = await import('electron');
    const BrowserWindowMock = electron.BrowserWindow as unknown as ReturnType<typeof vi.fn>;
    BrowserWindowMock.mockClear();

    mod.bootstrap();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    // Newer-schema is a hard abort — dialog surfaces, window never appears.
    const dialog = electron.dialog as unknown as { showErrorBox: ReturnType<typeof vi.fn> };
    expect(
      dialog.showErrorBox,
      'newer-schema DB must surface a native error dialog to the user',
    ).toHaveBeenCalled();
    // The bootstrap function itself always constructs the window in the current
    // code path (the DB step is fire-and-forget). S8 requires that when the DB
    // step rejects, the app "does not reach the main window or interactive
    // state". The implementation must therefore suppress the window entirely
    // on newer-schema — asserted here.
    expect(
      BrowserWindowMock,
      'S8: no window is constructed when the DB reports a newer schema',
    ).not.toHaveBeenCalled();
  });
});
