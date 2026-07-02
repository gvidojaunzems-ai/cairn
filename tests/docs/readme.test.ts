// qa-spec: S8 — README documents all eight scripts with one-line descriptions.
// Covers AC-8. Also asserts references to the ADR (AC-9) for cross-linking.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const README = resolve(__dirname, '../../README.md');

function loadReadme(): string {
  return readFileSync(README, 'utf-8');
}

const SCRIPTS = ['dev', 'build', 'package', 'test', 'lint', 'format', 'typecheck', 'seed'];

describe('README.md — scripts documentation (S8 / AC-8)', () => {
  // qa-spec: S8
  it('README.md exists at repo root', () => {
    expect(existsSync(README), 'README.md missing at repo root').toBe(true);
  });

  for (const script of SCRIPTS) {
    // qa-spec: S8
    it(`documents the '${script}' script`, () => {
      const src = loadReadme();
      // Match either `pnpm dev`, `pnpm run dev`, or `dev` inside a code cell of a scripts table
      const pattern = new RegExp(
        `(\\|\\s*(?:pnpm\\s+(?:run\\s+)?)?\`?${script}\`?\\s*\\|)|(\`pnpm\\s+${script}\`)`,
        'i',
      );
      expect(
        src.match(pattern),
        `README.md must document the '${script}' script (e.g. inside a scripts table or as \`pnpm ${script}\`)`,
      ).not.toBeNull();
    });
  }

  // qa-spec: S8 — one-line description accompanies each script (heuristic: table row)
  it('scripts are documented in a table with a description column', () => {
    const src = loadReadme();
    // Look for a markdown table row that contains one of the scripts and at least one word after `|`
    const anyTableRow = /\|\s*(?:pnpm\s+(?:run\s+)?)?`?(dev|build|package|test|lint|format|typecheck|seed)`?\s*\|\s*[A-Za-z0-9]/;
    expect(src.match(anyTableRow), 'README.md must include a scripts table with descriptions').not.toBeNull();
  });

  it('README.md links or references docs/adr/0001-stack.md (AC-9 cross-link)', () => {
    const src = loadReadme();
    expect(src.match(/adr\/0001-stack\.md/i)).not.toBeNull();
  });

  it('README.md mentions Node >= 20 and pnpm >= 9 prerequisites', () => {
    const src = loadReadme();
    expect(src.toLowerCase()).toMatch(/node[^\n]{0,20}20/);
    expect(src.toLowerCase()).toMatch(/pnpm[^\n]{0,20}9/);
  });
});
