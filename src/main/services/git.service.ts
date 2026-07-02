/**
 * `git.*` service — local git repository operations. Stubbed until the
 * git integration task lands.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { notImplementedResult } from '../ipc/errors.js';

export interface GitService {
  list(): CoreServiceResult<never>;
  status(input: { repoId: string }): CoreServiceResult<never>;
}

export const gitService: GitService = {
  list: () => notImplementedResult('git.list'),
  status: (_input) => notImplementedResult('git.status'),
};
