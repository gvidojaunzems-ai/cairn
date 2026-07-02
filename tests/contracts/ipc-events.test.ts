// qa-spec: S6 — Contract tests pass for the full event catalog.
// Asserts the shared IPC event descriptor layer:
//   * `EVENT_NAMES` contains exactly 10 event names.
//   * Every declared event carries a documented payload shape via
//     `EventPayloads`.
//   * The payload contracts for `job.progress` and `job.done` include the
//     fields observed by S2/S3 (jobId, pct, label / jobId, result|error).
import { describe, expect, it } from 'vitest';

import {
  EVENT_NAMES,
  type EventName,
  type EventPayloads,
} from '../../src/shared/ipc/events';

/** The 10 events enumerated by the assignment overview / existing scaffold. */
const REQUIRED_EVENTS: readonly EventName[] = [
  'job.progress',
  'job.done',
  'job.cancelled',
  'system.ready',
  'system.error',
  'settings.changed',
  'projects.changed',
  'sync.progress',
  'sync.done',
  'notification.emit',
];

describe('shared/ipc/events — 10 event catalog (S6)', () => {
  // qa-spec: S6
  it('exports EVENT_NAMES with exactly 10 entries', () => {
    expect(EVENT_NAMES.length).toBe(10);
  });

  // qa-spec: S6
  it('EVENT_NAMES has no duplicates', () => {
    const set = new Set(EVENT_NAMES);
    expect(set.size).toBe(EVENT_NAMES.length);
  });

  // qa-spec: S6 — every documented event name must be present.
  it.each(REQUIRED_EVENTS)('EVENT_NAMES contains %s', (event) => {
    expect((EVENT_NAMES as readonly string[]).includes(event)).toBe(true);
  });

  // qa-spec: S6 — every enumerated name must have a payload declaration.
  it('every enumerated event has a payload contract in EventPayloads', () => {
    // Compile-time: this line is verified by tsc — it asserts that
    // `EventPayloads` is indexable by every entry in EVENT_NAMES.
    const _check = (event: EventName): EventPayloads[typeof event] | undefined =>
      undefined as unknown as EventPayloads[typeof event];
    for (const name of EVENT_NAMES) {
      // Runtime: just prove we can reference the mapping symbol without
      // throwing. This is intentionally minimal — the compile-time check
      // above is the real assertion.
      expect(typeof _check(name)).toBe('undefined');
    }
  });
});

describe('shared/ipc/events — declared payload shapes (S6)', () => {
  // qa-spec: S6 — job.progress payload
  it('job.progress payload carries jobId (string) + pct (number) + label (string)', () => {
    // Type-only smoke assertion — construct a value that must satisfy the
    // declared payload. If any field is missing / renamed / retyped the
    // test file fails to compile (assertion failure at type-check time).
    const sample: EventPayloads['job.progress'] = {
      jobId: 'j-1',
      pct: 42,
      label: 'Indexing…',
    };
    expect(typeof sample.jobId).toBe('string');
    expect(typeof sample.pct).toBe('number');
    expect(typeof sample.label).toBe('string');
  });

  // qa-spec: S6 — job.done payload carries jobId and either result or error
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

  // qa-spec: S6 — notification payload has {level, message}
  it('notification.emit payload carries level and message', () => {
    const sample: EventPayloads['notification.emit'] = {
      level: 'info',
      message: 'Hello',
    };
    expect(sample.level).toBe('info');
    expect(sample.message).toBe('Hello');
  });
});
