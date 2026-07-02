/**
 * `dailies.*` service — standup pack and WIP radar.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { errResult, makeError, okResult } from '../ipc/errors.js';
import type { ServiceContext } from './service-context.js';

interface ActionItemRow {
  id: string;
  meeting_id: string | null;
  owner_id: string | null;
  description: string;
  status: string;
  due_date: string | null;
}

export interface DailiesService {
  getPack(input: { date?: string }): CoreServiceResult<{
    date: string;
    updates: { person: string; yesterday: string; today: string; blockers: string }[];
  }>;
  getWipRadar(): CoreServiceResult<{
    items: { person: string; summary: string; unpushedDays: number; status: string }[];
  }>;
  listActionItems(): CoreServiceResult<{ items: ActionItemRow[] }>;
  setActionItem(input: { id: string; status: string }): CoreServiceResult<{ id: string; status: string }>;
  nudgeUnpushed(input: { personId: string }): CoreServiceResult<{ nudged: boolean }>;
}

export function createDailiesService(ctx: ServiceContext): DailiesService {
  return {
    getPack: (input) => {
      const people = ctx.store.peopleDao.list();
      return okResult({
        date: input.date ?? new Date().toISOString().slice(0, 10),
        updates: people.map((p, i) => ({
          person: p.name,
          yesterday: 'Progress on assigned PoC tasks.',
          today: i % 2 === 0 ? 'Continue feature work' : 'Review PRs and standup',
          blockers: i === 2 ? 'Waiting on design review' : 'None',
        })),
      });
    },

    getWipRadar: () => {
      const people = ctx.store.peopleDao.list();
      const signals = ctx.store.wipSignalsDao.list('active');
      return okResult({
        items: signals.map((s, i) => ({
          person: people[i % people.length]?.name ?? 'Unknown',
          summary: s.summary,
          unpushedDays: (i % 4) + 1,
          status: s.status,
        })),
      });
    },

    listActionItems: () => {
      const items = ctx.store.db
        .prepare('SELECT id, meeting_id, owner_id, description, status, due_date FROM action_items ORDER BY created_at DESC')
        .all() as ActionItemRow[];
      return okResult({ items });
    },

    setActionItem: (input) => {
      const existing = ctx.store.db
        .prepare('SELECT id FROM action_items WHERE id = ?')
        .get(input.id) as { id: string } | undefined;
      if (existing === undefined) {
        return errResult(makeError('not_found', `Action item not found: ${input.id}`));
      }
      const ts = new Date().toISOString();
      ctx.store.db
        .prepare('UPDATE action_items SET status = ?, updated_at = ? WHERE id = ?')
        .run(input.status, ts, input.id);
      return okResult({ id: input.id, status: input.status });
    },

    nudgeUnpushed: (input) => {
      const person = ctx.store.peopleDao.get(input.personId);
      if (person === undefined) {
        return errResult(makeError('not_found', `Person not found: ${input.personId}`));
      }
      ctx.eventBus.emit('toast', {
        level: 'info',
        message: `Nudge sent to ${person.name} about unpushed work`,
      });
      return okResult({ nudged: true });
    },
  };
}
