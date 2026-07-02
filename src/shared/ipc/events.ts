/**
 * Server → UI event bus contract — Spec 03 catalog (ADR 0007).
 */
export const EVENT_NAMES = [
  'sync.updated',
  'job.progress',
  'job.done',
  'signals.updated',
  'news.updated',
  'budget.updated',
  'meeting.partial',
  'meeting.proposals',
  'setup.progress',
  'toast',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export interface SyncUpdatedEvent {
  entityTypes?: readonly string[];
  at: string;
}

export interface JobProgressEvent {
  jobId: string;
  pct: number;
  label: string;
}

export interface JobDoneEvent {
  jobId: string;
  result?: unknown;
  error?: { code: string; message: string };
}

export interface SignalsUpdatedEvent {
  date: string;
}

export interface NewsUpdatedEvent {
  count: number;
}

export interface BudgetUpdatedEvent {
  used: number;
  cap: number;
}

export interface MeetingPartialEvent {
  meetingId: string;
  text: string;
}

export interface MeetingProposalsEvent {
  meetingId: string;
  items: readonly { id: string; kind: string; text: string }[];
}

export interface SetupProgressEvent {
  step: string;
  pct: number;
  label: string;
}

export interface ToastEvent {
  level: 'info' | 'warn' | 'error';
  message: string;
  detail?: string;
}

export interface EventPayloads {
  'sync.updated': SyncUpdatedEvent;
  'job.progress': JobProgressEvent;
  'job.done': JobDoneEvent;
  'signals.updated': SignalsUpdatedEvent;
  'news.updated': NewsUpdatedEvent;
  'budget.updated': BudgetUpdatedEvent;
  'meeting.partial': MeetingPartialEvent;
  'meeting.proposals': MeetingProposalsEvent;
  'setup.progress': SetupProgressEvent;
  'toast': ToastEvent;
}

export type EventHandler<E extends EventName> = (payload: EventPayloads[E]) => void;
