/**
 * `git.*` service — team repo sync and local repo listing.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { okResult } from '../ipc/errors.js';
import type { ServiceContext } from './service-context.js';

export interface GitService {
  getSyncState(): CoreServiceResult<ReturnType<ServiceContext['teamRepoEngine']['getSyncState']>>;
  pull(): CoreServiceResult<ReturnType<ServiceContext['teamRepoEngine']['getSyncState']>>;
  push(): CoreServiceResult<ReturnType<ServiceContext['teamRepoEngine']['getSyncState']>>;
  listLocalRepos(): CoreServiceResult<{ repos: ReturnType<ServiceContext['teamRepoEngine']['listLocalRepos']> }>;
  addLocalRepo(input: { path: string; name?: string }): CoreServiceResult<{ repo: ReturnType<ServiceContext['teamRepoEngine']['addLocalRepo']> }>;
}

export function createGitService(ctx: ServiceContext): GitService {
  return {
    getSyncState: () => okResult(ctx.teamRepoEngine.getSyncState()),
    pull: () => {
      const state = ctx.teamRepoEngine.pull();
      ctx.eventBus.emit('sync.updated', { entityTypes: ['team-repo'], at: new Date().toISOString() });
      return okResult(state);
    },
    push: () => okResult(ctx.teamRepoEngine.push()),
    listLocalRepos: () => okResult({ repos: ctx.teamRepoEngine.listLocalRepos() }),
    addLocalRepo: (input) => okResult({ repo: ctx.teamRepoEngine.addLocalRepo(input.path, input.name) }),
  };
}

export function gitPull(ctx: ServiceContext): ReturnType<ServiceContext['teamRepoEngine']['getSyncState']> {
  const state = ctx.teamRepoEngine.pull();
  ctx.eventBus.emit('sync.updated', { entityTypes: ['team-repo'], at: new Date().toISOString() });
  return state;
}

export function gitPush(ctx: ServiceContext, message?: string): ReturnType<ServiceContext['teamRepoEngine']['getSyncState']> {
  return ctx.teamRepoEngine.push(message);
}
