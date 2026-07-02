// qa-spec: S7 — Architecture lint passes with zero violations; scans all
// src/renderer files and logs count.
//
// This is the guardrail test that keeps the renderer bundle free of
// direct platform-API imports (`node:*`, `better-sqlite3`, `electron`,
// `zod`). It scans every `.ts` / `.tsx` file under `src/renderer/` and
// asserts none of them contains a forbidden import.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const RENDERER_ROOT = resolve(__dirname, '../../src/renderer');

/**
 * Modules the renderer MUST NOT import directly. Matches on the exact
 * module specifier — `node:fs`, `better-sqlite3`, `electron`, `zod`, plus
 * every `node:*` builtin.
 */
const FORBIDDEN_MODULES = [
  'electron',
  'better-sqlite3',
  'zod',
  'sqlite-vec',
] as const;

const FORBIDDEN_PREFIXES = ['node:'] as const;

const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx']);

interface Violation {
  file: string;
  spec: string;
  matchedRule: string;
}

/**
 * Recursively enumerate every `.ts` / `.tsx` file under `dir`.
 */
function walk(dir: string): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir);
  for (const name of entries) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...walk(full));
    } else if (ALLOWED_EXTENSIONS.has(extname(name))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Extract every module specifier from ESM `import` and `export ... from`
 * statements. Type-only imports (`import type { X } from '...'`) are
 * FORBIDDEN too because the goal is a compile-time isolation guarantee:
 * even a type-only reference is a signal that the renderer is trying to
 * reach across the boundary. If we let type-only imports through, a
 * later refactor could accidentally load the runtime.
 */
function extractSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const importRe = /(?:^|[\s;])import\s+(?:type\s+)?(?:[^;'"]*\s+from\s+)?['"]([^'"]+)['"]/g;
  const exportRe = /(?:^|[\s;])export\s+(?:type\s+)?[^;'"]*\s+from\s+['"]([^'"]+)['"]/g;
  const dynRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source)) !== null) {
    if (m[1] !== undefined) specs.push(m[1]);
  }
  while ((m = exportRe.exec(source)) !== null) {
    if (m[1] !== undefined) specs.push(m[1]);
  }
  while ((m = dynRe.exec(source)) !== null) {
    if (m[1] !== undefined) specs.push(m[1]);
  }
  return specs;
}

function isForbidden(spec: string): string | null {
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (spec.startsWith(prefix)) {
      return `prefix "${prefix}"`;
    }
  }
  for (const mod of FORBIDDEN_MODULES) {
    if (spec === mod || spec.startsWith(`${mod}/`)) {
      return `module "${mod}"`;
    }
  }
  return null;
}

function scanRenderer(root: string): { files: string[]; violations: Violation[] } {
  const files = walk(root);
  const violations: Violation[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf-8');
    for (const spec of extractSpecifiers(src)) {
      const rule = isForbidden(spec);
      if (rule !== null) {
        violations.push({ file, spec, matchedRule: rule });
      }
    }
  }
  return { files, violations };
}

describe('architecture lint — src/renderer/ platform isolation (S7)', () => {
  // qa-spec: S7
  it('at least one src/renderer file is scanned', () => {
    const { files } = scanRenderer(RENDERER_ROOT);
    // Log the scanned count via a message field so a CI capture surfaces it.
    expect(
      files.length,
      `expected at least one src/renderer file to be scanned; scanned ${files.length}`,
    ).toBeGreaterThan(0);
  });

  // qa-spec: S7
  it('no renderer file imports a forbidden platform module', () => {
    const { files, violations } = scanRenderer(RENDERER_ROOT);
    // The failure message names every offending file + import so the
    // developer sees the exact violation without hunting.
    const details = violations
      .map((v) => `${v.file} imports ${v.spec} (${v.matchedRule})`)
      .join('\n');
    expect(
      violations,
      `expected zero violations across ${files.length} renderer files\n${details}`,
    ).toEqual([]);
  });
});
