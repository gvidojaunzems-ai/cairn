/**
 * Test helper — open an isolated `cairn.db` under a temp directory.
 * Runs the full migration chain (including vec0) so behaviour matches production.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DB_FILE_NAME } from '../../src/main/db/schema';
import { openStore, type LocalStoreHandle } from '../../src/main/db/store';

export function openTestStore(prefix = 'cairn-test-'): {
  store: LocalStoreHandle;
  dir: string;
} {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const store = openStore({
    dataDir: dir,
    fileName: DB_FILE_NAME,
  });
  return { store, dir };
}

/** Safe teardown when beforeEach may have failed before `store` was assigned. */
export function closeTestStore(
  store: LocalStoreHandle | undefined,
  dir: string | undefined,
): void {
  try {
    store?.close();
  } catch {
    // ignore — DB may not have opened
  }
  if (dir !== undefined) {
    rmSync(dir, { recursive: true, force: true });
  }
}
