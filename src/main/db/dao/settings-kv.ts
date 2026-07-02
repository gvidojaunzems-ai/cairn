/**
 * Key-value settings store backed by the `settings_kv` table.
 */
import type Database from 'better-sqlite3';

export interface SettingsKvDao {
  get(key: string): unknown | undefined;
  set(key: string, value: unknown): void;
  delete(key: string): boolean;
  list(): Record<string, unknown>;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createSettingsKvDao(db: Database.Database): SettingsKvDao {
  const getStmt = db.prepare<[string]>('SELECT value FROM settings_kv WHERE key = ?');
  const setStmt = db.prepare(
    `INSERT INTO settings_kv (key, value, updated_at) VALUES (@key, @value, @updatedAt)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  const deleteStmt = db.prepare<[string]>('DELETE FROM settings_kv WHERE key = ?');
  const listStmt = db.prepare('SELECT key, value FROM settings_kv');

  return {
    get(key: string): unknown | undefined {
      const row = getStmt.get(key) as { value: string } | undefined;
      if (row === undefined) {
        return undefined;
      }
      try {
        return JSON.parse(row.value) as unknown;
      } catch {
        return row.value;
      }
    },
    set(key: string, value: unknown): void {
      setStmt.run({ key, value: JSON.stringify(value), updatedAt: nowIso() });
    },
    delete(key: string): boolean {
      return deleteStmt.run(key).changes > 0;
    },
    list(): Record<string, unknown> {
      const rows = listStmt.all() as { key: string; value: string }[];
      const out: Record<string, unknown> = {};
      for (const row of rows) {
        try {
          out[row.key] = JSON.parse(row.value) as unknown;
        } catch {
          out[row.key] = row.value;
        }
      }
      return out;
    },
  };
}
