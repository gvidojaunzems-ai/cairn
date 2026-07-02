import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Vitest configuration.
 *
 * Business rules:
 *   - Renderer tests run under `jsdom` because they exercise React hooks that
 *     rely on `window.matchMedia`. Everything else runs under Node so the
 *     tests exercise real file-system + child-process code paths.
 *   - Path aliases mirror tsconfig `paths` so tests can import via `@shared/*`
 *     and `@contracts/*` and stay aligned with production imports.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environmentMatchGlobs: [['tests/renderer/**', 'jsdom']],
    // Native-modules smoke test is opt-in — it requires the toolchain to be
    // present and better-sqlite3 to be rebuilt against the current ABI. CI
    // handles this in a separate job; local `pnpm test` skips it unless
    // explicitly opted-in via `CAIRN_RUN_NATIVE_SMOKE=1`.
    exclude: [
      'node_modules/**',
      'out/**',
      'dist/**',
      ...(process.env.CAIRN_RUN_NATIVE_SMOKE === '1'
        ? []
        : ['tests/main/native-modules.smoke.test.ts']),
    ],
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@contracts': resolve(__dirname, 'src/contracts'),
    },
  },
});
