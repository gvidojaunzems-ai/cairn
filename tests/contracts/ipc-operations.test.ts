// qa-spec: S5 — Contract tests pass for all 16 declared op namespaces.
// Asserts the shared IPC descriptor layer exports:
//   * `OP_NAMESPACES` with EXACTLY the 16 namespaces enumerated in the spec.
//   * A non-empty op list under each namespace.
//   * A Zod input schema (via `IPC_INPUT_SCHEMAS`) for every `namespace.op`.
//   * Parity between the operation registry and the schema registry — no
//     missing keys, no orphan schemas.
//
// This is the transport-layer S5 contract test — the router / registration
// side of S5 lives in tests/main/ipc-router.test.ts.
import { describe, expect, it } from 'vitest';

import {
  OP_NAMESPACES,
  OP_NAMESPACE_NAMES,
} from '../../src/shared/ipc/operations';
import {
  IPC_INPUT_SCHEMAS,
  enumerateQualifiedOpIds,
} from '../../src/shared/ipc/schemas';

/** The exact set of namespaces the qa-spec / plan enumerate. */
const REQUIRED_NAMESPACES = [
  'system',
  'setup',
  'git',
  'projects',
  'today',
  'dailies',
  'news',
  'search',
  'docs',
  'meetings',
  'reports',
  'pulse',
  'support',
  'settings',
  'ai',
  'jobs',
] as const;

describe('shared/ipc/operations — 16 op namespaces (S5)', () => {
  // qa-spec: S5
  it('exports OP_NAMESPACE_NAMES with exactly 16 entries', () => {
    expect(OP_NAMESPACE_NAMES.length).toBe(16);
  });

  // qa-spec: S5
  it('OP_NAMESPACE_NAMES contains every required namespace name', () => {
    for (const ns of REQUIRED_NAMESPACES) {
      expect(
        (OP_NAMESPACE_NAMES as readonly string[]).includes(ns),
        `expected OP_NAMESPACE_NAMES to include '${ns}', got ${JSON.stringify(OP_NAMESPACE_NAMES)}`,
      ).toBe(true);
    }
  });

  // qa-spec: S5
  it('OP_NAMESPACES has an entry per required namespace with a non-empty op list', () => {
    for (const ns of REQUIRED_NAMESPACES) {
      const ops = (OP_NAMESPACES as Record<string, readonly string[] | undefined>)[ns];
      expect(ops, `OP_NAMESPACES.${ns} is missing`).toBeDefined();
      expect(
        (ops ?? []).length,
        `OP_NAMESPACES.${ns} should declare at least one op`,
      ).toBeGreaterThan(0);
    }
  });

  // qa-spec: S5 — system MUST declare getStatus (used by S1 perf test).
  it('OP_NAMESPACES.system includes getStatus', () => {
    const ops = (OP_NAMESPACES as Record<string, readonly string[] | undefined>).system ?? [];
    expect(ops).toContain('getStatus');
  });

  // qa-spec: S5 — jobs MUST include start + cancel (used by S2/S3).
  it('OP_NAMESPACES.jobs includes start and cancel', () => {
    const ops = (OP_NAMESPACES as Record<string, readonly string[] | undefined>).jobs ?? [];
    expect(ops).toContain('start');
    expect(ops).toContain('cancel');
  });
});

describe('shared/ipc/schemas — per-op Zod schema registry (S5)', () => {
  // qa-spec: S5
  it('IPC_INPUT_SCHEMAS has a schema for every enumerated qualified op id', () => {
    const missing: string[] = [];
    for (const id of enumerateQualifiedOpIds()) {
      const registry = IPC_INPUT_SCHEMAS as Record<string, unknown>;
      if (registry[id] === undefined) {
        missing.push(id);
      }
    }
    expect(missing, `missing schemas: ${JSON.stringify(missing)}`).toEqual([]);
  });

  // qa-spec: S5
  it('IPC_INPUT_SCHEMAS has no orphan entries (schema for an op not in OP_NAMESPACES)', () => {
    const declared = new Set<string>(enumerateQualifiedOpIds() as readonly string[]);
    const orphans: string[] = [];
    for (const id of Object.keys(IPC_INPUT_SCHEMAS)) {
      if (!declared.has(id)) {
        orphans.push(id);
      }
    }
    expect(orphans, `orphan schemas: ${JSON.stringify(orphans)}`).toEqual([]);
  });
});
