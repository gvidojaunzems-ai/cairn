/**
 * Test helper — open an isolated `cairn.db` under a temp directory.
 * Skips sqlite-vec so job-focused suites do not require the extension.
 */
import { mkdtempSync } from 'node:fs';
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
    skipSqliteVec: true,
  });
  return { store, dir };
}
