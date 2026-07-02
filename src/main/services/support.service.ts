/**
 * `support.*` service — background apps and support tickets.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import type { TicketStatus } from '../db/dao/tickets.js';
import { errResult, makeError, okResult } from '../ipc/errors.js';
import type { ServiceContext } from './service-context.js';

interface AppRow {
  id: string;
  name: string;
  url: string | null;
  category: string | null;
  description: string | null;
}

export interface SupportService {
  listApps(): CoreServiceResult<{ apps: AppRow[] }>;
  getApp(input: { appId: string }): CoreServiceResult<AppRow>;
  listTickets(input: { status?: string }): CoreServiceResult<{ tickets: ReturnType<typeof mapTicket>[] }>;
  triageTicket(input: { ticketId: string; assigneeId?: string }): CoreServiceResult<{ ticketId: string; status: string }>;
  resolveTicket(input: { ticketId: string; resolution: string }): CoreServiceResult<{ ticketId: string; status: string }>;
}

function mapTicket(t: {
  id: string;
  projectId?: string | null;
  title: string;
  status: string;
  assigneeId?: string | null;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: t.id,
    projectId: t.projectId ?? null,
    title: t.title,
    status: t.status,
    assigneeId: t.assigneeId ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export function createSupportService(ctx: ServiceContext): SupportService {
  return {
    listApps: () => {
      const apps = ctx.store.db
        .prepare('SELECT id, name, url, category, description FROM apps ORDER BY name ASC')
        .all() as AppRow[];
      return okResult({ apps });
    },

    getApp: (input) => {
      const app = ctx.store.db
        .prepare('SELECT id, name, url, category, description FROM apps WHERE id = ?')
        .get(input.appId) as AppRow | undefined;
      if (app === undefined) {
        return errResult(makeError('not_found', `App not found: ${input.appId}`));
      }
      return okResult(app);
    },

    listTickets: (input) => {
      const tickets =
        input.status !== undefined
          ? ctx.store.ticketsDao.list(input.status as TicketStatus)
          : ctx.store.ticketsDao.list();
      return okResult({ tickets: tickets.map(mapTicket) });
    },

    triageTicket: (input) => {
      const ticket = ctx.store.ticketsDao.get(input.ticketId);
      if (ticket === undefined) {
        return errResult(makeError('not_found', `Ticket not found: ${input.ticketId}`));
      }
      const updated = ctx.store.ticketsDao.upsert({
        ...ticket,
        status: 'in_progress',
        assigneeId: input.assigneeId ?? ticket.assigneeId ?? null,
      });
      return okResult({ ticketId: updated.id, status: updated.status });
    },

    resolveTicket: (input) => {
      const ticket = ctx.store.ticketsDao.get(input.ticketId);
      if (ticket === undefined) {
        return errResult(makeError('not_found', `Ticket not found: ${input.ticketId}`));
      }
      const now = new Date().toISOString();
      const updated = ctx.store.ticketsDao.upsert({
        ...ticket,
        title: `${ticket.title} — ${input.resolution.slice(0, 80)}`,
        status: 'closed',
        updatedAt: now,
      });
      return okResult({ ticketId: updated.id, status: updated.status });
    },
  };
}
