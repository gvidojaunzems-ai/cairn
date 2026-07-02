import Database from 'better-sqlite3';

/** True when better-sqlite3 native bindings load for the current Node ABI. */
export function nativeDbAvailable(): boolean {
  try {
    const db = new Database(':memory:');
    db.close();
    return true;
  } catch {
    return false;
  }
}

/** Vitest describe that skips when native DB bindings are unavailable. */
export const describeDb = nativeDbAvailable() ? describe : describe.skip;
