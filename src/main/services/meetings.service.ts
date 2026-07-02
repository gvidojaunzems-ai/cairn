/**
 * `meetings.*` service — meeting notes stubs.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { notImplementedResult } from '../ipc/errors.js';

export interface MeetingsService {
  list(): CoreServiceResult<never>;
  create(input: { title: string }): CoreServiceResult<never>;
}

export const meetingsService: MeetingsService = {
  list: () => notImplementedResult('meetings.list'),
  create: (_input) => notImplementedResult('meetings.create'),
};
