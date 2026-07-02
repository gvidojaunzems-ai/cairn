// qa-spec: S9 — docs/architecture/service-api.md exists and contains all
// 16 namespace names, all 10 event names, and a non-empty apiVersion.
//
// The doc is authoritative reference material — it's the developer's
// map of the IPC surface, so drift between what the code exports and
// what the doc says is a documentation bug. The tests compare against
// the shared descriptor layer so no name is hardcoded twice.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { OP_NAMESPACE_NAMES } from '../../src/shared/ipc/operations';
import { EVENT_NAMES } from '../../src/shared/ipc/events';
import { API_VERSION } from '../../src/shared/ipc/api-version';

const SERVICE_API_PATH = resolve(
  __dirname,
  '../../docs/architecture/service-api.md',
);

function load(): string {
  return readFileSync(SERVICE_API_PATH, 'utf-8');
}

describe('docs/architecture/service-api.md (S9)', () => {
  // qa-spec: S9
  it('exists at docs/architecture/service-api.md', () => {
    expect(
      existsSync(SERVICE_API_PATH),
      `expected ${SERVICE_API_PATH} to exist`,
    ).toBe(true);
  });

  // qa-spec: S9 — every namespace name appears verbatim
  it.each(OP_NAMESPACE_NAMES as readonly string[])(
    'documents namespace: %s',
    (namespace) => {
      const src = load();
      expect(src).toContain(namespace);
    },
  );

  // qa-spec: S9 — every event name appears verbatim
  it.each(EVENT_NAMES as readonly string[])(
    'documents event: %s',
    (event) => {
      const src = load();
      expect(src).toContain(event);
    },
  );

  // qa-spec: S9 — the current apiVersion appears (with the label "apiVersion").
  it('mentions apiVersion with a non-empty version value', () => {
    const src = load();
    expect(/apiVersion/i.test(src)).toBe(true);
    // Assert the actual runtime constant appears somewhere in the doc so
    // drift between code and doc surfaces immediately.
    expect(src).toContain(API_VERSION);
  });

  // qa-spec: S9 — the doc is non-empty (not a placeholder)
  it('the doc body is at least 500 characters (not a placeholder stub)', () => {
    const src = load();
    expect(src.length).toBeGreaterThan(500);
  });
});
