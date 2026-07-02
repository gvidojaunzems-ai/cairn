// qa-spec: S2 — All quality-gate scripts (lint, format, typecheck, test) exist in package.json.
// Covers AC-2 (scripts exist and reference expected binaries).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface PackageJson {
  scripts?: Record<string, string>;
  engines?: Record<string, string>;
  packageManager?: string;
}

function loadPackageJson(): PackageJson {
  const raw = readFileSync(resolve(__dirname, '../../package.json'), 'utf-8');
  return JSON.parse(raw) as PackageJson;
}

const REQUIRED_SCRIPTS = [
  'dev',
  'build',
  'package',
  'test',
  'lint',
  'format',
  'typecheck',
  'seed',
];

describe('package.json — required scripts (S2 / AC-2)', () => {
  const pkg = loadPackageJson();

  for (const name of REQUIRED_SCRIPTS) {
    // qa-spec: S2
    it(`declares a '${name}' script`, () => {
      expect(pkg.scripts, `package.json is missing a scripts block`).toBeDefined();
      expect(
        pkg.scripts?.[name],
        `expected package.json.scripts.${name} to be a non-empty string`,
      ).toBeTypeOf('string');
      expect(pkg.scripts?.[name]?.length ?? 0).toBeGreaterThan(0);
    });
  }

  // qa-spec: S2
  it("'dev' script invokes electron-vite (not a placeholder)", () => {
    const dev = pkg.scripts?.dev ?? '';
    expect(dev).toMatch(/electron-vite/);
    expect(dev).not.toMatch(/TODO/i);
    expect(dev).not.toMatch(/^echo /);
  });

  // qa-spec: S2
  it("'build' script invokes electron-vite build", () => {
    const build = pkg.scripts?.build ?? '';
    expect(build).toMatch(/electron-vite/);
    expect(build).toMatch(/build/);
    expect(build).not.toMatch(/^echo /);
  });

  // qa-spec: S2
  it("'package' script invokes electron-builder", () => {
    const pkgScript = pkg.scripts?.package ?? '';
    expect(pkgScript).toMatch(/electron-builder/);
    expect(pkgScript).not.toMatch(/^echo /);
  });

  // qa-spec: S2
  it("'test' script runs vitest", () => {
    expect(pkg.scripts?.test).toMatch(/vitest/);
  });

  // qa-spec: S2
  it("'lint' script runs eslint on src", () => {
    expect(pkg.scripts?.lint).toMatch(/eslint/);
    expect(pkg.scripts?.lint).toMatch(/src/);
  });

  // qa-spec: S2
  it("'format' script runs prettier", () => {
    expect(pkg.scripts?.format).toMatch(/prettier/);
  });

  // qa-spec: S2
  it("'typecheck' script runs tsc with --noEmit", () => {
    const tc = pkg.scripts?.typecheck ?? '';
    expect(tc).toMatch(/tsc/);
    expect(tc).toMatch(/--noEmit/);
  });

  // qa-spec: S2
  it("'seed' script runs scripts/seed.ts via tsx or ts-node", () => {
    const seed = pkg.scripts?.seed ?? '';
    expect(seed).toMatch(/(tsx|ts-node)/);
    expect(seed).toMatch(/scripts\/seed\.ts/);
  });

  // qa-spec: S2
  it('declares Node >= 20 in engines', () => {
    const nodeEngine = pkg.engines?.node ?? '';
    expect(nodeEngine).toMatch(/(>=?\s*20|\^20|~20)/);
  });

  // qa-spec: S2
  it('declares pnpm >= 9 (as engine or packageManager)', () => {
    const pnpmEngine = pkg.engines?.pnpm ?? '';
    const pm = pkg.packageManager ?? '';
    const anySignal = pnpmEngine.match(/(>=?\s*9|\^9|~9)/) !== null
      || pm.match(/^pnpm@9/) !== null;
    expect(anySignal, `expected engines.pnpm >=9 or packageManager pnpm@9.x, got engines.pnpm=${pnpmEngine} packageManager=${pm}`).toBe(true);
  });
});
