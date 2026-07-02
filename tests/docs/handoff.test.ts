// qa-spec: S11 — HANDOFF.md explains how to run/build/test + project locations.
// Covers AC-11.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HANDOFF = resolve(__dirname, '../../HANDOFF.md');

function load(): string {
  return readFileSync(HANDOFF, 'utf-8');
}

describe('HANDOFF.md — content (S11 / AC-11)', () => {
  // qa-spec: S11
  it('HANDOFF.md exists at repo root', () => {
    expect(existsSync(HANDOFF)).toBe(true);
  });

  // qa-spec: S11
  it('HANDOFF.md is at least 200 characters', () => {
    expect(load().length).toBeGreaterThanOrEqual(200);
  });

  // qa-spec: S11
  it('explains how to run in dev mode (pnpm dev)', () => {
    expect(load()).toMatch(/pnpm\s+dev/);
  });

  // qa-spec: S11
  it('explains how to build (pnpm build)', () => {
    expect(load()).toMatch(/pnpm\s+build/);
  });

  // qa-spec: S11
  it('explains how to run the test suite (pnpm test)', () => {
    expect(load()).toMatch(/pnpm\s+test/);
  });

  // qa-spec: S11
  it('references key project locations (src/, tests/, docs/)', () => {
    const src = load();
    expect(src).toMatch(/src\//);
    expect(src).toMatch(/tests\//);
    expect(src).toMatch(/docs\//);
  });

  // qa-spec: S11
  it('documents toolchain requirements (Node >= 20, pnpm >= 9)', () => {
    const src = load().toLowerCase();
    expect(src).toMatch(/node[^\n]{0,20}20/);
    expect(src).toMatch(/pnpm[^\n]{0,20}9/);
  });

  // qa-spec: S11
  it('mentions CI is dormant until repo is pushed (deviation-risk callout)', () => {
    const src = load().toLowerCase();
    expect(src).toMatch(/(dormant|until.{0,20}push|not yet.{0,20}github)/);
  });
});
