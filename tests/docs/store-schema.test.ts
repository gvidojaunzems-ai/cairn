// qa-spec: S10 — Store-schema documentation exists and lists every table
// declared in the initial migration.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const STORE_SCHEMA_DOC = resolve(__dirname, '../../docs/architecture/store-schema.md');
const INITIAL_MIGRATION = resolve(
  __dirname,
  '../../src/main/db/migrations/0001-init.ts',
);
const JOBS_MIGRATION = resolve(
  __dirname,
  '../../src/main/db/migrations/0002-jobs-table.ts',
);

/**
 * Extract every table name from migration files so this test
 * stays honest as new tables land — it always scans the actual DDL, never a
 * hand-maintained list.
 */
function extractTablesFromMigration(...paths: string[]): string[] {
  const tables: string[] = [];
  for (const migrationPath of paths) {
    if (!existsSync(migrationPath)) {
      continue;
    }
    const src = readFileSync(migrationPath, 'utf-8');
    const pattern = /CREATE\s+(?:VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(src)) !== null) {
      if (typeof match[1] === 'string') {
        tables.push(match[1]);
      }
    }
  }
  return tables;
}

describe('docs/architecture/store-schema.md (S10)', () => {
  const tables = extractTablesFromMigration(INITIAL_MIGRATION, JOBS_MIGRATION);

  // qa-spec: S10
  it('exists at docs/architecture/store-schema.md', () => {
    expect(
      existsSync(STORE_SCHEMA_DOC),
      'store-schema.md must be committed to docs/architecture/',
    ).toBe(true);
  });

  // qa-spec: S10
  it('is a non-empty document (>= 500 chars)', () => {
    if (!existsSync(STORE_SCHEMA_DOC)) return;
    expect(readFileSync(STORE_SCHEMA_DOC, 'utf-8').length).toBeGreaterThanOrEqual(500);
  });

  // qa-spec: S10
  it('the initial migration declares at least 17 tables (S2 minimum)', () => {
    expect(
      tables.length,
      `expected the initial migration to declare >= 17 tables; found ${String(tables.length)}: ${tables.join(', ')}`,
    ).toBeGreaterThanOrEqual(17);
  });

  // qa-spec: S10
  it('mentions every table declared in the initial migration', () => {
    if (!existsSync(STORE_SCHEMA_DOC)) {
      throw new Error('docs/architecture/store-schema.md must exist (see S10 assertion 3)');
    }
    const source = readFileSync(STORE_SCHEMA_DOC, 'utf-8').toLowerCase();
    const missing = tables.filter((name) => !source.includes(name.toLowerCase()));
    expect(
      missing,
      `store-schema.md must reference every migration table; missing: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  // qa-spec: S10
  it('documents the sqlite-vec `vec_items` virtual table and its dimension', () => {
    if (!existsSync(STORE_SCHEMA_DOC)) return;
    const source = readFileSync(STORE_SCHEMA_DOC, 'utf-8');
    expect(source, 'store-schema.md must mention the vec_items table').toMatch(/vec_items/);
    // Dimension: 1536 per src/main/db/schema.ts VECTOR_DIMENSION.
    expect(source, 'store-schema.md must document the embedding dimension').toMatch(/1536/);
  });
});
