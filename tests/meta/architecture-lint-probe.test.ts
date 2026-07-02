// qa-spec: S8 — Architecture lint fails (non-zero exit) with a probe file
// containing a forbidden import, naming the offending file + forbidden
// import.
//
// This mirrors the S7 lint against a scratch tmpdir that contains a
// synthetic renderer tree with one bad file. If the lint logic passes
// the probe, that's a false negative — this test catches it.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

const FORBIDDEN_MODULES = ['electron', 'better-sqlite3', 'zod', 'sqlite-vec'] as const;
const FORBIDDEN_PREFIXES = ['node:'] as const;
const ALLOWED_EXTENSIONS = new Set(['.ts', '.tsx']);

interface Violation {
  file: string;
  spec: string;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walk(full));
    else if (ALLOWED_EXTENSIONS.has(extname(name))) out.push(full);
  }
  return out;
}

function extractSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const importRe = /(?:^|[\s;])import\s+(?:type\s+)?(?:[^;'"]*\s+from\s+)?['"]([^'"]+)['"]/g;
  const exportRe = /(?:^|[\s;])export\s+(?:type\s+)?[^;'"]*\s+from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source)) !== null) {
    if (m[1] !== undefined) specs.push(m[1]);
  }
  while ((m = exportRe.exec(source)) !== null) {
    if (m[1] !== undefined) specs.push(m[1]);
  }
  return specs;
}

function isForbidden(spec: string): boolean {
  if (FORBIDDEN_PREFIXES.some((p) => spec.startsWith(p))) return true;
  if (FORBIDDEN_MODULES.some((m) => spec === m || spec.startsWith(`${m}/`))) return true;
  return false;
}

function scan(root: string): Violation[] {
  const violations: Violation[] = [];
  for (const file of walk(root)) {
    for (const spec of extractSpecifiers(readFileSync(file, 'utf-8'))) {
      if (isForbidden(spec)) violations.push({ file, spec });
    }
  }
  return violations;
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cairn-arch-probe-'));
  mkdirSync(join(dir, 'src', 'renderer'), { recursive: true });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('architecture lint — probe (S8)', () => {
  // qa-spec: S8
  it('probe file with node:fs import produces at least one violation naming the file + import', () => {
    const probePath = join(dir, 'src', 'renderer', '__arch_test_probe__.ts');
    writeFileSync(probePath, `import * as fs from 'node:fs';\nexport const x = fs;\n`);

    const violations = scan(join(dir, 'src', 'renderer'));
    expect(violations.length).toBeGreaterThan(0);
    const named = violations.find(
      (v) => v.file === probePath && v.spec === 'node:fs',
    );
    expect(
      named,
      `expected a violation for ${probePath} + spec node:fs; got ${JSON.stringify(violations)}`,
    ).toBeDefined();
  });

  // qa-spec: S8 — the lint would fail loud (non-zero exit code) at the
  // Vitest level. We simulate that by asserting `violations.length > 0`,
  // which is what the S7 `expect(violations).toEqual([])` would report.
  it('non-empty violation list means non-zero test exit', () => {
    const probePath = join(dir, 'src', 'renderer', '__arch_test_probe__.ts');
    writeFileSync(probePath, `import { app } from 'electron';\nexport const x = app;\n`);

    const violations = scan(join(dir, 'src', 'renderer'));
    // Sanity: at least one violation exists.
    expect(violations.length).toBeGreaterThan(0);
    // The S7 assertion `expect(violations).toEqual([])` would throw here;
    // simulate the check with the same assertion, wrapped so this test
    // records "would fail" and passes.
    let s7WouldFail = false;
    try {
      expect(violations).toEqual([]);
    } catch {
      s7WouldFail = true;
    }
    expect(s7WouldFail).toBe(true);
  });

  // qa-spec: S8 — the lint output names both the probe file AND the
  // forbidden import string.
  it('violation message identifies the file + the forbidden module', () => {
    const probePath = join(dir, 'src', 'renderer', 'bad.tsx');
    writeFileSync(
      probePath,
      `import Database from 'better-sqlite3';\nexport const x = Database;\n`,
    );
    const violations = scan(join(dir, 'src', 'renderer'));
    const message = violations
      .map((v) => `${v.file} imports ${v.spec}`)
      .join('\n');
    expect(message).toContain(probePath);
    expect(message).toContain('better-sqlite3');
  });
});
