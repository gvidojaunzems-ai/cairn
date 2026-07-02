// qa-spec: (implicit — agent-plan Task 9 five stable contracts)
// Asserts every contract file exports its declared symbol AND carries a
// versioning-warning JSDoc block. These files must never mutate without a
// new ADR.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CONTRACTS_DIR = resolve(__dirname, '../../src/contracts');

interface ContractDef {
  file: string;
  exports: string[];
}

const CONTRACTS: ContractDef[] = [
  { file: 'team-repo.contract.ts', exports: ['TeamRepo'] },
  { file: 'local-store.contract.ts', exports: ['LocalStoreSchema'] },
  { file: 'core-service.contract.ts', exports: ['CoreServiceResult'] },
  { file: 'ai-task.contract.ts', exports: ['AITask'] },
  { file: 'domain-model.contract.ts', exports: ['KnowledgeItem'] },
];

async function importContract(file: string): Promise<Record<string, unknown>> {
  const stem = file.replace(/\.ts$/, '');
  return (await import(`../../src/contracts/${stem}`)) as Record<string, unknown>;
}

describe('contracts — exports and versioning warning (implicit T9)', () => {
  for (const { file, exports } of CONTRACTS) {
    // implicit
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

    // implicit — every contract file must carry a versioning warning JSDoc
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
