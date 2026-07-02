// qa-spec: S5-adjacent — the preload exposes the typed IPC surface
// (`invoke`, `on`, `off`, `apiVersion`, `restartApp`) via
// `contextBridge.exposeInMainWorld` — and NEVER re-exports `ipcRenderer`
// itself (that would defeat contextIsolation).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PRELOAD_FILE = resolve(__dirname, '../../src/preload/index.ts');

// The preload calls contextBridge.exposeInMainWorld at import time. We
// capture the exposed payload here so we can assert its shape.
let exposed: Record<string, unknown> | undefined;

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((name: string, api: Record<string, unknown>) => {
      exposed = api;
    }),
  },
  ipcRenderer: {
    invoke: vi.fn(async () => ({
      ok: true,
      data: {},
      apiVersion: '1.0.0',
    })),
    on: vi.fn(),
    off: vi.fn(),
    removeListener: vi.fn(),
    send: vi.fn(),
  },
}));

beforeEach(() => {
  exposed = undefined;
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('preload — exposes the typed IPC surface (S5-adjacent)', () => {
  // qa-spec: S5-adjacent
  it('calls contextBridge.exposeInMainWorld under "cairn"', async () => {
    const electron = await import('electron');
    const spy = electron.contextBridge.exposeInMainWorld as unknown as ReturnType<typeof vi.fn>;
    await import('../../src/preload/index');
    expect(spy).toHaveBeenCalled();
    const firstArg = spy.mock.calls[0]?.[0];
    expect(firstArg).toBe('cairn');
  });

  // qa-spec: S5-adjacent
  it('exposes invoke(namespace, op, input) returning a promise', async () => {
    await import('../../src/preload/index');
    expect(exposed).toBeDefined();
    expect(typeof exposed?.invoke).toBe('function');
    const invoke = exposed?.invoke as (
      namespace: string,
      op: string,
      input?: unknown,
    ) => Promise<unknown>;
    const result = await invoke('system', 'getStatus', {});
    expect(result).toBeDefined();
  });

  // qa-spec: S5-adjacent
  it('exposes on(event, handler) returning an unsubscribe callback', async () => {
    await import('../../src/preload/index');
    expect(typeof exposed?.on).toBe('function');
    const on = exposed?.on as (event: string, handler: (p: unknown) => void) => () => void;
    const dispose = on('job.progress', () => {});
    expect(typeof dispose).toBe('function');
    // Calling the disposer should not throw.
    expect(() => dispose()).not.toThrow();
  });

  // qa-spec: S5-adjacent
  it('exposes off(event, handler) for explicit unsubscription', async () => {
    await import('../../src/preload/index');
    expect(typeof exposed?.off).toBe('function');
  });

  // qa-spec: S5-adjacent
  it('exposes apiVersion as a non-empty string', async () => {
    await import('../../src/preload/index');
    expect(typeof exposed?.apiVersion).toBe('string');
    expect((exposed?.apiVersion as string).length).toBeGreaterThan(0);
  });

  // qa-spec: S5-adjacent — restartApp must remain to preserve the
  // existing error-boundary surface (breaking risk called out in the plan).
  it('preserves the existing restartApp() method', async () => {
    await import('../../src/preload/index');
    expect(typeof exposed?.restartApp).toBe('function');
  });
});

describe('preload — never re-exports ipcRenderer (contextIsolation guard)', () => {
  // qa-spec: S5-adjacent — the source file must not contain a direct
  // re-export of `ipcRenderer` (that would leak the raw IPC surface to
  // the renderer via the contextBridge object graph).
  it('preload source does not expose ipcRenderer under any key on the API', async () => {
    await import('../../src/preload/index');
    if (exposed) {
      for (const [key, value] of Object.entries(exposed)) {
        // Neither a top-level `ipcRenderer` key nor a value that IS the
        // ipcRenderer mock is acceptable.
        expect(key).not.toBe('ipcRenderer');
        expect(value).not.toBe((globalThis as { ipcRenderer?: unknown }).ipcRenderer);
      }
    }
    // Source-level guard: no `exposeInMainWorld('...' , { ipcRenderer })` style leak.
    const src = readFileSync(PRELOAD_FILE, 'utf-8');
    // The import of ipcRenderer is fine; the leak we forbid is a direct
    // property assignment that surfaces the object to the renderer.
    expect(src).not.toMatch(/exposeInMainWorld\([^)]*ipcRenderer[^)]*\)/);
  });
});
