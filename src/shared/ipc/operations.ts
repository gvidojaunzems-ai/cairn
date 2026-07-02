/**
 * IPC operation descriptors — the closed set of namespaces and per-namespace
 * operations exposed by the core service to the renderer.
 *
 * Business rules:
 *   - Exactly sixteen (16) namespaces are exposed. Adding a seventeenth
 *     requires a new ADR — every consumer must be extended in the same
 *     change.
 *   - Every operation declares typed request and response shapes via the
 *     generic `IpcOperation<Req, Res>` marker; the real value at runtime is
 *     an empty object — types are erased.
 *   - Zod runtime schemas for input validation live under
 *     `src/shared/ipc/schemas.ts`, keyed by `${namespace}.${op}`.
 *   - Business logic is out of scope for this transport layer; stubs
 *     uniformly return `not_implemented` (see `src/main/services/**`).
 */

/**
 * Marker type binding a request and response shape to an operation name.
 * The runtime value is an empty object; the phantom type parameters exist
 * only so `typeof OP_NAMESPACES.system.getStatus` can be used to derive
 * `Req` / `Res` at compile time.
 */
export interface IpcOperation<_Req, _Res> {
  readonly __req?: _Req;
  readonly __res?: _Res;
}

// ---------------------------------------------------------------------------
// Namespace name tuple
// ---------------------------------------------------------------------------

/**
 * Every legal namespace name. Sixteen entries. `readonly [...] as const`
 * preserves the literal tuple type so consumers can derive
 * `NamespaceName` from `typeof OP_NAMESPACE_NAMES[number]`.
 *
 * The sixteenth namespace — `jobs` — carries the background-job control
 * plane (start, cancel, status) referenced by every long-running op.
 */
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

/** Union of every legal namespace name. */
export type NamespaceName = (typeof OP_NAMESPACE_NAMES)[number];

// ---------------------------------------------------------------------------
// Shared payload primitives
// ---------------------------------------------------------------------------

export interface EmptyInput {
  /* intentionally empty */
}

export interface EmptyOutput {
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
  /** Registered job kind (e.g. `sample-long-job`). */
  kind: string;
  /** Optional structured input passed to the job runner. */
  input?: unknown;
}

// ---------------------------------------------------------------------------
// Per-namespace op descriptor maps
// ---------------------------------------------------------------------------

export interface SystemOps {
  getStatus: IpcOperation<EmptyInput, SystemStatus>;
  getApiVersion: IpcOperation<EmptyInput, { apiVersion: string }>;
}

export interface SetupOps {
  getState: IpcOperation<EmptyInput, EmptyOutput>;
  complete: IpcOperation<EmptyInput, EmptyOutput>;
}

export interface GitOps {
  list: IpcOperation<EmptyInput, EmptyOutput>;
  status: IpcOperation<{ repoId: string }, EmptyOutput>;
}

export interface ProjectsOps {
  list: IpcOperation<EmptyInput, EmptyOutput>;
  create: IpcOperation<{ name: string }, EmptyOutput>;
  remove: IpcOperation<{ projectId: string }, EmptyOutput>;
}

export interface TodayOps {
  get: IpcOperation<EmptyInput, EmptyOutput>;
}

export interface DailiesOps {
  list: IpcOperation<EmptyInput, EmptyOutput>;
  create: IpcOperation<{ date: string }, EmptyOutput>;
}

export interface NewsOps {
  list: IpcOperation<EmptyInput, EmptyOutput>;
  refresh: IpcOperation<EmptyInput, EmptyOutput>;
}

export interface SearchOps {
  query: IpcOperation<{ q: string }, EmptyOutput>;
}

export interface DocsOps {
  list: IpcOperation<EmptyInput, EmptyOutput>;
  get: IpcOperation<{ docId: string }, EmptyOutput>;
}

export interface MeetingsOps {
  list: IpcOperation<EmptyInput, EmptyOutput>;
  create: IpcOperation<{ title: string }, EmptyOutput>;
}

export interface ReportsOps {
  list: IpcOperation<EmptyInput, EmptyOutput>;
  generate: IpcOperation<{ kind: string }, EmptyOutput>;
}

export interface PulseOps {
  get: IpcOperation<EmptyInput, EmptyOutput>;
}

export interface SupportOps {
  submit: IpcOperation<{ message: string }, EmptyOutput>;
}

export interface SettingsOps {
  get: IpcOperation<EmptyInput, EmptyOutput>;
  set: IpcOperation<{ key: string; value: unknown }, EmptyOutput>;
}

export interface AiOps {
  chat: IpcOperation<{ prompt: string }, EmptyOutput>;
  embed: IpcOperation<{ text: string }, EmptyOutput>;
}

export interface JobsOps {
  start: IpcOperation<StartJobInput, JobHandle>;
  cancel: IpcOperation<JobIdInput, EmptyOutput>;
  status: IpcOperation<JobIdInput, EmptyOutput>;
}

/**
 * Union of every op-map interface. Used internally by `OpsFor<N>`.
 */
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

/** Resolve the op-map interface for a specific namespace name. */
export type OpsFor<N extends NamespaceName> = Namespaces[N];

/** Union of every legal op name for a specific namespace. */
export type OpName<N extends NamespaceName> = keyof OpsFor<N> & string;

// ---------------------------------------------------------------------------
// Runtime descriptor: names only (types erased)
// ---------------------------------------------------------------------------

/**
 * Runtime descriptor mapping each namespace name to the list of its op
 * names. Consumers (the router, the doc generator, the contract tests)
 * iterate this to enumerate every registered handler.
 *
 * Keep in perfect sync with the per-namespace `*Ops` interfaces above —
 * the contract tests assert parity.
 */
export const OP_NAMESPACES: {
  readonly [N in NamespaceName]: readonly (keyof Namespaces[N] & string)[];
} = {
  system: ['getStatus', 'getApiVersion'],
  setup: ['getState', 'complete'],
  git: ['list', 'status'],
  projects: ['list', 'create', 'remove'],
  today: ['get'],
  dailies: ['list', 'create'],
  news: ['list', 'refresh'],
  search: ['query'],
  docs: ['list', 'get'],
  meetings: ['list', 'create'],
  reports: ['list', 'generate'],
  pulse: ['get'],
  support: ['submit'],
  settings: ['get', 'set'],
  ai: ['chat', 'embed'],
  jobs: ['start', 'cancel', 'status'],
};

/**
 * Fully qualified operation id (`namespace.op`). Used as the IPC channel
 * name and as the key into the Zod schema registry.
 */
export type QualifiedOpId = `${NamespaceName}.${string}`;

/** Build a qualified op id from its parts. */
export function qualifyOp<N extends NamespaceName>(
  namespace: N,
  op: OpName<N>,
): QualifiedOpId {
  return `${namespace}.${op}` as QualifiedOpId;
}
