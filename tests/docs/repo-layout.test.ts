// qa-spec: S9, S10 — Stack ADR and repo-layout documentation.
// Covers AC-9 and AC-10.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ADR = resolve(__dirname, '../../docs/adr/0001-stack.md');
const REPO_LAYOUT = resolve(__dirname, '../../docs/architecture/repo-layout.md');

function load(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('docs/adr/0001-stack.md (S9 / AC-9)', () => {
  // qa-spec: S9
  it('exists at docs/adr/0001-stack.md', () => {
    expect(existsSync(ADR)).toBe(true);
  });

  // qa-spec: S9
  it('names the locked tech-stack components', () => {
    const src = load(ADR);
    for (const tech of ['Electron', 'TypeScript', 'Vite', 'Vitest', 'ESLint', 'Prettier', 'electron-builder', 'better-sqlite3', 'sqlite-vec']) {
      expect(src, `ADR must name '${tech}'`).toMatch(new RegExp(tech.replace('.', '\\.'), 'i'));
    }
  });

  // qa-spec: S9
  it('contains a rationale or decision section', () => {
    const src = load(ADR).toLowerCase();
    expect(src).toMatch(/(rationale|decision|why|context)/);
  });

  // qa-spec: S9
  it('lists at least one rejected alternative with a reason', () => {
    const src = load(ADR).toLowerCase();
    expect(src).toMatch(/(reject|rejected|alternative|considered|why not)/);
    // At least one candidate alternative name must appear
    expect(src.match(/(tauri|electron forge|lancedb|sqlite-vss|usearch|npm|yarn)/)).not.toBeNull();
  });

  // qa-spec: S9
  it('mentions the intended keychain adapter', () => {
    const src = load(ADR).toLowerCase();
    expect(src).toMatch(/(keychain|keyring|@napi-rs\/keyring|keytar)/);
  });
});

describe('docs/architecture/repo-layout.md (S10 / AC-10)', () => {
  // qa-spec: S10
  it('exists at docs/architecture/repo-layout.md', () => {
    expect(existsSync(REPO_LAYOUT)).toBe(true);
  });

  // Expected top-level sections (per agent-plan Task 2)
  const REQUIRED_SECTIONS: Array<{ label: string; pattern: RegExp }> = [
    { label: 'UI layer',                 pattern: /ui\s+layer|src\/renderer/i },
    { label: 'core services',            pattern: /core\s+services|src\/main/i },
    { label: 'platform/data layer',      pattern: /platform|data\s+layer|src\/shared/i },
    { label: 'shared types/contracts',   pattern: /contracts|shared\s+types|src\/contracts/i },
    { label: 'tests',                    pattern: /tests\//i },
    { label: 'build/packaging',          pattern: /build\/|packaging|electron-builder/i },
    { label: 'docs',                     pattern: /docs\/|adr/i },
    { label: 'scripts',                  pattern: /scripts\//i },
  ];

  for (const section of REQUIRED_SECTIONS) {
    // qa-spec: S10
    it(`documents section: ${section.label}`, () => {
      expect(load(REPO_LAYOUT).match(section.pattern), `Missing section for '${section.label}'`).not.toBeNull();
    });
  }
});
