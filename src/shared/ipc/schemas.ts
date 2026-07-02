/**
 * Zod input schemas — one entry per Spec 03 `namespace.op` (ADR 0007).
 */
import { z } from 'zod';

import { OP_NAMESPACES, type NamespaceName, type QualifiedOpId } from './operations.js';

export const EMPTY_INPUT = z.object({}).strict();

const id = z.string().min(1);
const status = z.string().min(1);

export const IPC_INPUT_SCHEMAS = {
  'system.getStatus': EMPTY_INPUT,
  'system.getFlags': EMPTY_INPUT,
  'system.getPaths': EMPTY_INPUT,
  'system.openExternal': z.object({ url: z.string().url() }).strict(),
  'system.exportDiagnostics': EMPTY_INPUT,

  'setup.getState': EMPTY_INPUT,
  'setup.run': z.object({ step: z.string().optional() }).strict(),
  'setup.cancel': EMPTY_INPUT,

  'git.getSyncState': EMPTY_INPUT,
  'git.pull': EMPTY_INPUT,
  'git.push': EMPTY_INPUT,
  'git.listLocalRepos': EMPTY_INPUT,
  'git.addLocalRepo': z.object({ path: z.string().min(1) }).strict(),

  'projects.list': EMPTY_INPUT,
  'projects.get': z.object({ projectId: id }).strict(),
  'projects.create': z.object({ name: z.string().min(1), description: z.string().optional() }).strict(),
  'projects.updateCharter': z.object({ projectId: id, charter: z.unknown() }).strict(),
  'projects.setStatus': z.object({ projectId: id, status }).strict(),
  'projects.archive': z.object({ projectId: id }).strict(),
  'projects.generateRetro': z.object({ projectId: id }).strict(),

  'today.getDashboard': EMPTY_INPUT,
  'today.getContextResume': EMPTY_INPUT,
  'today.getStandupDraft': EMPTY_INPUT,
  'today.approveStandup': EMPTY_INPUT,
  'today.regenerateStandup': EMPTY_INPUT,

  'dailies.getPack': z.object({ date: z.string().optional() }).strict(),
  'dailies.getWipRadar': EMPTY_INPUT,
  'dailies.listActionItems': EMPTY_INPUT,
  'dailies.setActionItem': z.object({ id, status }).strict(),
  'dailies.nudgeUnpushed': z.object({ personId: id }).strict(),

  'news.listFeed': z.object({ topic: z.string().optional(), source: z.string().optional() }).strict(),
  'news.getItem': z.object({ itemId: id }).strict(),
  'news.save': z.object({ itemId: id }).strict(),
  'news.listKnowledge': EMPTY_INPUT,

  'search.query': z.object({ q: z.string().min(1), limit: z.number().int().positive().optional() }).strict(),
  'search.askDocs': z
    .object({ q: z.string().min(1), docIds: z.array(z.string()).optional() })
    .strict(),

  'docs.tree': EMPTY_INPUT,
  'docs.get': z.object({ docId: id }).strict(),
  'docs.create': z
    .object({ title: z.string().min(1), group: z.string().min(1), body: z.string().optional() })
    .strict(),
  'docs.save': z
    .object({ docId: id, body: z.string(), title: z.string().optional() })
    .strict(),
  'docs.syncRepos': EMPTY_INPUT,
  'docs.listDrafts': EMPTY_INPUT,

  'meetings.start': z.object({ title: z.string().min(1), consent: z.boolean() }).strict(),
  'meetings.stop': EMPTY_INPUT,
  'meetings.getLive': EMPTY_INPUT,
  'meetings.getProposals': z.object({ meetingId: id }).strict(),
  'meetings.applyProposal': z.object({ meetingId: id, proposalId: id }).strict(),
  'meetings.applyAll': z.object({ meetingId: id }).strict(),
  'meetings.get': z.object({ meetingId: id }).strict(),

  'reports.templates': EMPTY_INPUT,
  'reports.generate': z
    .object({ kind: z.string().min(1), external: z.boolean().optional() })
    .strict(),
  'reports.export': z
    .object({ reportId: id, format: z.enum(['md', 'docx', 'pdf']) })
    .strict(),
  'reports.pushToRepo': z.object({ reportId: id }).strict(),

  'pulse.get': EMPTY_INPUT,
  'pulse.generateWeeklyDigest': EMPTY_INPUT,

  'support.listApps': EMPTY_INPUT,
  'support.getApp': z.object({ appId: id }).strict(),
  'support.listTickets': z.object({ status: z.string().optional() }).strict(),
  'support.triageTicket': z
    .object({ ticketId: id, assigneeId: z.string().optional() })
    .strict(),
  'support.resolveTicket': z.object({ ticketId: id, resolution: z.string().min(1) }).strict(),

  'settings.get': EMPTY_INPUT,
  'settings.set': z.object({ key: z.string().min(1), value: z.unknown() }).strict(),
  'settings.testConnector': z.object({ connector: z.string().min(1) }).strict(),
  'settings.getBudget': EMPTY_INPUT,

  'ai.complete': z
    .object({
      taskType: z.string().min(1),
      inputs: z.unknown(),
      qualityTier: z.enum(['fast', 'polished']).optional(),
      external: z.boolean().optional(),
    })
    .strict(),
  'ai.estimate': z.object({ taskType: z.string().min(1), inputs: z.unknown() }).strict(),
  'ai.listModels': EMPTY_INPUT,
  'ai.getBudget': EMPTY_INPUT,

  'jobs.start': z.object({ kind: z.string().min(1), input: z.unknown().optional() }).strict(),
  'jobs.cancel': z.object({ jobId: id }).strict(),
  'jobs.status': z.object({ jobId: id }).strict(),
} as const satisfies Record<string, z.ZodTypeAny>;

export type RegisteredOpId = keyof typeof IPC_INPUT_SCHEMAS;

export function getInputSchema(id: QualifiedOpId): z.ZodTypeAny | undefined {
  return (IPC_INPUT_SCHEMAS as Record<string, z.ZodTypeAny>)[id];
}

export function enumerateQualifiedOpIds(): readonly QualifiedOpId[] {
  const ids: QualifiedOpId[] = [];
  for (const namespace of Object.keys(OP_NAMESPACES) as NamespaceName[]) {
    for (const op of OP_NAMESPACES[namespace]) {
      ids.push(`${namespace}.${op}` as QualifiedOpId);
    }
  }
  return ids;
}
