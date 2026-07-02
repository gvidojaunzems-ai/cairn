import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Electron-vite configuration.
 *
 * Business rules:
 *   - Three isolated build targets: main (Node), preload (Node+Electron), renderer (Chromium).
 *   - Native modules must be treated as externals for main/preload so electron-rebuild's
 *     rebuild artifacts are used at runtime rather than being bundled by Rollup.
 *   - Output directory is `out/` (matches electron-builder's `files:` glob in
 *     electron-builder.yml — a mismatch produces silently-empty installers).
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts'),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },
});
