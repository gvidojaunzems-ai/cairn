import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Standalone Vite config for the renderer.
 *
 * `electron-vite` is the primary orchestrator (see electron.vite.config.ts),
 * but a plain `vite.config.ts` keeps the door open for standalone renderer
 * previews (e.g. Storybook, chromatic snapshots) without pulling in Electron.
 */
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'out/renderer'),
    emptyOutDir: true,
  },
});
