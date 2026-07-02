// qa-spec: S10 — ADRs for the keychain fallback and the local-store
// migration strategy are committed alongside the code they describe.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ADR_DIR = resolve(__dirname, '../../docs/adr');

function findFirstMatching(pattern: RegExp): string | null {
  if (!existsSync(ADR_DIR)) return null;
  const files = readdirSync(ADR_DIR);
  return files.find((f) => pattern.test(f)) ?? null;
}

describe('docs/adr/ — ADR coverage for the data-layer decisions (S10)', () => {
  // qa-spec: S10 — keychain + encrypted fallback
  it('has an ADR describing the keychain + AES-256-GCM fallback', () => {
    const found = findFirstMatching(/keychain|fallback/i);
    expect(
      found,
      'expected docs/adr/000N-*.md whose filename mentions keychain or fallback (per S10 + agent-plan Task 7)',
    ).not.toBeNull();
    if (found === null) return;
    const src = readFileSync(resolve(ADR_DIR, found), 'utf-8').toLowerCase();
    for (const term of ['keychain', 'aes', 'gcm']) {
      expect(src, `ADR ${found} must discuss '${term}'`).toContain(term);
    }
  });

  // qa-spec: S10 — migration strategy
  it('has an ADR describing the local-store migration strategy', () => {
    const found = findFirstMatching(/migration|store/i);
    expect(
      found,
      'expected docs/adr/000N-*.md whose filename mentions migration or store (per S10 + agent-plan Task 12)',
    ).not.toBeNull();
    if (found === null) return;
    const src = readFileSync(resolve(ADR_DIR, found), 'utf-8').toLowerCase();
    // The migration ADR must at least discuss forward-only or user_version.
    const mentionsForwardOnly = /forward[-\s]?only/i.test(src);
    const mentionsUserVersion = /user_version/i.test(src);
    expect(
      mentionsForwardOnly || mentionsUserVersion,
      `ADR ${found} must document the forward-only policy or the user_version scheme`,
    ).toBe(true);
  });
});
