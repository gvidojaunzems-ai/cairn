// qa-spec: S10 — Domain model documentation is present and covers every
// major entity plus status enums.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DOMAIN_MODEL_DOC = resolve(__dirname, '../../docs/architecture/domain-model.md');

/**
 * Every entity mentioned in qa-spec S10's assertion:
 *
 *   > domain-model.md contains definitions for at least: people, projects,
 *   > updates, signals, decisions, tickets, news_items, docs, meetings,
 *   > action_items
 *
 * Extended to the full list from S2's minimum-table assertion so the doc
 * stays honest about what the code actually persists.
 */
const REQUIRED_ENTITY_TERMS = [
  'people',
  'projects',
  'updates',
  'signals',
  'decisions',
  'apps',
  'tickets',
  'news_items',
  'news_topics',
  'docs',
  'meetings',
  'action_items',
  'reports',
  'feeds',
  'budget_ledger',
  'jobs',
  'sync_state',
  'settings',
];

/**
 * Status enum names S10 expects to be documented. Only one of the two docs
 * (domain-model.md or store-schema.md) needs to mention them, per S10's
 * fourth assertion — so this test is intentionally lenient about location.
 */
const REQUIRED_STATUS_ENUM_TERMS = [
  'active',
  'paused',
  'completed',
  'archived',
  'open',
  'in_progress',
  'done',
  'closed',
];

function load(path: string): string {
  return readFileSync(path, 'utf-8');
}

describe('docs/architecture/domain-model.md (S10)', () => {
  // qa-spec: S10
  it('exists at docs/architecture/domain-model.md', () => {
    expect(
      existsSync(DOMAIN_MODEL_DOC),
      'domain-model.md must be committed to docs/architecture/',
    ).toBe(true);
  });

  // qa-spec: S10
  it('is a non-empty document (>= 500 chars)', () => {
    if (!existsSync(DOMAIN_MODEL_DOC)) return; // handled by the previous assertion
    expect(load(DOMAIN_MODEL_DOC).length).toBeGreaterThanOrEqual(500);
  });

  for (const term of REQUIRED_ENTITY_TERMS) {
    // qa-spec: S10
    it(`mentions entity: ${term}`, () => {
      if (!existsSync(DOMAIN_MODEL_DOC)) {
        throw new Error('docs/architecture/domain-model.md must exist (see S10 assertion 1)');
      }
      const source = load(DOMAIN_MODEL_DOC);
      // Case-insensitive whole-word so `People` and `people` both count.
      const pattern = new RegExp(`\\b${term}\\b`, 'i');
      expect(pattern.test(source), `domain-model.md must document entity '${term}'`).toBe(true);
    });
  }

  // qa-spec: S10
  it('documents at least three status enum values', () => {
    if (!existsSync(DOMAIN_MODEL_DOC)) return;
    const source = load(DOMAIN_MODEL_DOC).toLowerCase();
    const matches = REQUIRED_STATUS_ENUM_TERMS.filter((term) => source.includes(term));
    expect(
      matches.length,
      `domain-model.md must document at least 3 of ${REQUIRED_STATUS_ENUM_TERMS.join(', ')} — found ${String(matches.length)}`,
    ).toBeGreaterThanOrEqual(3);
  });
});
