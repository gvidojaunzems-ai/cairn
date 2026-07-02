/**
 * DAO for the `meetings` and `action_items` tables.
 */
import type Database from 'better-sqlite3';

import type { RowMeta } from '../schema.js';

export interface Meeting extends RowMeta {
  projectId?: string | null;
  title: string;
  attendeeIds: string[];
  agenda?: string | null;
  outcome?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
}

export type ActionItemStatus = 'open' | 'in_progress' | 'done' | 'cancelled';

export interface ActionItem extends RowMeta {
  meetingId?: string | null;
  ownerId?: string | null;
  description: string;
  status: ActionItemStatus;
  dueDate?: string | null;
}

interface MeetingRow {
  id: string;
  project_id: string | null;
  title: string;
  attendee_ids: string;
  agenda: string | null;
  outcome: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ActionItemRow {
  id: string;
  meeting_id: string | null;
  owner_id: string | null;
  description: string;
  status: ActionItemStatus;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function rowToMeeting(row: MeetingRow): Meeting {
  let attendeeIds: string[] = [];
  try {
    attendeeIds = JSON.parse(row.attendee_ids) as string[];
  } catch {
    attendeeIds = [];
  }
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    attendeeIds,
    agenda: row.agenda,
    outcome: row.outcome,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToActionItem(row: ActionItemRow): ActionItem {
  return {
    id: row.id,
    meetingId: row.meeting_id,
    ownerId: row.owner_id,
    description: row.description,
    status: row.status,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface MeetingsDao {
  upsert(meeting: Meeting): Meeting;
  get(id: string): Meeting | undefined;
  list(projectId?: string): Meeting[];
  delete(id: string): boolean;
  upsertActionItem(item: ActionItem): ActionItem;
  listActionItems(meetingId?: string): ActionItem[];
}

export function createMeetingsDao(db: Database.Database): MeetingsDao {
  const upsertMeetingStmt = db.prepare(
    `INSERT INTO meetings (id, project_id, title, attendee_ids, agenda, outcome, started_at, ended_at, created_at, updated_at)
     VALUES (@id, @projectId, @title, @attendeeIds, @agenda, @outcome, @startedAt, @endedAt, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       project_id = excluded.project_id,
       title = excluded.title,
       attendee_ids = excluded.attendee_ids,
       agenda = excluded.agenda,
       outcome = excluded.outcome,
       started_at = excluded.started_at,
       ended_at = excluded.ended_at,
       updated_at = excluded.updated_at`,
  );
  const getMeetingStmt = db.prepare<[string]>('SELECT * FROM meetings WHERE id = ?');
  const listMeetingsStmt = db.prepare('SELECT * FROM meetings ORDER BY started_at DESC');
  const listMeetingsByProjectStmt = db.prepare<[string]>(
    'SELECT * FROM meetings WHERE project_id = ? ORDER BY started_at DESC',
  );
  const deleteMeetingStmt = db.prepare<[string]>('DELETE FROM meetings WHERE id = ?');

  const upsertActionStmt = db.prepare(
    `INSERT INTO action_items (id, meeting_id, owner_id, description, status, due_date, created_at, updated_at)
     VALUES (@id, @meetingId, @ownerId, @description, @status, @dueDate, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       meeting_id = excluded.meeting_id,
       owner_id = excluded.owner_id,
       description = excluded.description,
       status = excluded.status,
       due_date = excluded.due_date,
       updated_at = excluded.updated_at`,
  );
  const listActionsStmt = db.prepare('SELECT * FROM action_items ORDER BY created_at DESC');
  const listActionsByMeetingStmt = db.prepare<[string]>(
    'SELECT * FROM action_items WHERE meeting_id = ? ORDER BY created_at DESC',
  );

  return {
    upsert(meeting: Meeting): Meeting {
      const now = nowIso();
      const createdAt = meeting.createdAt.length > 0 ? meeting.createdAt : now;
      const updatedAt = now;
      upsertMeetingStmt.run({
        id: meeting.id,
        projectId: meeting.projectId ?? null,
        title: meeting.title,
        attendeeIds: JSON.stringify(meeting.attendeeIds),
        agenda: meeting.agenda ?? null,
        outcome: meeting.outcome ?? null,
        startedAt: meeting.startedAt ?? null,
        endedAt: meeting.endedAt ?? null,
        createdAt,
        updatedAt,
      });
      return { ...meeting, createdAt, updatedAt };
    },
    get(id: string): Meeting | undefined {
      const row = getMeetingStmt.get(id) as MeetingRow | undefined;
      return row === undefined ? undefined : rowToMeeting(row);
    },
    list(projectId?: string): Meeting[] {
      const rows =
        projectId === undefined
          ? (listMeetingsStmt.all() as MeetingRow[])
          : (listMeetingsByProjectStmt.all(projectId) as MeetingRow[]);
      return rows.map(rowToMeeting);
    },
    delete(id: string): boolean {
      return deleteMeetingStmt.run(id).changes > 0;
    },
    upsertActionItem(item: ActionItem): ActionItem {
      const now = nowIso();
      const createdAt = item.createdAt.length > 0 ? item.createdAt : now;
      const updatedAt = now;
      upsertActionStmt.run({
        id: item.id,
        meetingId: item.meetingId ?? null,
        ownerId: item.ownerId ?? null,
        description: item.description,
        status: item.status,
        dueDate: item.dueDate ?? null,
        createdAt,
        updatedAt,
      });
      return { ...item, createdAt, updatedAt };
    },
    listActionItems(meetingId?: string): ActionItem[] {
      const rows =
        meetingId === undefined
          ? (listActionsStmt.all() as ActionItemRow[])
          : (listActionsByMeetingStmt.all(meetingId) as ActionItemRow[]);
      return rows.map(rowToActionItem);
    },
  };
}
