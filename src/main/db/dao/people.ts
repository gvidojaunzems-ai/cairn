/**
 * DAO for the `people` table.
 *
 * Business rules:
 *   - `status` is constrained by CHECK at the DB layer to
 *     'active' | 'inactive' | 'archived'. The TS union mirrors this so
 *     invalid values fail at the type layer AND at the row layer.
 *   - `bulkUpsert` runs inside a single transaction and honours an
 *     AbortSignal — long imports must stay cancellable to protect the
 *     100 ms UI-ack budget.
 */
import type Database from 'better-sqlite3';

import type { RowMeta } from '../schema.js';

export type PersonStatus = 'active' | 'inactive' | 'archived';

export interface Person extends RowMeta {
  name: string;
  role?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  status: PersonStatus;
}

interface PersonRow {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  avatar_url: string | null;
  status: PersonStatus;
  created_at: string;
  updated_at: string;
}

function rowToPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    avatarUrl: row.avatar_url,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface PeopleDao {
  upsert(person: Person): Person;
  get(id: string): Person | undefined;
  list(status?: PersonStatus): Person[];
  delete(id: string): boolean;
  bulkUpsert(people: readonly Person[], signal?: AbortSignal): number;
}

export function createPeopleDao(db: Database.Database): PeopleDao {
  const upsertStmt = db.prepare(
    `INSERT INTO people (id, name, role, email, avatar_url, status, created_at, updated_at)
     VALUES (@id, @name, @role, @email, @avatarUrl, @status, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       role = excluded.role,
       email = excluded.email,
       avatar_url = excluded.avatar_url,
       status = excluded.status,
       updated_at = excluded.updated_at`,
  );
  const getStmt = db.prepare<[string]>('SELECT * FROM people WHERE id = ?');
  const listAllStmt = db.prepare('SELECT * FROM people ORDER BY name ASC');
  const listByStatusStmt = db.prepare<[PersonStatus]>(
    'SELECT * FROM people WHERE status = ? ORDER BY name ASC',
  );
  const deleteStmt = db.prepare<[string]>('DELETE FROM people WHERE id = ?');

  function upsert(person: Person): Person {
    const now = nowIso();
    const createdAt = person.createdAt.length > 0 ? person.createdAt : now;
    const updatedAt = now;
    upsertStmt.run({
      id: person.id,
      name: person.name,
      role: person.role ?? null,
      email: person.email ?? null,
      avatarUrl: person.avatarUrl ?? null,
      status: person.status,
      createdAt,
      updatedAt,
    });
    return { ...person, createdAt, updatedAt };
  }

  function bulkUpsert(people: readonly Person[], signal?: AbortSignal): number {
    let count = 0;
    const apply = db.transaction((batch: readonly Person[]) => {
      for (const person of batch) {
        if (signal?.aborted === true) {
          throw signal.reason instanceof Error ? signal.reason : new Error('aborted');
        }
        upsert(person);
        count += 1;
      }
    });
    apply(people);
    return count;
  }

  return {
    upsert,
    get(id: string): Person | undefined {
      const row = getStmt.get(id) as PersonRow | undefined;
      return row === undefined ? undefined : rowToPerson(row);
    },
    list(status?: PersonStatus): Person[] {
      const rows =
        status === undefined
          ? (listAllStmt.all() as PersonRow[])
          : (listByStatusStmt.all(status) as PersonRow[]);
      return rows.map(rowToPerson);
    },
    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },
    bulkUpsert,
  };
}
