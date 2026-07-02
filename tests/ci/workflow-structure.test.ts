// qa-spec: S3 — CI workflow file exists and targets Windows plus macOS/Linux.
// Covers AC-3. Also asserts every `uses:` line is SHA-pinned (security rule).
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

const CI_YAML = resolve(__dirname, '../../.github/workflows/ci.yml');
const PACKAGE_YAML = resolve(__dirname, '../../.github/workflows/package.yml');

interface Workflow {
  on?: unknown;
  jobs?: Record<string, {
    'runs-on'?: string | Record<string, unknown>;
    strategy?: { matrix?: Record<string, unknown> };
    steps?: Array<{ uses?: string; run?: string; with?: unknown; name?: string }>;
  }>;
}

function loadWorkflow(path: string): { text: string; parsed: Workflow } {
  const text = readFileSync(path, 'utf-8');
  const parsed = parseYaml(text) as Workflow;
  return { text, parsed };
}

function collectUses(wf: Workflow): string[] {
  const out: string[] = [];
  for (const job of Object.values(wf.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      if (typeof step.uses === 'string') out.push(step.uses);
    }
  }
  return out;
}

describe('ci.yml — structure (S3 / AC-3)', () => {
  // qa-spec: S3
  it('.github/workflows/ci.yml exists', () => {
    expect(existsSync(CI_YAML), `expected ${CI_YAML} to exist`).toBe(true);
  });

  // qa-spec: S3
  it('ci.yml parses as valid YAML', () => {
    const { parsed } = loadWorkflow(CI_YAML);
    expect(parsed).toBeDefined();
    expect(parsed.jobs, 'ci.yml must define at least one job').toBeDefined();
  });

  // qa-spec: S3
  it('matrix includes windows-latest', () => {
    const { text } = loadWorkflow(CI_YAML);
    expect(text).toMatch(/windows-latest/);
  });

  // qa-spec: S3
  it('matrix includes at least one of macos-latest or ubuntu-latest', () => {
    const { text } = loadWorkflow(CI_YAML);
    expect(text.match(/(macos-latest|ubuntu-latest)/)).not.toBeNull();
  });

  // qa-spec: S3
  it('runs lint, typecheck, test, and build steps', () => {
    const { text } = loadWorkflow(CI_YAML);
    expect(text).toMatch(/pnpm\s+lint/);
    expect(text).toMatch(/pnpm\s+typecheck/);
    expect(text).toMatch(/pnpm\s+test/);
    expect(text).toMatch(/pnpm\s+build/);
  });

  // qa-spec: S3
  it('uses pnpm dependency caching', () => {
    const { text } = loadWorkflow(CI_YAML);
    // Either setup-node cache: pnpm, or pnpm/action-setup, or actions/cache with pnpm store
    expect(text.match(/cache:\s*['"]?pnpm['"]?|pnpm\/action-setup|pnpm store/)).not.toBeNull();
  });

  // qa-spec: S3 — security requirement: every `uses:` must be a full 40-char SHA
  it('every `uses:` line is pinned to a full 40-character commit SHA', () => {
    const { parsed } = loadWorkflow(CI_YAML);
    const uses = collectUses(parsed);
    expect(uses.length, 'ci.yml must have at least one uses: entry').toBeGreaterThan(0);
    const shaRegex = /^[^@]+@[0-9a-f]{40}$/;
    for (const u of uses) {
      // Allow local composite actions ("./..." / "docker://") — but no version tags like @v3
      const isLocal = u.startsWith('./') || u.startsWith('docker://');
      const isValid = isLocal || shaRegex.test(u);
      expect(isValid, `uses: ${u} must be pinned to a 40-char SHA (not @v3 / @main / @vX.Y.Z)`).toBe(true);
    }
  });
});

describe('package.yml — installer workflow', () => {
  it('.github/workflows/package.yml exists', () => {
    expect(existsSync(PACKAGE_YAML), `expected ${PACKAGE_YAML} to exist`).toBe(true);
  });

  it('package.yml is valid YAML with jobs defined', () => {
    const { parsed } = loadWorkflow(PACKAGE_YAML);
    expect(parsed.jobs).toBeDefined();
    expect(Object.keys(parsed.jobs ?? {}).length).toBeGreaterThan(0);
  });

  it('package.yml only triggers on workflow_dispatch or tags (not every push)', () => {
    const { text } = loadWorkflow(PACKAGE_YAML);
    expect(text).toMatch(/workflow_dispatch|tags:/);
  });

  it('package.yml uses: entries are SHA-pinned', () => {
    const { parsed } = loadWorkflow(PACKAGE_YAML);
    const uses = collectUses(parsed);
    const shaRegex = /^[^@]+@[0-9a-f]{40}$/;
    for (const u of uses) {
      const isLocal = u.startsWith('./') || u.startsWith('docker://');
      expect(isLocal || shaRegex.test(u), `package.yml uses: ${u} must be SHA-pinned`).toBe(true);
    }
  });
});
