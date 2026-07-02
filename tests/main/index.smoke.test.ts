// qa-spec: S1 — Dev command opens a blank Cairn window titled 'Cairn'.
// Covers AC-1. We cannot spawn Electron in unit tests, so we assert the code
// path: main entry loads, exposes WINDOW_TITLE === 'Cairn', calls
// registerErrorBoundary and createDirectories at startup.
import { describe, expect, it, vi } from 'vitest';

// Mock the electron module so importing main/index doesn't fail
vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
    quit: vi.fn(),
    getAppPath: vi.fn(() => process.cwd()),
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
  };
});

vi.mock('../../src/main/error-boundary', () => ({
  registerErrorBoundary: vi.fn(),
}));

describe('main/index — S1 startup wiring', () => {
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

    mod.bootstrap();

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

    // Reload the module so bootstrap picks up the fresh mocks
    vi.resetModules();
    const mod = await import('../../src/main/index');
    mod.bootstrap();

    // Recheck the electron mock — the reset above may have wiped it, so re-import
    const electron2 = await import('electron');
    const BrowserWindowMock2 = electron2.BrowserWindow as unknown as ReturnType<typeof vi.fn>;

    expect(BrowserWindowMock2).toHaveBeenCalled();
    const firstCallArg = BrowserWindowMock2.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(firstCallArg?.title).toBe('Cairn');
    // webPreferences must have contextIsolation:true and sandbox:true
    const wp = firstCallArg?.webPreferences as Record<string, unknown> | undefined;
    expect(wp?.contextIsolation).toBe(true);
    expect(wp?.sandbox).toBe(true);
  });
});
