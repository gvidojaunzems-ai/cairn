/**
 * Meeting engine — STT simulation, live session, proposals, extract.
 *
 * Meeting audio stays on-device and is discarded after transcription.
 */
import { randomUUID } from 'node:crypto';

import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import type { MeetingsDao } from '../db/dao/meetings.js';
import type { EventBus } from '../ipc/event-bus.js';
import { errResult, makeError, okResult } from '../ipc/errors.js';
import type { AiEngine } from './ai-engine.js';

export interface MeetingProposal {
  id: string;
  kind: 'action_item' | 'decision' | 'note';
  text: string;
}

export interface LiveMeetingSession {
  id: string;
  title: string;
  recording: boolean;
  transcript: string;
  startedAt: string;
}

export interface MeetingEngineOptions {
  meetingsDao: MeetingsDao;
  aiEngine: AiEngine;
  eventBus: EventBus;
}

export interface MeetingEngine {
  start(title: string, projectId?: string): LiveMeetingSession;
  stop(meetingId: string): CoreServiceResult<{ id: string; summary: string }>;
  getLive(meetingId: string): LiveMeetingSession | null;
  getProposals(meetingId: string): MeetingProposal[];
  applyProposal(meetingId: string, proposalId: string): CoreServiceResult<{ applied: boolean }>;
  applyAll(meetingId: string): CoreServiceResult<{ applied: number }>;
  feedPartialTranscript(meetingId: string, text: string): void;
  extract(meetingId: string): Promise<CoreServiceResult<{ summary: string; proposals: MeetingProposal[] }>>;
}

export function simulateWhisperTranscribe(_audioBuffer: Buffer): string {
  return 'Team discussed PoC progress, vector index milestones, and standup workflow.';
}

const sessions = new Map<string, LiveMeetingSession>();
const proposalStore = new Map<string, MeetingProposal[]>();

export function createMeetingEngine(options: MeetingEngineOptions): MeetingEngine {
  const { meetingsDao, aiEngine, eventBus } = options;

  return {
    start(title, projectId) {
      const id = `meeting-${randomUUID().slice(0, 8)}`;
      const startedAt = new Date().toISOString();
      const session: LiveMeetingSession = {
        id,
        title,
        recording: true,
        transcript: '',
        startedAt,
      };
      sessions.set(id, session);
      proposalStore.set(id, []);
      meetingsDao.upsert({
        id,
        title,
        projectId: projectId ?? null,
        attendeeIds: [],
        startedAt,
        createdAt: startedAt,
        updatedAt: startedAt,
      });
      return session;
    },

    stop(meetingId) {
      const session = sessions.get(meetingId);
      if (session === undefined) {
        return errResult(makeError('not_found', 'Meeting session not found'));
      }
      session.recording = false;
      if (session.transcript.length === 0) {
        session.transcript = simulateWhisperTranscribe(Buffer.alloc(0));
      }
      const endedAt = new Date().toISOString();
      meetingsDao.upsert({
        id: meetingId,
        title: session.title,
        attendeeIds: [],
        outcome: session.transcript.slice(0, 500),
        startedAt: session.startedAt,
        endedAt,
        createdAt: session.startedAt,
        updatedAt: endedAt,
      });
      return okResult({ id: meetingId, summary: session.transcript.slice(0, 200) });
    },

    getLive(meetingId) {
      return sessions.get(meetingId) ?? null;
    },

    getProposals(meetingId) {
      return proposalStore.get(meetingId) ?? [];
    },

    applyProposal(meetingId, proposalId) {
      const items = proposalStore.get(meetingId) ?? [];
      const item = items.find((p) => p.id === proposalId);
      if (item === undefined) {
        return errResult(makeError('not_found', 'Proposal not found'));
      }
      if (item.kind === 'action_item') {
        const ts = new Date().toISOString();
        meetingsDao.upsertActionItem({
          id: proposalId,
          meetingId,
          description: item.text,
          status: 'open',
          createdAt: ts,
          updatedAt: ts,
        });
      }
      return okResult({ applied: true });
    },

    applyAll(meetingId) {
      const items = proposalStore.get(meetingId) ?? [];
      let applied = 0;
      const ts = new Date().toISOString();
      for (const item of items) {
        if (item.kind === 'action_item') {
          meetingsDao.upsertActionItem({
            id: item.id,
            meetingId,
            description: item.text,
            status: 'open',
            createdAt: ts,
            updatedAt: ts,
          });
          applied += 1;
        }
      }
      return okResult({ applied });
    },

    feedPartialTranscript(meetingId, text) {
      const session = sessions.get(meetingId);
      if (session === undefined) return;
      session.transcript = `${session.transcript}\n${text}`.trim();
      eventBus.emit('meeting.partial', { meetingId, text });
    },

    async extract(meetingId) {
      const session = sessions.get(meetingId);
      const transcript = session?.transcript ?? '';
      const result = await aiEngine.complete({
        prompt: `Extract meeting summary, decisions, and action items from:\n\n${transcript}`,
        taskType: 'meeting.extract',
      });
      if (!result.ok) return result;

      let parsed: {
        summary?: string;
        actionItems?: { text: string; owner?: string }[];
        decisions?: string[];
      };
      try {
        parsed = JSON.parse(result.data.text) as typeof parsed;
      } catch {
        parsed = { summary: result.data.text };
      }

      const extracted: MeetingProposal[] = [];
      for (const d of parsed.decisions ?? []) {
        extracted.push({ id: randomUUID(), kind: 'decision', text: d });
      }
      for (const a of parsed.actionItems ?? []) {
        extracted.push({ id: randomUUID(), kind: 'action_item', text: a.text });
      }
      proposalStore.set(meetingId, extracted);
      eventBus.emit('meeting.proposals', {
        meetingId,
        items: extracted.map((p) => ({ id: p.id, kind: p.kind, text: p.text })),
      });

      return okResult({
        summary: parsed.summary ?? result.data.text,
        proposals: extracted,
      });
    },
  };
}

/** Reset in-memory session state between tests. */
export function resetMeetingEngineForTests(): void {
  sessions.clear();
  proposalStore.clear();
}
