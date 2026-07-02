// qa-spec: S1 — system.getStatus round-trips UI→core with ok:true +
// apiVersion in under 100 ms.
//
// We cannot spawn a real Electron process from Vitest; per qa-spec.json
// this scenario is asserted at the router-dispatch boundary, which is the
// same code path the preload hits after IPC deserialisation. The 100 ms
// budget covers everything from `dispatch(id, input)` entering the
// router to a fully-formed `CoreServiceResult<T>` leaving it.
import { describe, expect, it, vi } from 'vitest';
import { performance } from 'node:perf_hooks';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  webContents: { getAllWebContents: vi.fn(() => []) },
  app: { getVersion: vi.fn(() => '0.0.0') },
  BrowserWindow: vi.fn(),
}));

import { buildHandlerTable } from '../../src/main/ipc/register-handlers';
import { createIpcRouter } from '../../src/main/ipc/router';
import { API_VERSION } from '../../src/shared/ipc/api-version';

describe('system.getStatus — S1 round-trip perf', () => {
  // qa-spec: S1 — shape assertions
  it('returns ok:true with apiVersion === API_VERSION', async () => {
    const router = createIpcRouter({ handlers: buildHandlerTable() });
    const result = await router.dispatch('system.getStatus', {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.apiVersion).toBe(API_VERSION);
      expect(result.apiVersion.length).toBeGreaterThan(0);
      // data.ready is the marker documented in the plan (SystemStatus).
      expect((result.data as { ready?: boolean }).ready).toBe(true);
    }
  });

  // qa-spec: S1 — single-shot latency budget
  it('completes in under 100 ms (single dispatch)', async () => {
    const router = createIpcRouter({ handlers: buildHandlerTable() });
    // Warm the JIT and prepared statements — cold start is not what S1
    // measures, per the plan (< 4 s cold start, < 100 ms IPC round-trip).
    await router.dispatch('system.getStatus', {});

    const start = performance.now();
    const result = await router.dispatch('system.getStatus', {});
    const elapsed = performance.now() - start;

    expect(result.ok).toBe(true);
    expect(
      elapsed,
      `system.getStatus round-trip took ${elapsed.toFixed(2)} ms (budget: 100 ms)`,
    ).toBeLessThan(100);
  });

  // qa-spec: S1 — median stays under budget across repeated dispatches
  it('median of 50 dispatches stays under 100 ms', async () => {
    const router = createIpcRouter({ handlers: buildHandlerTable() });
    // Warm-up
    for (let i = 0; i < 5; i += 1) {
      await router.dispatch('system.getStatus', {});
    }

    const timings: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      const s = performance.now();
      const r = await router.dispatch('system.getStatus', {});
      timings.push(performance.now() - s);
      expect(r.ok).toBe(true);
    }
    timings.sort((a, b) => a - b);
    const median = timings[Math.floor(timings.length / 2)] ?? Number.POSITIVE_INFINITY;
    expect(
      median,
      `median dispatch took ${median.toFixed(2)} ms (budget: 100 ms)`,
    ).toBeLessThan(100);
  });
});
