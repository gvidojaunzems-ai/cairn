// qa-spec: S11 — Contract files export LocalStoreSchema (full descriptor),
// KnowledgeItem (backward compat), and the new entity types. The DO NOT
// MODIFY versioning JSDoc warning stays intact.
//
// This test file is intentionally separate from tests/contracts/contracts.test.ts
// so that the base-symbol scan there stays green and the new-entity assertions
// live in a file that lands with the domain-model expansion (Task 3 in the
// implementation plan).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONTRACTS_DIR = resolve(__dirname, '../../src/contracts');

function loadContract(file: string): string {
  return readFileSync(resolve(CONTRACTS_DIR, file), 'utf-8');
}

/**
 * Every entry the extended domain-model file MUST expose. Sourced from
 * qa-spec S2 (table list) + agent-plan Task 3. Each item is asserted by
 * scanning the file for `export interface|type Name` — matches the shape
 * that tests/contracts/contracts.test.ts already uses.
 */
const DOMAIN_MODEL_ENTITIES = [
  'KnowledgeItem', // Retained for backward compatibility (S11 explicit).
  'Person',
  'Project',
  'Signal',
  'Decision',
  'Ticket',
  'NewsItem',
  'NewsTopic',
  'Doc',
  'Meeting',
  'ActionItem',
  'Update',
  'Report',
  'Feed',
  'BudgetLedgerEntry',
  'Job',
  'SyncState',
  'App',
  'VectorRecord',
];

const DOMAIN_MODEL_STATUS_ENUMS = [
  'ProjectStatus',
  'SignalStatus',
  'DecisionStatus',
  'TicketStatus',
  'ActionItemStatus',
  'JobStatus',
];

const LOCAL_STORE_EXPECTED_SYMBOLS = [
  // Full schema descriptor exposes at minimum the migration version, the
  // table manifest, and the vector dimension used by the vec0 virtual table.
  'LocalStoreSchema',
  'TABLE_MANIFEST',
  'CURRENT_SCHEMA_VERSION',
  'VECTOR_DIMENSION',
];

describe('contracts/domain-model.contract.ts — extended entity coverage (S11)', () => {
  const source = loadContract('domain-model.contract.ts');

  // Guard: JSDoc "DO NOT MODIFY" warning is preserved verbatim.
  // qa-spec: S11
  it('opens with the DO NOT MODIFY versioning warning', () => {
    const head = source.slice(0, 800);
    expect(
      /(do not|never)\s+(modify|change|mutate)/i.test(head),
      'domain-model.contract.ts must retain the DO NOT MODIFY warning block',
    ).toBe(true);
    expect(/(adr|versioning)/i.test(head), 'warning must reference ADR/versioning').toBe(true);
  });

  for (const symbol of DOMAIN_MODEL_ENTITIES) {
    // qa-spec: S11
    it(`exports entity type: ${symbol}`, () => {
      expect(
        source,
        `domain-model.contract.ts must declare 'export interface|type ${symbol}'`,
      ).toMatch(new RegExp(`export\\s+(interface|type)\\s+${symbol}\\b`));
    });
  }

  for (const enumName of DOMAIN_MODEL_STATUS_ENUMS) {
    // qa-spec: S11
    it(`exports status enum type: ${enumName}`, () => {
      expect(
        source,
        `domain-model.contract.ts must declare 'export type ${enumName}' (or interface/const/enum)`,
      ).toMatch(new RegExp(`export\\s+(interface|type|const|enum)\\s+${enumName}\\b`));
    });
  }

  // qa-spec: S11
  it('runtime module imports without throwing', async () => {
    await expect(import('../../src/contracts/domain-model.contract')).resolves.toBeDefined();
  });
});

describe('contracts/local-store.contract.ts — full schema descriptor (S11)', () => {
  const source = loadContract('local-store.contract.ts');

  // qa-spec: S11
  it('opens with the DO NOT MODIFY versioning warning', () => {
    const head = source.slice(0, 800);
    expect(
      /(do not|never)\s+(modify|change|mutate)/i.test(head),
      'local-store.contract.ts must retain the DO NOT MODIFY warning block',
    ).toBe(true);
    expect(/(adr|versioning)/i.test(head), 'warning must reference ADR/versioning').toBe(true);
  });

  for (const symbol of LOCAL_STORE_EXPECTED_SYMBOLS) {
    // qa-spec: S11
    it(`declares ${symbol} at file level`, () => {
      const pattern = new RegExp(
        `export\\s+(interface|type|const|enum)\\s+${symbol}\\b`,
      );
      expect(
        source,
        `local-store.contract.ts must declare 'export … ${symbol}' (full descriptor per S11)`,
      ).toMatch(pattern);
    });
  }

  // qa-spec: S11
  it('runtime module imports without throwing', async () => {
    await expect(import('../../src/contracts/local-store.contract')).resolves.toBeDefined();
  });

  // qa-spec: S11
  it('TABLE_MANIFEST at runtime is a non-empty array containing at least "people" and "projects"', async () => {
    const mod = (await import('../../src/contracts/local-store.contract')) as {
      TABLE_MANIFEST?: readonly string[];
    };
    expect(Array.isArray(mod.TABLE_MANIFEST)).toBe(true);
    expect((mod.TABLE_MANIFEST ?? []).length).toBeGreaterThanOrEqual(17);
    expect(mod.TABLE_MANIFEST).toContain('people');
    expect(mod.TABLE_MANIFEST).toContain('projects');
    expect(mod.TABLE_MANIFEST).toContain('knowledge_items');
    expect(mod.TABLE_MANIFEST).toContain('wip_signals');
  });

  // qa-spec: S11
  it('CURRENT_SCHEMA_VERSION at runtime is >= 1', async () => {
    const mod = (await import('../../src/contracts/local-store.contract')) as {
      CURRENT_SCHEMA_VERSION?: number;
    };
    expect(typeof mod.CURRENT_SCHEMA_VERSION).toBe('number');
    expect(mod.CURRENT_SCHEMA_VERSION ?? 0).toBeGreaterThanOrEqual(1);
  });

  // qa-spec: S11
  it('VECTOR_DIMENSION at runtime is 1536 (matches sqlite-vec vec0 default)', async () => {
    const mod = (await import('../../src/contracts/local-store.contract')) as {
      VECTOR_DIMENSION?: number;
    };
    expect(mod.VECTOR_DIMENSION).toBe(1536);
  });
});
