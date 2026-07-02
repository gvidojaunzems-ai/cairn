// qa-spec: deployment guard — after `pnpm build`, zod is externalized (not
// bundled into main) and resolvable from the packaged output. This mirrors
// the existing `externalizeDepsPlugin` config in `electron.vite.config.ts`
// and prevents a silent regression where zod gets bundled into every
// main-process build (bloating startup + duplicating runtime).
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const MAIN_BUILD_DIR = resolve(__dirname, '../../out/main');
const RENDERER_BUILD_DIR = resolve(__dirname, '../../out/renderer');

function walk(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walk(full));
    else if (['.js', '.mjs', '.cjs'].includes(extname(name))) out.push(full);
  }
  return out;
}

const HAVE_BUILD =
  existsSync(MAIN_BUILD_DIR) &&
  walk(MAIN_BUILD_DIR).length > 0;

describe('externalized deps — main build (deployment guard)', () => {
  // qa-spec: deployment guard
  // Only assertable when a build artifact exists. Users running pnpm test
  // without a prior build see this as a skipped assertion — a clear signal
  // to run `pnpm build` before shipping.
  it('main bundle references zod as an external module (require/import), not a bundled copy', () => {
    if (!HAVE_BUILD) {
      // Fail loud so the CI job that runs after build catches missing artifacts.
      expect(
        HAVE_BUILD,
        'out/main is empty — run `pnpm build` before this test can execute',
      ).toBe(true);
      return;
    }
    const files = walk(MAIN_BUILD_DIR);
    let sawExternalRef = false;
    for (const file of files) {
      const src = readFileSync(file, 'utf-8');
      if (/require\(['"]zod['"]\)/.test(src) || /from\s+['"]zod['"]/.test(src)) {
        sawExternalRef = true;
      }
    }
    expect(
      sawExternalRef,
      `expected at least one file under out/main to reference 'zod' as an external import`,
    ).toBe(true);
  });

  // qa-spec: deployment guard — renderer bundle MUST NOT include zod at all.
  it('renderer bundle does NOT reference zod (renderer isolation)', () => {
    if (!existsSync(RENDERER_BUILD_DIR)) {
      // Not built yet — the renderer arch-lint test at src level covers
      // the source path. This deployment guard fails loud on missing artifact.
      expect(
        false,
        'out/renderer is empty — run `pnpm build` before this test can execute',
      ).toBe(true);
      return;
    }
    const files = walk(RENDERER_BUILD_DIR);
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf-8');
      if (/require\(['"]zod['"]\)/.test(src) || /from\s+['"]zod['"]/.test(src)) {
        offenders.push(file);
      }
    }
    expect(offenders, `renderer bundle unexpectedly imports zod: ${offenders.join(', ')}`).toEqual([]);
  });
});
