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
import { simulateWhisperTranscribe, transcribeWithWhisperSidecar } from './whisper-sidecar.js';

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

export { simulateWhisperTranscribe } from './whisper-sidecar.js';

const PARTIAL_CHUNKS = [
  'Team sync on PoC vector search progress.',
  'Discussed sqlite-vec indexing and standup approval flow.',
  'Action: ship meeting listener with local STT sidecar.',
];

const sessions = new Map<string, LiveMeetingSession>();
const proposalStore = new Map<string, MeetingProposal[]>();
const sessionTimers = new Map<string, ReturnType<typeof setInterval>>();

export function createMeetingEngine(options: MeetingEngineOptions): MeetingEngine {
  const { meetingsDao, aiEngine, eventBus } = options;

  function clearSessionTimer(meetingId: string) {
    const timer = sessionTimers.get(meetingId);
    if (timer !== undefined) {
      clearInterval(timer);
      sessionTimers.delete(meetingId);
    }
  }

  function feedPartialTranscript(meetingId: string, text: string) {
    const session = sessions.get(meetingId);
    if (session === undefined) return;
    session.transcript = `${session.transcript}\n${text}`.trim();
    eventBus.emit('meeting.partial', { meetingId, text });
  }

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

      let chunkIndex = 0;
      const timer = setInterval(() => {
        const live = sessions.get(id);
        if (live === undefined || !live.recording || chunkIndex >= PARTIAL_CHUNKS.length) {
          clearSessionTimer(id);
          return;
        }
        feedPartialTranscript(id, PARTIAL_CHUNKS[chunkIndex] ?? '');
        chunkIndex += 1;
      }, 2500);
      sessionTimers.set(id, timer);

      return session;
    },

    stop(meetingId) {
      const session = sessions.get(meetingId);
      if (session === undefined) {
        return errResult(makeError('not_found', 'Meeting session not found'));
      }
      clearSessionTimer(meetingId);
      session.recording = false;
      if (session.transcript.length === 0) {
        session.transcript = transcribeWithWhisperSidecar(Buffer.alloc(0));
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

    feedPartialTranscript,

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
  for (const timer of sessionTimers.values()) {
    clearInterval(timer);
  }
  sessionTimers.clear();
  sessions.clear();
  proposalStore.clear();
}
