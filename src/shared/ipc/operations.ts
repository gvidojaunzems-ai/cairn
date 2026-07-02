/**
 * IPC operation descriptors — Spec 03 canonical catalog (ADR 0007).
 */
export interface IpcOperation<_Req, _Res> {
  readonly __req?: _Req;
  readonly __res?: _Res;
}

export const OP_NAMESPACE_NAMES = [
  'system',
  'setup',
  'git',
  'projects',
  'today',
  'dailies',
  'news',
  'search',
  'docs',
  'meetings',
  'reports',
  'pulse',
  'support',
  'settings',
  'ai',
  'jobs',
] as const;

export type NamespaceName = (typeof OP_NAMESPACE_NAMES)[number];

export interface EmptyInput {
  /* intentionally empty */
}

export interface SystemStatus {
  ready: boolean;
}

export interface JobHandle {
  jobId: string;
}

export interface JobIdInput {
  jobId: string;
}

export interface StartJobInput {
  kind: string;
  input?: unknown;
}

export interface SystemOps {
  getStatus: IpcOperation<EmptyInput, SystemStatus>;
  getFlags: IpcOperation<EmptyInput, { flags: Record<string, boolean> }>;
  getPaths: IpcOperation<EmptyInput, { data: string; teamRepo: string; logs: string }>;
  openExternal: IpcOperation<{ url: string }, { opened: boolean }>;
}

export interface SetupOps {
  getState: IpcOperation<EmptyInput, unknown>;
  run: IpcOperation<{ step?: string }, { jobId: string }>;
  cancel: IpcOperation<EmptyInput, { cancelled: boolean }>;
}

export interface GitOps {
  getSyncState: IpcOperation<EmptyInput, unknown>;
  pull: IpcOperation<EmptyInput, unknown>;
  push: IpcOperation<EmptyInput, unknown>;
  listLocalRepos: IpcOperation<EmptyInput, unknown>;
  addLocalRepo: IpcOperation<{ path: string }, unknown>;
}

export interface ProjectsOps {
  list: IpcOperation<EmptyInput, unknown>;
  get: IpcOperation<{ projectId: string }, unknown>;
  create: IpcOperation<{ name: string; description?: string }, unknown>;
  updateCharter: IpcOperation<{ projectId: string; charter: unknown }, unknown>;
  setStatus: IpcOperation<{ projectId: string; status: string }, unknown>;
  archive: IpcOperation<{ projectId: string }, unknown>;
  generateRetro: IpcOperation<{ projectId: string }, unknown>;
}

export interface TodayOps {
  getDashboard: IpcOperation<EmptyInput, unknown>;
  getContextResume: IpcOperation<EmptyInput, unknown>;
  getStandupDraft: IpcOperation<EmptyInput, unknown>;
  approveStandup: IpcOperation<EmptyInput, unknown>;
  regenerateStandup: IpcOperation<EmptyInput, unknown>;
}

export interface DailiesOps {
  getPack: IpcOperation<{ date?: string }, unknown>;
  getWipRadar: IpcOperation<EmptyInput, unknown>;
  listActionItems: IpcOperation<EmptyInput, unknown>;
  setActionItem: IpcOperation<{ id: string; status: string }, unknown>;
  nudgeUnpushed: IpcOperation<{ personId: string }, unknown>;
}

export interface NewsOps {
  listFeed: IpcOperation<{ topic?: string; source?: string }, unknown>;
  getItem: IpcOperation<{ itemId: string }, unknown>;
  save: IpcOperation<{ itemId: string }, unknown>;
  listKnowledge: IpcOperation<EmptyInput, unknown>;
}

export interface SearchOps {
  query: IpcOperation<{ q: string; limit?: number }, unknown>;
  askDocs: IpcOperation<{ q: string; docIds?: string[] }, unknown>;
}

export interface DocsOps {
  tree: IpcOperation<EmptyInput, unknown>;
  get: IpcOperation<{ docId: string }, unknown>;
  create: IpcOperation<{ title: string; group: string; body?: string }, unknown>;
  save: IpcOperation<{ docId: string; body: string; title?: string }, unknown>;
  syncRepos: IpcOperation<EmptyInput, { jobId: string }>;
  listDrafts: IpcOperation<EmptyInput, unknown>;
}

