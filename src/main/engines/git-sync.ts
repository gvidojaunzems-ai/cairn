/**
 * Git sync engine — re-exports from team-repo-engine for backward compatibility.
 */
export {
  createTeamRepoEngine,
  listLocalRepos,
  markSynced,
  readSyncState,
  validateSignalPrivacy,
  type LocalRepoEntry,
  type SyncStateView,
  type SyncStatus,
  type TeamRepoEngine,
} from './team-repo-engine.js';
