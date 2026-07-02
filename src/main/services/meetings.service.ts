/**
 * `meetings.*` service — meeting listener session management.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { errResult, makeError, okResult } from '../ipc/errors.js';
import type { ServiceContext } from './service-context.js';

let activeMeetingId: string | null = null;

export interface MeetingsService {
  start(input: { title: string; consent: boolean; projectId?: string }): CoreServiceResult<{ id: string; title: string; recording: boolean }>;
  stop(): CoreServiceResult<{ id: string; summary: string }>;
  getLive(): CoreServiceResult<{ session: unknown | null }>;
  getProposals(input: { meetingId: string }): CoreServiceResult<{ items: unknown[] }>;
  applyProposal(input: { meetingId: string; proposalId: string }): CoreServiceResult<{ applied: boolean }>;
  applyAll(input: { meetingId: string }): CoreServiceResult<{ applied: number }>;
  get(input: { meetingId: string }): CoreServiceResult<{ meeting: unknown | null }>;
}

export function createMeetingsService(ctx: ServiceContext): MeetingsService {
  return {
    start: (input) => {
      if (!input.consent) {
        return errResult(makeError('forbidden', 'Recording requires explicit consent for this session'));
      }
      const session = ctx.meetingEngine.start(input.title, input.projectId);
      activeMeetingId = session.id;
      return okResult({ id: session.id, title: session.title, recording: session.recording });
    },
    stop: () => {
      if (activeMeetingId === null) {
        return errResult(makeError('not_found', 'No active meeting session'));
      }
      const result = ctx.meetingEngine.stop(activeMeetingId);
      if (result.ok) activeMeetingId = null;
      return result;
    },
    getLive: () => {
      const session = activeMeetingId !== null ? ctx.meetingEngine.getLive(activeMeetingId) : null;
      return okResult({ session });
    },
    getProposals: (input) => okResult({ items: ctx.meetingEngine.getProposals(input.meetingId) }),
    applyProposal: (input) => ctx.meetingEngine.applyProposal(input.meetingId, input.proposalId),
    applyAll: (input) => ctx.meetingEngine.applyAll(input.meetingId),
    get: (input) => {
      const meeting = ctx.store.meetingsDao.get(input.meetingId) ?? null;
      return okResult({ meeting });
    },
  };
}