export interface MeetingsOps {
  start: IpcOperation<{ title: string; consent: boolean }, unknown>;
  stop: IpcOperation<EmptyInput, unknown>;
  getLive: IpcOperation<EmptyInput, unknown>;
  getProposals: IpcOperation<{ meetingId: string }, unknown>;
  applyProposal: IpcOperation<{ meetingId: string; proposalId: string }, unknown>;
  applyAll: IpcOperation<{ meetingId: string }, unknown>;
  get: IpcOperation<{ meetingId: string }, unknown>;
}

export interface ReportsOps {
  templates: IpcOperation<EmptyInput, unknown>;
  generate: IpcOperation<{ kind: string; external?: boolean }, unknown>;
  export: IpcOperation<{ reportId: string; format: 'md' | 'docx' | 'pdf' }, unknown>;
  pushToRepo: IpcOperation<{ reportId: string }, unknown>;
}

export interface PulseOps {
  get: IpcOperation<EmptyInput, unknown>;
  generateWeeklyDigest: IpcOperation<EmptyInput, { jobId: string }>;
}

export interface SupportOps {
  listApps: IpcOperation<EmptyInput, unknown>;
  getApp: IpcOperation<{ appId: string }, unknown>;
  listTickets: IpcOperation<{ status?: string }, unknown>;
  triageTicket: IpcOperation<{ ticketId: string; assigneeId?: string }, unknown>;
  resolveTicket: IpcOperation<{ ticketId: string; resolution: string }, unknown>;
}

export interface SettingsOps {
  get: IpcOperation<EmptyInput, unknown>;
  set: IpcOperation<{ key: string; value: unknown }, unknown>;
  testConnector: IpcOperation<{ connector: string }, unknown>;
  getBudget: IpcOperation<EmptyInput, unknown>;
}

export interface AiOps {
  complete: IpcOperation<{ taskType: string; inputs: unknown; qualityTier?: string; external?: boolean }, unknown>;
  estimate: IpcOperation<{ taskType: string; inputs: unknown }, unknown>;
  listModels: IpcOperation<EmptyInput, unknown>;
  getBudget: IpcOperation<EmptyInput, unknown>;
}

export interface JobsOps {
  start: IpcOperation<StartJobInput, JobHandle>;
  cancel: IpcOperation<JobIdInput, EmptyInput>;
  status: IpcOperation<JobIdInput, unknown>;
}

export interface Namespaces {
  system: SystemOps;
  setup: SetupOps;
  git: GitOps;
  projects: ProjectsOps;
  today: TodayOps;
  dailies: DailiesOps;
  news: NewsOps;
  search: SearchOps;
  docs: DocsOps;
  meetings: MeetingsOps;
  reports: ReportsOps;
  pulse: PulseOps;
  support: SupportOps;
  settings: SettingsOps;
  ai: AiOps;
  jobs: JobsOps;
}

export type OpsFor<N extends NamespaceName> = Namespaces[N];
export type OpName<N extends NamespaceName> = keyof OpsFor<N> & string;

export const OP_NAMESPACES: {
  readonly [N in NamespaceName]: readonly (keyof Namespaces[N] & string)[];
} = {
  system: ['getStatus', 'getFlags', 'getPaths', 'openExternal'],
  setup: ['getState', 'run', 'cancel'],
  git: ['getSyncState', 'pull', 'push', 'listLocalRepos', 'addLocalRepo'],
  projects: ['list', 'get', 'create', 'updateCharter', 'setStatus', 'archive', 'generateRetro'],
  today: ['getDashboard', 'getContextResume', 'getStandupDraft', 'approveStandup', 'regenerateStandup'],
  dailies: ['getPack', 'getWipRadar', 'listActionItems', 'setActionItem', 'nudgeUnpushed'],
  news: ['listFeed', 'getItem', 'save', 'listKnowledge'],
  search: ['query', 'askDocs'],
  docs: ['tree', 'get', 'create', 'save', 'syncRepos', 'listDrafts'],
  meetings: ['start', 'stop', 'getLive', 'getProposals', 'applyProposal', 'applyAll', 'get'],
  reports: ['templates', 'generate', 'export', 'pushToRepo'],
  pulse: ['get', 'generateWeeklyDigest'],
  support: ['listApps', 'getApp', 'listTickets', 'triageTicket', 'resolveTicket'],
  settings: ['get', 'set', 'testConnector', 'getBudget'],
  ai: ['complete', 'estimate', 'listModels', 'getBudget'],
  jobs: ['start', 'cancel', 'status'],
};

export type QualifiedOpId = `${NamespaceName}.${string}`;

export function qualifyOp<N extends NamespaceName>(namespace: N, op: OpName<N>): QualifiedOpId {
  return `${namespace}.${op}` as QualifiedOpId;
}
