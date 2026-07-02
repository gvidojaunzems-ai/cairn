// qa-spec: S10 — CoreServiceResult<T> typed error extension compiles cleanly
// and an ADR documents the change.
//
// Asserts:
//   * The typed error taxonomy (`CoreServiceErrorCode`) enumerates the seven
//     required codes.
//   * The discriminated union carries `{code, message, details?}` on the
//     error arm and `{data, apiVersion}` on the ok arm.
//   * `docs/adr/0003-core-service-result-typed-errors.md` exists (or a
//     similarly-named ADR under docs/adr/ mentioning the extension).
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type {
  CoreServiceError,
  CoreServiceErrorCode,
  CoreServiceResult,
  CoreServiceOk,
  CoreServiceErr,
} from '../../src/contracts/core-service.contract';

const CONTRACT_FILE = resolve(
  __dirname,
  '../../src/contracts/core-service.contract.ts',
);
const ADR_DIR = resolve(__dirname, '../../docs/adr');

/** Every code required by ADR 0003. */
const REQUIRED_CODES: readonly CoreServiceErrorCode[] = [
  'validation_error',
  'not_found',
  'conflict',
  'unavailable',
  'forbidden',
  'internal',
  'not_implemented',
];

describe('core-service.contract — typed error extension (S10)', () => {
  // qa-spec: S10 — every documented code compiles against the taxonomy union.
  it.each(REQUIRED_CODES)('CoreServiceErrorCode accepts %s', (code) => {
    const value: CoreServiceErrorCode = code;
    expect(typeof value).toBe('string');
  });

  // qa-spec: S10 — success arm carries data + apiVersion (not the legacy
  // `error` string shape).
  it('CoreServiceOk<T> has {ok:true, data, apiVersion}', () => {
    const ok: CoreServiceOk<{ x: number }> = {
      ok: true,
      data: { x: 1 },
      apiVersion: '1.0.0',
    };
    expect(ok.ok).toBe(true);
    expect(ok.data.x).toBe(1);
    expect(typeof ok.apiVersion).toBe('string');
    expect(ok.apiVersion.length).toBeGreaterThan(0);
  });

  // qa-spec: S10 — failure arm carries a typed CoreServiceError.
  it('CoreServiceErr has {ok:false, error:{code,message}, apiVersion}', () => {
    const err: CoreServiceErr = {
      ok: false,
      error: { code: 'validation_error', message: 'boom' },
      apiVersion: '1.0.0',
    };
    expect(err.ok).toBe(false);
    expect(err.error.code).toBe('validation_error');
    expect(err.error.message).toBe('boom');
  });

  // qa-spec: S10 — CoreServiceResult<T> narrows on the `ok` discriminant.
  it('CoreServiceResult<T> narrows exhaustively on ok', () => {
    function unwrap<T>(r: CoreServiceResult<T>): string {
      if (r.ok) {
        return 'ok';
      }
      // In the false arm the discriminant guarantees `.error` exists.
      const err: CoreServiceError = r.error;
      return err.code;
    }
    expect(unwrap({ ok: true, data: 1, apiVersion: '1.0.0' })).toBe('ok');
    expect(
      unwrap({
        ok: false,
        error: { code: 'not_implemented', message: '' },
        apiVersion: '1.0.0',
      }),
    ).toBe('not_implemented');
  });

  // qa-spec: S10 — contract file source still carries the DO NOT MODIFY warning.
  it('core-service.contract.ts still warns against unversioned changes', () => {
    const src = readFileSync(CONTRACT_FILE, 'utf-8').slice(0, 800);
    expect(/adr/i.test(src) || /versioning/i.test(src)).toBe(true);
    expect(/(do not|never)\s+(modify|change|break|mutate)/i.test(src)).toBe(true);
  });
});

describe('docs/adr — 0003 CoreServiceResult typed errors (S10)', () => {
  // qa-spec: S10
  it('an ADR under docs/adr/ documents the typed-error extension', () => {
    expect(existsSync(ADR_DIR)).toBe(true);
    const adrs = readdirSync(ADR_DIR).filter((f) => f.endsWith('.md'));
    // Look for a file whose name references the extension.
    const match = adrs.find(
      (name) =>
        /core-?service/i.test(name) ||
        /typed-?error/i.test(name) ||
        /error-?taxonomy/i.test(name) ||
        /0006/.test(name),
    );
    expect(match, `no ADR mentioning the typed-error extension in ${adrs.join(', ')}`).toBeDefined();
    if (match !== undefined) {
      const src = readFileSync(resolve(ADR_DIR, match), 'utf-8').toLowerCase();
      // The document should mention CoreServiceResult and at least one code.
      expect(src).toContain('coreserviceresult');
    }
  });
});
