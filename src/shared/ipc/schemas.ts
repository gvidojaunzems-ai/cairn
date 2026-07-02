/**
 * Zod input schemas — one entry per `namespace.op` pair.
 *
 * Business rules:
 *   - Every operation declared in `operations.ts` MUST have a schema
 *     here, even if the input is empty (`z.object({}).strict()`). The
 *     contract tests assert exhaustive coverage.
 *   - Zod imports are permitted here (this file is the single canonical
 *     home for runtime schemas). They are FORBIDDEN in `src/contracts/**`
 *     and in the renderer — that boundary is guarded by the architecture
 *     lint test.
 *   - Schemas stay flat and cheap to parse — validators run on every IPC
 *     call and must not blow the sub-100ms round-trip budget for
 *     `system.getStatus`.
 */
import { z } from 'zod';

import { OP_NAMESPACES, type NamespaceName, type QualifiedOpId } from './operations.js';

/**
 * Empty-object schema shared by every op whose input is `{}`. Kept as a
 * single instance so tests can identify the "no input" case by
 * reference identity.
 */
export const EMPTY_INPUT = z.object({}).strict();

// ---------------------------------------------------------------------------
// Per-op input schemas
// ---------------------------------------------------------------------------

// system.*
const systemGetStatusInput = EMPTY_INPUT;
const systemGetApiVersionInput = EMPTY_INPUT;

// setup.*
const setupGetStateInput = EMPTY_INPUT;
const setupCompleteInput = EMPTY_INPUT;

// git.*
const gitListInput = EMPTY_INPUT;
const gitStatusInput = z.object({ repoId: z.string().min(1) }).strict();

// projects.*
const projectsListInput = EMPTY_INPUT;
const projectsCreateInput = z.object({ name: z.string().min(1) }).strict();
const projectsRemoveInput = z.object({ projectId: z.string().min(1) }).strict();

// today.*
const todayGetInput = EMPTY_INPUT;

// dailies.*
const dailiesListInput = EMPTY_INPUT;
const dailiesCreateInput = z.object({ date: z.string().min(1) }).strict();

// news.*
const newsListInput = EMPTY_INPUT;
const newsRefreshInput = EMPTY_INPUT;

// search.*
const searchQueryInput = z.object({ q: z.string().min(1) }).strict();

// docs.*
const docsListInput = EMPTY_INPUT;
const docsGetInput = z.object({ docId: z.string().min(1) }).strict();

// meetings.*
const meetingsListInput = EMPTY_INPUT;
const meetingsCreateInput = z.object({ title: z.string().min(1) }).strict();

// reports.*
const reportsListInput = EMPTY_INPUT;
const reportsGenerateInput = z.object({ kind: z.string().min(1) }).strict();

// pulse.*
const pulseGetInput = EMPTY_INPUT;

// support.*
const supportSubmitInput = z.object({ message: z.string().min(1) }).strict();

// settings.*
const settingsGetInput = EMPTY_INPUT;
const settingsSetInput = z
  .object({ key: z.string().min(1), value: z.unknown() })
  .strict();

// ai.*
const aiChatInput = z.object({ prompt: z.string().min(1) }).strict();
const aiEmbedInput = z.object({ text: z.string().min(1) }).strict();

// jobs.*
const jobsStartInput = z
  .object({ kind: z.string().min(1), input: z.unknown().optional() })
  .strict();
const jobsCancelInput = z.object({ jobId: z.string().min(1) }).strict();
const jobsStatusInput = z.object({ jobId: z.string().min(1) }).strict();

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Registry of Zod schemas keyed by qualified op id (`namespace.op`).
 * Every entry declared in `OP_NAMESPACES` must appear here — the
 * contract tests fail loud on missing keys.
 */
export const IPC_INPUT_SCHEMAS = {
  'system.getStatus': systemGetStatusInput,
  'system.getApiVersion': systemGetApiVersionInput,

  'setup.getState': setupGetStateInput,
  'setup.complete': setupCompleteInput,

  'git.list': gitListInput,
  'git.status': gitStatusInput,

  'projects.list': projectsListInput,
  'projects.create': projectsCreateInput,
  'projects.remove': projectsRemoveInput,

  'today.get': todayGetInput,

  'dailies.list': dailiesListInput,
  'dailies.create': dailiesCreateInput,

  'news.list': newsListInput,
  'news.refresh': newsRefreshInput,

  'search.query': searchQueryInput,

  'docs.list': docsListInput,
  'docs.get': docsGetInput,

  'meetings.list': meetingsListInput,
  'meetings.create': meetingsCreateInput,

  'reports.list': reportsListInput,
  'reports.generate': reportsGenerateInput,

  'pulse.get': pulseGetInput,

  'support.submit': supportSubmitInput,

  'settings.get': settingsGetInput,
  'settings.set': settingsSetInput,

  'ai.chat': aiChatInput,
  'ai.embed': aiEmbedInput,

  'jobs.start': jobsStartInput,
  'jobs.cancel': jobsCancelInput,
  'jobs.status': jobsStatusInput,
} as const satisfies Record<string, z.ZodTypeAny>;

/** Fully qualified op id enumerated in the registry. */
export type RegisteredOpId = keyof typeof IPC_INPUT_SCHEMAS;

/** Retrieve the schema for a fully qualified op id. Returns `undefined` for unknown ids. */
export function getInputSchema(id: QualifiedOpId): z.ZodTypeAny | undefined {
  const registry = IPC_INPUT_SCHEMAS as Record<string, z.ZodTypeAny>;
  return registry[id];
}

/**
 * Enumerate every `${namespace}.${op}` qualified id declared in
 * `OP_NAMESPACES`. The runtime function exists so tests can compare
 * the operation registry against the schema registry without
 * duplicating string literals.
 */
export function enumerateQualifiedOpIds(): readonly QualifiedOpId[] {
  const ids: QualifiedOpId[] = [];
  for (const namespace of Object.keys(OP_NAMESPACES) as NamespaceName[]) {
    const ops = OP_NAMESPACES[namespace];
    for (const op of ops) {
      ids.push(`${namespace}.${op}` as QualifiedOpId);
    }
  }
  return ids;
}
