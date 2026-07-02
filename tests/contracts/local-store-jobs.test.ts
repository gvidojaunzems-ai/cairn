// qa-spec: S11 — LocalStoreSchema has a jobs table descriptor with at
// minimum id/status/timestamp fields; an ADR documents the change.
//
// This is a source + type-level test: we read local-store.contract.ts, assert
// that the required symbols are present, and construct a value of each
// declared type to force tsc to validate the shape.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  JobStatus,
  JobsTableRow,
  LocalStoreSchema,
} from '../../src/contracts/local-store.contract';

const CONTRACT_FILE = resolve(
  __dirname,
  '../../src/contracts/local-store.contract.ts',
);
const ADR_DIR = resolve(__dirname, '../../docs/adr');

/** Statuses required by ADR 0004. */
const REQUIRED_STATUSES: readonly JobStatus[] = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
];

describe('local-store.contract — jobs table row shape (S11)', () => {
  // qa-spec: S11 — LocalStoreSchema.version bumped to 2 (per ADR 0004).
  it('LocalStoreSchema.version is bumped to at least 2', () => {
    const src = readFileSync(CONTRACT_FILE, 'utf-8');
    // A literal-typed `version: 2` OR `version: number` — accept either;
    // assert that the file mentions version 2 in the schema JSDoc.
    expect(/version[:\s]*2\b/.test(src)).toBe(true);
    // Also assert the runtime constant is >= 2 by inspection.
    expect(/CURRENT_LOCAL_STORE_SCHEMA_VERSION[^=]*=\s*2/.test(src)).toBe(true);
    // Type-only smoke: constructing a schema value with version:2 must compile.
    const schema: LocalStoreSchema = { version: 2 };
    expect(schema.version).toBe(2);
  });

  // qa-spec: S11 — JobStatus union covers the required lifecycle points.
  it.each(REQUIRED_STATUSES)('JobStatus includes %s', (status) => {
    const s: JobStatus = status;
    expect(typeof s).toBe('string');
  });

  // qa-spec: S11 — JobsTableRow has id + status + createdAt + updatedAt.
  it('JobsTableRow enforces id/status/createdAt/updatedAt', () => {
    const row: JobsTableRow = {
      id: 'j-1',
      kind: 'sample-long-job',
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    expect(row.id).toBe('j-1');
    expect(row.status).toBe('pending');
    expect(typeof row.createdAt).toBe('number');
    expect(typeof row.updatedAt).toBe('number');
  });

  // qa-spec: S11 — optional fields declared for progressPct/label/result/error.
  it('JobsTableRow accepts progressPct/label/result/error as optional fields', () => {
    const row: JobsTableRow = {
      id: 'j-2',
      kind: 'sample-long-job',
      status: 'running',
      createdAt: 1,
      updatedAt: 2,
      progressPct: 42,
      label: 'Working',
      result: '{"ok":true}',
      error: undefined,
    };
    expect(row.progressPct).toBe(42);
    expect(row.label).toBe('Working');
    expect(row.result).toBe('{"ok":true}');
  });

  // qa-spec: S11 — contract file source still warns against unversioned changes.
  it('local-store.contract.ts still warns against unversioned changes', () => {
    const src = readFileSync(CONTRACT_FILE, 'utf-8').slice(0, 800);
    expect(/adr/i.test(src) || /versioning/i.test(src)).toBe(true);
    expect(/(do not|never)\s+(modify|change|break|mutate)/i.test(src)).toBe(true);
  });
});

describe('docs/adr — 0004 local-store jobs table (S11)', () => {
  // qa-spec: S11
  it('an ADR under docs/adr/ documents the jobs table addition', () => {
    expect(existsSync(ADR_DIR)).toBe(true);
    const adrs = readdirSync(ADR_DIR).filter((f) => f.endsWith('.md'));
    const match = adrs.find(
      (name) => /jobs?-?table/i.test(name) || /0004/.test(name),
    );
    expect(
      match,
      `no ADR mentioning the jobs table in ${adrs.join(', ')}`,
    ).toBeDefined();
    if (match !== undefined) {
      const src = readFileSync(resolve(ADR_DIR, match), 'utf-8').toLowerCase();
      expect(src).toContain('jobs');
      expect(src.match(/(pending|running|succeeded|failed|cancelled)/)).not.toBeNull();
    }
  });
});
