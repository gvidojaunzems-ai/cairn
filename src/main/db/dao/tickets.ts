/**
 * DAO for the `tickets` table.
 *
 * Business rules:
 *   - `status` mirrors the CHECK constraint at the DB level so the caller
 *     sees invalid values at compile time AND row time.
 */
import type Database from 'better-sqlite3';

import type { RowMeta } from '../schema.js';

export type TicketStatus = 'open' | 'in_progress' | 'blocked' | 'done' | 'closed';

export interface Ticket extends RowMeta {
  projectId?: string | null;
  externalId?: string | null;
  title: string;
  status: TicketStatus;
  assigneeId?: string | null;
  url?: string | null;
}

interface TicketRow {
  id: string;
  project_id: string | null;
  external_id: string | null;
  title: string;
  status: TicketStatus;
  assignee_id: string | null;
  url: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    projectId: row.project_id,
    externalId: row.external_id,
    title: row.title,
    status: row.status,
    assigneeId: row.assignee_id,
    url: row.url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface TicketsDao {
  upsert(ticket: Ticket): Ticket;
  get(id: string): Ticket | undefined;
  list(status?: TicketStatus): Ticket[];
  delete(id: string): boolean;
}

export function createTicketsDao(db: Database.Database): TicketsDao {
  const upsertStmt = db.prepare(
    `INSERT INTO tickets (id, project_id, external_id, title, status, assignee_id, url, created_at, updated_at)
     VALUES (@id, @projectId, @externalId, @title, @status, @assigneeId, @url, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       project_id = excluded.project_id,
       external_id = excluded.external_id,
       title = excluded.title,
       status = excluded.status,
       assignee_id = excluded.assignee_id,
       url = excluded.url,
       updated_at = excluded.updated_at`,
  );
  const getStmt = db.prepare<[string]>('SELECT * FROM tickets WHERE id = ?');
  const listAllStmt = db.prepare('SELECT * FROM tickets ORDER BY updated_at DESC');
  const listByStatusStmt = db.prepare<[TicketStatus]>(
    'SELECT * FROM tickets WHERE status = ? ORDER BY updated_at DESC',
  );
  const deleteStmt = db.prepare<[string]>('DELETE FROM tickets WHERE id = ?');

  return {
    upsert(ticket: Ticket): Ticket {
      const now = nowIso();
      const createdAt = ticket.createdAt.length > 0 ? ticket.createdAt : now;
      const updatedAt = now;
      upsertStmt.run({
        id: ticket.id,
        projectId: ticket.projectId ?? null,
        externalId: ticket.externalId ?? null,
        title: ticket.title,
        status: ticket.status,
        assigneeId: ticket.assigneeId ?? null,
        url: ticket.url ?? null,
        createdAt,
        updatedAt,
      });
      return { ...ticket, createdAt, updatedAt };
    },
    get(id: string): Ticket | undefined {
      const row = getStmt.get(id) as TicketRow | undefined;
      return row === undefined ? undefined : rowToTicket(row);
    },
    list(status?: TicketStatus): Ticket[] {
      const rows =
        status === undefined
          ? (listAllStmt.all() as TicketRow[])
          : (listByStatusStmt.all(status) as TicketRow[]);
      return rows.map(rowToTicket);
    },
    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },
  };
}
