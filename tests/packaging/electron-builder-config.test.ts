// qa-spec: S4 — Package command produces a launchable Windows installer.
// Covers AC-4. We assert the electron-builder config declares the required
// targets, files, and output directory so an installer would be produced.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

const BUILDER_YAML = resolve(__dirname, '../../electron-builder.yml');

interface BuilderConfig {
  appId?: string;
  productName?: string;
  files?: string[];
  directories?: { output?: string; buildResources?: string };
  win?: { target?: string | string[] | Array<{ target?: string }> };
  mac?: {
    target?: string | string[] | Array<{ target?: string }>;
    hardenedRuntime?: boolean;
    entitlements?: string;
    afterSign?: string;
  };
  linux?: { target?: string | string[] | Array<{ target?: string }> };
  publish?: unknown;
}

function loadBuilder(): BuilderConfig {
  const text = readFileSync(BUILDER_YAML, 'utf-8');
  return parseYaml(text) as BuilderConfig;
}

function targetToStrings(t: unknown): string[] {
  if (t === undefined) return [];
  if (typeof t === 'string') return [t];
  if (Array.isArray(t)) {
    return t.map((entry) => (typeof entry === 'string' ? entry : String((entry as { target?: string }).target ?? '')));
  }
  return [];
}

describe('electron-builder.yml — packaging config (S4 / AC-4)', () => {
  // qa-spec: S4
  it('electron-builder.yml exists at repo root', () => {
    expect(existsSync(BUILDER_YAML)).toBe(true);
  });

  // qa-spec: S4
  it('has productName === "Cairn"', () => {
    const cfg = loadBuilder();
    expect(cfg.productName).toBe('Cairn');
  });

  // qa-spec: S4
  it('has a non-empty appId', () => {
    const cfg = loadBuilder();
    expect(cfg.appId).toBeTypeOf('string');
    expect((cfg.appId ?? '').length).toBeGreaterThan(0);
  });

  // qa-spec: S4
  it('declares a directories.output path', () => {
    const cfg = loadBuilder();
    expect(cfg.directories?.output).toBeTypeOf('string');
    expect((cfg.directories?.output ?? '').length).toBeGreaterThan(0);
  });

  // qa-spec: S4
  it('declares a files: array (must include compiled output)', () => {
    const cfg = loadBuilder();
    expect(Array.isArray(cfg.files)).toBe(true);
    expect((cfg.files ?? []).length).toBeGreaterThan(0);
  });

  // qa-spec: S4
  it('Windows target includes nsis', () => {
    const cfg = loadBuilder();
    const targets = targetToStrings(cfg.win?.target).join(',').toLowerCase();
    expect(targets).toContain('nsis');
  });

  // qa-spec: S4 — parametrised: macOS/Linux targets must be present so the same
  // config can be reused with `--mac` / `--linux`.
  it('macOS target includes dmg', () => {
    const cfg = loadBuilder();
    const targets = targetToStrings(cfg.mac?.target).join(',').toLowerCase();
    expect(targets).toContain('dmg');
  });

  it('Linux target includes AppImage', () => {
    const cfg = loadBuilder();
    const targets = targetToStrings(cfg.linux?.target).join(',').toLowerCase();
    expect(targets).toContain('appimage');
  });

  it('mac.afterSign hook is declared (placeholder for future notarisation)', () => {
    const cfg = loadBuilder();
    expect(cfg.mac?.afterSign).toBeTypeOf('string');
    expect((cfg.mac?.afterSign ?? '').length).toBeGreaterThan(0);
  });

  it('mac.entitlements points to build/entitlements.mac.plist', () => {
    const cfg = loadBuilder();
    expect(cfg.mac?.entitlements).toMatch(/entitlements\.mac\.plist$/);
  });
});
