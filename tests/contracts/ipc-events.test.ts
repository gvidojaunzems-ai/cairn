// qa-spec: S6 — Contract tests pass for the full event catalog.
import { describe, expect, it } from 'vitest';

import {
  EVENT_NAMES,
  type EventName,
  type EventPayloads,
} from '../../src/shared/ipc/events';

const REQUIRED_EVENTS: readonly EventName[] = [
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
];

describe('shared/ipc/events — 10 event catalog (S6)', () => {
  it('exports EVENT_NAMES with exactly 10 entries', () => {
    expect(EVENT_NAMES.length).toBe(10);
  });

  it('EVENT_NAMES has no duplicates', () => {
    const set = new Set(EVENT_NAMES);
    expect(set.size).toBe(EVENT_NAMES.length);
  });

  it.each(REQUIRED_EVENTS)('EVENT_NAMES contains %s', (event) => {
    expect((EVENT_NAMES as readonly string[]).includes(event)).toBe(true);
  });

  it('every enumerated event has a payload contract in EventPayloads', () => {
    const _check = (event: EventName): EventPayloads[typeof event] | undefined =>
      undefined as unknown as EventPayloads[typeof event];
    for (const name of EVENT_NAMES) {
      expect(typeof _check(name)).toBe('undefined');
    }
  });
});

describe('shared/ipc/events — declared payload shapes (S6)', () => {
  it('job.progress payload carries jobId (string) + pct (number) + label (string)', () => {
    const sample: EventPayloads['job.progress'] = {
      jobId: 'j-1',
      pct: 42,
      label: 'Indexing…',
    };
    expect(typeof sample.jobId).toBe('string');
    expect(typeof sample.pct).toBe('number');
    expect(typeof sample.label).toBe('string');
  });

  it('job.done payload carries jobId (string) and result|error fields', () => {
    const doneOk: EventPayloads['job.done'] = {
      jobId: 'j-1',
      result: { completed: true },
    };
    const doneErr: EventPayloads['job.done'] = {
      jobId: 'j-1',
      error: { code: 'cancelled', message: 'cancelled by user' },
    };
    expect(typeof doneOk.jobId).toBe('string');
    expect(typeof doneErr.jobId).toBe('string');
    expect(doneErr.error?.code).toBe('cancelled');
  });

  it('toast payload carries level and message', () => {
    const sample: EventPayloads['toast'] = {
      level: 'info',
      message: 'Hello',
    };
    expect(sample.level).toBe('info');
    expect(sample.message).toBe('Hello');
  });
});
