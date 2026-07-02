// qa-spec: S11 — Contracts test still passes with additive extensions.
// Original: agent-plan Task 9 five stable contracts. Extended to cover the
// new entity types introduced additively without breaking the DO NOT MODIFY
// versioning invariant.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONTRACTS_DIR = resolve(__dirname, '../../src/contracts');

interface ContractDef {
  file: string;
  exports: string[];
}

// Original + additive entity types. Every entry MUST be present as an
// `export interface|type <Name>` declaration.
const CONTRACTS: ContractDef[] = [
  { file: 'team-repo.contract.ts', exports: ['TeamRepo'] },
  {
    file: 'local-store.contract.ts',
    exports: ['LocalStoreSchema', 'MigrationDescriptor', 'KnownEntityTable'],
  },
  { file: 'core-service.contract.ts', exports: ['CoreServiceResult'] },
  { file: 'ai-task.contract.ts', exports: ['AITask'] },
  {
    file: 'domain-model.contract.ts',
    exports: [
      'KnowledgeItem',
      'Person',
      'Project',
      'ProjectStatus',
      'Charter',
      'NewsItem',
      'NewsSource',
      'Doc',
      'Ticket',
      'TicketStatus',
      'WipSignal',
      'WipSignalStatus',
      'Vector',
      'Tag',
      'Link',
      'Attachment',
      'EmbeddingCache',
      'Setting',
      'AuditLogEntry',
      'AppSession',
      'EventRecord',
      'VectorMetadata',
    ],
  },
  { file: 'seed-runner.contract.ts', exports: ['SeedResult', 'SeedRunner'] },
];

async function importContract(file: string): Promise<Record<string, unknown>> {
  const stem = file.replace(/\.ts$/, '');
  return (await import(`../../src/contracts/${stem}`)) as Record<string, unknown>;
}

describe('contracts — exports and versioning warning (S11)', () => {
  for (const { file, exports } of CONTRACTS) {
    // S11
    it(`${file} exports [${exports.join(', ')}]`, async () => {
      const mod = await importContract(file);
      for (const name of exports) {
        // TypeScript interfaces don't exist at runtime, so we check the *source*
        // for a matching `export interface|type` declaration.
        const src = readFileSync(resolve(CONTRACTS_DIR, file), 'utf-8');
        expect(src, `${file} must export ${name}`).toMatch(
          new RegExp(`export\\s+(interface|type)\\s+${name}\\b`),
        );
        // Also ensure runtime import doesn't blow up
        expect(mod).toBeDefined();
      }
    });

    // S11 — every contract file must carry a versioning warning JSDoc
    it(`${file} contains the JSDoc versioning warning`, () => {
      const src = readFileSync(resolve(CONTRACTS_DIR, file), 'utf-8');
      // Warning must mention "ADR" or "version" and be in a leading comment
      // block at the top of the file.
      const head = src.slice(0, 800);
      expect(
        /adr/i.test(head) || /versioning/i.test(head),
        `${file} must open with a JSDoc warning referencing ADR/versioning. First 800 chars:\n${head}`,
      ).toBe(true);
      expect(
        /(do not|never)\s+(modify|change|break|mutate)/i.test(head),
        `${file} must warn against unversioned mutation`,
      ).toBe(true);
    });
  }
});
